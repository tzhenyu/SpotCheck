from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
from google import genai
import os
import re
import datetime
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor


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

# Configure Gemini API with API key
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.error("GEMINI_API_KEY environment variable not set")
    raise ValueError("GEMINI_API_KEY environment variable is required")

# Initialize Gemini model name
gemini_model = "gemini-2.0-flash"

# Create data models
class CommentData(BaseModel):
    comments: List[str]
    metadata: List[Dict] = None
    prompt: Optional[str] = None

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

@app.get("/")
async def root():
    """Root endpoint to verify API is running"""
    logger.info("Root endpoint called")
    response = JSONResponse({"status": "API is running"})
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

async def analyze_comment_with_gemini(comment: str) -> Dict:
    """Process a single comment with Gemini API"""
    try:
        prompt = f"Review: '{comment}'\nIs this review real or fake? Respond with 'REAL' or 'FAKE' following reason in 15 words."
        
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=gemini_model, 
            contents=prompt
        )
        
        result_text = response.text.strip()
        is_fake = "fake" in result_text.lower()
        
        return {
            "comment": comment[:50] + "..." if len(comment) > 50 else comment,
            "is_fake": is_fake,
            "explanation": result_text
        }
    except Exception as e:
        logger.error(f"Error analyzing comment with Gemini: {str(e)}")
        return {
            "comment": comment[:50] + "..." if len(comment) > 50 else comment,
            "is_fake": None,
            "explanation": f"Error: {str(e)}"
        }

async def analyze_comments_batch(comments: List[str], api_key: str = None, product_name: str = None, prompt: str = None) -> List[Dict]:
    """Process multiple comments in a single Gemini API call with optional API key and product context"""
    try:
        # Use provided API key or use the default one
        current_api_key = api_key if api_key is not None else API_KEY
        
        # Initialize Gemini client with the selected API key
        temp_client = genai.Client(api_key=current_api_key)
        
        # Format all comments into a single prompt
        full_prompt = prompt if prompt else ""
        
        # Add product context if available
        if product_name and not prompt:
            full_prompt += f"Product name: {product_name}\n"
            
        # Base analysis instructions
        if not prompt:
            full_prompt += "Analyze each product review below and determine if it's real or fake.\n"
            full_prompt += "For each review, respond with REAL or FAKE followed by a brief explanation (15 words max).\n"
            full_prompt += "Format your response as numbered list matching the order of reviews:\n\n"
            for i, comment in enumerate(comments, 1):
                full_prompt += f"{i}. Review: '{comment}'\n"
        else:
            for i, comment in enumerate(comments, 1):
                full_prompt += f"{i}. Review: '{comment}'\n"
        
        # Make a single API call for all comments
        response = await asyncio.to_thread(
            temp_client.models.generate_content,
            model=gemini_model,
            contents=full_prompt
        )
        
        try:
            result_text = response.candidates[0].content.parts[0].text.strip()
        except Exception as e:
            logger.error(f"Gemini API response parsing error: {str(e)} | Raw response: {response}")
            return [
                {
                    "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                    "is_fake": None,
                    "explanation": f"Gemini API response parsing error: {str(e)}"
                }
                for comment in comments
            ]
        
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
                explanation = result_line
                explanation = re.sub(r'^\d+\.\s*', '', explanation)
                if is_fake:
                    explanation = re.sub(r'^(FAKE|Fake|fake):\s*', '', explanation)
                else:
                    explanation = re.sub(r'^(REAL|Real|real):\s*', '', explanation)
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
        logger.error(f"Error in batch analysis with Gemini: {str(e)}")
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
    """Process comments from Shopee with Gemini API"""
    logger.info(f"Received {len(data.comments)} comments")
    
    # Process up to 6 comments to avoid rate limits
    comments_to_process = data.comments[:6]
    prompt = data.prompt
    if len(comments_to_process) <= 1:
        # For single comment, use the individual processing
        results = []
        for comment in comments_to_process:
            logger.info(f"Analyzing individual comment: {comment[:50]}...")
            result = await analyze_comment_with_gemini(comment)
            results.append(result)
    else:
        # For multiple comments, use batch processing
        logger.info(f"Batch analyzing {len(comments_to_process)} comments...")
        if prompt:
            results = await analyze_comments_batch(comments_to_process, product_name=None, api_key=None, prompt=prompt)
        else:
            results = await analyze_comments_batch(comments_to_process, product_name="Shopee Product")
    
    logger.info(f"Completed analysis of {len(results)} comments")
    return {
        "message": f"Processed {len(results)} comments", 
        "results": results
    }


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on http://127.0.0.1:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)