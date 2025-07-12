from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
import os
import re
import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import requests
import uvicorn
from sentence_transformers import SentenceTransformer

print("Loading embedding model, please hold!")
model = SentenceTransformer("all-MiniLM-L6-v2")

# Load environment variables from .env file
load_dotenv()

# Database configuration
DB_CONFIG = {
    "database": "local_futurehack",
    "host": "localhost",
    "user": "zhenyu",
    "password": "123123",
    "port": "5432"
}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def clean_timestamp(timestamp_str):
    """
    Clean and format timestamp string for PostgreSQL.
    Extracts proper timestamp from various string formats.
    Returns None for invalid formats.
    """
    if not timestamp_str:
        return None
        
    # Extract timestamp in format YYYY-MM-DD HH:MM
    timestamp_match = re.search(r'(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})', timestamp_str)
    if timestamp_match:
        # Return PostgreSQL-compatible timestamp
        try:
            timestamp = timestamp_match.group(1)
            # Validate by parsing
            datetime.datetime.strptime(timestamp, '%Y-%m-%d %H:%M')
            return timestamp
        except ValueError:
            return None
    
    return None

# Create data models
class CommentData(BaseModel):
    comments: List[str]
    metadata: List[Dict] = None
    prompt: Optional[str] = None
    product: Optional[str] = None

class Query(BaseModel):
    text: str


# Create FastAPI application
app = FastAPI()

# Add custom middleware to add CORS headers to every response
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Also keep the CORS middleware for standard handling
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.post("/embed")
async def embed(query: Query):
    embedding = model.encode(query.text).tolist()
    return {"embedding": embedding}
@app.get("/")
async def root():
    """Root endpoint to verify API is running"""
    logger.info("Root endpoint called")
    response = JSONResponse({"status": "API is running"})
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

async def analyze_comments_batch_ollama(comments: List[str], prompt: str = None, product: str = None) -> List[Dict]:
    """Process multiple comments in a single Ollama API call"""
    try:
        base_prompt = prompt if prompt else (
            
        )
        system_prompt = """
        You are a fake review evaluator for e-commerce.\n\n
        Given a product and several Shopee reviews, classify each review as:\n
        - Genuine: Relevant, product-specific, likely from a real user.\n
        - Suspicious: Repetitive, vague, overly positive, or possibly AI-generated.\n
        - Not Relevant: Unrelated to the product.\n\n
        Respond with a numbered list using this format:\n
        1. <Verdict> - (Short reason)\n
        Keep reasons under 15 words. Don’t repeat review text. 
        Do not flag review as suspicious just because it used other language.      
        """
        if product:
            base_prompt += f"Product: {product}\n"
        for i, comment in enumerate(comments, 1):
            base_prompt += f"{i}. Review: '{comment}'\n"
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3",
                "prompt": base_prompt,
                "system": system_prompt,
                "stream": False
            },
            timeout=60
        )
        # print(base_prompt)
        response.raise_for_status()
        result_json = response.json()
        result_text = result_json.get("response", "").strip()
        lines = [line.strip() for line in result_text.split('\n') if line.strip()]
        results = []
        comment_map = {}
        for line in lines:
            for i in range(1, len(comments) + 1):
                if line.startswith(f"{i}."):
                    comment_map[i-1] = line
                    break
        for idx, comment in enumerate(comments):
            if idx in comment_map:
                result_line = comment_map[idx]
                is_fake = "fake" in result_line.lower()
                explanation = re.sub(r'^\d+\.\s*', '', result_line)
                explanation = explanation.strip()
            else:
                logger.error(f"No matching line for comment index {idx}: {comment}")
                is_fake = None
                explanation = "No analysis result returned for this comment"
            results.append({
                "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                "is_fake": is_fake,
                "explanation": explanation
            })
        return results
    except Exception as e:
        logger.error(f"Error in batch analysis with Ollama: {str(e)}")
        return [
            {
                "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                "is_fake": None,
                "explanation": f"Batch analysis error: {str(e)}"
            }
            for comment in comments
        ]

def get_db_connection():
    """Establish a connection to the PostgreSQL database"""
    try:
        conn = psycopg2.connect(
            database=DB_CONFIG["database"],
            host=DB_CONFIG["host"],
            user=DB_CONFIG["user"],
            password=DB_CONFIG["password"],
            port=DB_CONFIG["port"],
            cursor_factory=RealDictCursor  # Returns results as dictionaries
        )
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)}")
        raise

@app.get("/upload")
async def upload_data():
    """Endpoint to fetch authors from the database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM authors;")
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"message": "Data retrieved successfully", "authors": results}
    except Exception as e:
        logger.error(f"Error fetching authors: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"message": f"Database error: {str(e)}"}
        )

@app.post("/comments")
async def process_comments(data: CommentData):
    """Store comments from Shopee in PostgreSQL database"""
    logger.info(f"Received {len(data.comments)} comments")
    
    # Only store metadata if provided, without Gemini processing
    if data.metadata and len(data.metadata) > 0:
        logger.info(f"Storing {len(data.metadata)} comments in database")
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Create a more efficient bulk insert
            insert_values = []
            for item in data.metadata:
                # Clean and format the timestamp for database insertion
                raw_timestamp = item.get('timestamp')
                clean_ts = clean_timestamp(raw_timestamp)
                
                insert_values.append((
                    item.get('comment'), 
                    item.get('username'), 
                    item.get('rating'), 
                    item.get('source'), 
                    item.get('product'), 
                    clean_ts  # Use cleaned timestamp
                ))
            
            # Use executemany for better performance with large datasets
            # Filter out rows with NULL timestamps to avoid database errors
            valid_values = [row for row in insert_values if row[5] is not None]
            
            if not valid_values:
                logger.warning("No valid timestamps found in any comments, skipping database insertion")
                return {
                    "message": "No valid timestamps found in comments, nothing stored", 
                    "total_stored": 0
                }
            
            cursor.executemany(
                """
                INSERT INTO product_reviews (comment, username, rating, source, product, page_timestamp)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """, 
                valid_values
            )
            
            conn.commit()
            cursor.close()
            conn.close()
            logger.info(f"Successfully stored {len(insert_values)} comments in database")
            
            return {
                "message": f"Successfully stored {len(insert_values)} comments in database", 
                "total_stored": len(insert_values)
            }
        except Exception as e:
            logger.error(f"Database error storing comments: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"message": f"Database error: {str(e)}"}
            )
    else:
        return {
            "message": "No metadata provided for storage", 
            "total_stored": 0
        }

@app.post("/analyze")
async def analyze_comments(data: CommentData):
    logger.info(f"Received {len(data.comments)} comments")
    comments_to_process = data.comments[:6]
    prompt = data.prompt
    product = data.product
    logger.info(f"Batch analyzing {len(comments_to_process)} comments with Ollama...")
    results = await analyze_comments_batch_ollama(comments_to_process, prompt=prompt, product=product)
    logger.info(f"Completed analysis of {len(results)} comments")
    return {
        "message": f"Processed {len(results)} comments",
        "results": results
    }

def get_suspicious_comments_from_analysis(analysis_results: List[Dict]) -> List[Dict]:
    suspicious_comments = []
    for result in analysis_results:
        explanation = result.get("explanation", "")
        if explanation.lower().startswith("suspicious"):
            verdict, sep, reason = explanation.partition("- ")
            suspicious_comments.append({
                "comment": result.get("comment"),
                "verdict": verdict.strip(),
                "reason": reason.strip() if sep else ""
            })
    return suspicious_comments

def semantic_search_postgres(query: str, top_n: 5):
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres.your-tenant-id",
            password="your-super-secret-and-long-postgres-password",
            host="localhost",
            port="5432"
        )
        cur = conn.cursor()

        # Load model and encode query
        query_embedding = embed(query)

        # Perform the SQL query directly on the table using pgvector
        cur.execute(
            """
            SELECT id, comment, username, rating,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM product_reviews
            ORDER BY embedding <=> %s::vector
            LIMIT %s;
            """,
            (query_embedding, query_embedding, top_n)
        )

        results = cur.fetchall()
        cur.close()
        conn.close()
        return results

    except Exception as error:
        print(f"Error during semantic search in Postgres: {error}, query: {query}, top_n: {top_n}")
        return None
    
if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on http://127.0.0.1:8001")
    uvicorn.run("backend:app", host="0.0.0.0", port=8001, reload=False)