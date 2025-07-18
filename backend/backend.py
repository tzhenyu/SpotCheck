from fastapi import FastAPI, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import re
import datetime
from dotenv import load_dotenv
import psycopg2
import requests
import uvicorn
from sentence_transformers import SentenceTransformer
from typing import List
import json
import requests
import os
import asyncio
from tqdm import tqdm
import importlib.metadata
import time
import os
import asyncio
from tqdm import tqdm
import importlib.metadata
import time
# from adam import agent_executor

model = SentenceTransformer("all-MiniLM-L6-v2")
print("Loading embedding model, please hold!")

# Load environment variables from .env file
load_dotenv()

#Constant for PostgreSQL statement

# ─── Constants ─────────────────────────────────────────────────────────────────
DUPLICATE_COMMENT_PRODUCT_THRESHOLD = 2
USER_FAST_REVIEW_COUNT = 3
USER_FAST_REVIEW_INTERVAL = "1 hour"
GENERIC_COMMENT_LENGTH = 40
GENERIC_COMMENT_PRODUCT_THRESHOLD = 3
HIGH_AVG_RATING = 5.0
HIGH_AVG_RATING_COUNT = 5


DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),  # Changed from USER to DB_USER to avoid system env variable conflict
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432))
}
table_name = os.getenv("TABLE_NAME")
llm_model = os.getenv("LLM_MODEL")
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Create data models
class CommentData(BaseModel):
    comments: List[str]
    metadata: List[Dict] = None
    prompt: Optional[str] = None
    product: Optional[str] = None
    usernames: Optional[List[str]] = None
    gemini_api_key: Optional[str] = None

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

@app.post("/comments")
async def process_comments(data: CommentData):
    """Store comments from Shopee in PostgreSQL database"""
    logger.info(f"Received {len(data.comments)} comments")
    
    # Extract Gemini API key from request
    gemini_api_key = data.gemini_api_key
    # Log receipt without exposing the actual key
    if gemini_api_key:
        masked_key = gemini_api_key[:4] + "****" + gemini_api_key[-4:] if len(gemini_api_key) > 8 else "****"
        logger.info(f"Gemini API key received: Yes (masked: {masked_key})")
    else:
        logger.warning("No Gemini API key provided in request")
    
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
            try:
                clean_postgresql_data(table_name)
                logger.info("clean_postgresql_data called after storing data")
            except Exception as e:
                logger.error(f"Error calling clean_postgresql_data: {str(e)}")
                
            # If gemini_api_key is provided, analyze comments in background
            if gemini_api_key:
                logger.info("Gemini API key provided, scheduling background analysis")
                # Create a background task for analysis (you can use FastAPI background tasks here)
                asyncio.create_task(analyze_comments_batch_ollama(
                    comments=data.comments, 
                    product=data.product, 
                    gemini_api_key=gemini_api_key
                ))
                
            return {
                "message": f"Successfully stored {len(insert_values)} comments in database", 
                "total_stored": len(insert_values),
                "analysis_scheduled": bool(gemini_api_key)
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
    start_time = time.time()
    logger.info(f"Received {len(data.comments)} comments for analysis")
    
    # Extract request parameters but don't log sensitive data
    comments_to_process = data.comments[:6]
    prompt = data.prompt
    product = data.product
    gemini_api_key = data.gemini_api_key
    
    # Mask API key in logs
    if gemini_api_key:
        masked_key = gemini_api_key[:4] + "****" + gemini_api_key[-4:] if len(gemini_api_key) > 8 else "****"
        logger.info(f"Gemini API key for analysis: Yes (masked: {masked_key})")
    else:
        logger.info("No Gemini API key provided for analysis")
        
    # Extract usernames if available
    usernames = [item.get("username") if isinstance(item, dict) else None for item in getattr(data, "metadata", [])[:6]] if data.metadata else [None]*len(comments_to_process)
    logger.info(f"Batch analyzing {len(comments_to_process)} comments")
    results = await analyze_comments_batch_ollama(comments_to_process, prompt=prompt, product=product, gemini_api_key=gemini_api_key)
    logger.info(f"Completed analysis of {len(results)} comments")
    for i, username in enumerate(usernames):
        if i < len(results):
            results[i]["username"] = username
    suspicious_comments = analyze_suspicious_comment(results)
    suspicious_comments_result = determine_review_genuinty(suspicious_comments)
    # Update suspicious_comments with verdict and explanation from suspicious_comments_result
    for idx, item in enumerate(suspicious_comments):
        if idx < len(suspicious_comments_result):
            item["verdict"] = suspicious_comments_result[idx].get("verdict")
            item["explanation"] = suspicious_comments_result[idx].get("explanation")
    # Update results with verdict/explanation for suspicious comments for browser consumption
    for res in results:
        for suspicious in suspicious_comments:
            if res.get("comment") == suspicious.get("comment"):
                res["verdict"] = suspicious.get("verdict")
                res["explanation"] = suspicious.get("explanation")
    elapsed = time.time() - start_time
    logger.info(f"analyze_comments completed in {elapsed:.2f} seconds for {len(comments_to_process)} comments")
    return {
        "message": f"Processed {len(results)} comments",
        "results": results,
        "suspicious_comments": suspicious_comments,
        "suspicious_comments_result": suspicious_comments_result
    }


async def analyze_comments_batch_ollama(comments: List[str], prompt: str = None, product: str = None, gemini_api_key: str = None) -> List[Dict]:
    start_time = time.time()
    try:
        base_prompt = prompt if prompt else ""
        system_prompt = (
            "You are a fake review evaluator for e-commerce.\n\n"
            "Given a product and several Shopee reviews, classify each review as:\n"
            "- Genuine: Relevant, product-specific, likely from a real user.\n"
            "- Suspicious: Repetitive, vague, overly positive, or possibly AI-generated.\n"
            "- Not Relevant: Unrelated to the product.\n\n"
            "Respond with a numbered list using this format:\n"
            "1. <Verdict> <Short reason>\n"
            "Keep reasons under 15 words. Do not repeat review text.\n"
            "Do not flag review as suspicious just because it used other language.\n"
            "Do not use parentheses in the response."
        )
        if product:
            base_prompt += f"Product: {product}\n"
        for i, comment in enumerate(comments, 1):
            base_prompt += f"{i}. Review: '{comment}'\n"
        if gemini_api_key:
            os.environ["GOOGLE_API_KEY"] = gemini_api_key
            try:
                from google import genai
                try:
                    genai_version = importlib.metadata.version("google-generativeai")
                    logger.info(f"Google Generative AI version: {genai_version}")
                except Exception as version_error:
                    logger.warning(f"Could not determine Google Generative AI version: {str(version_error)}")
                client = genai.Client()
                logger.info("Using Gemini Client API for analysis")
                response_gemini = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        {"role": "user", "parts": [{"text": system_prompt}]},
                        {"role": "user", "parts": [{"text": base_prompt}]}
                    ]
                )
                result_text = response_gemini.text.strip()
                logger.info("Successfully used model: gemini-2.5-flash")
                logger.info("Gemini analysis completed successfully")
            except Exception as e:
                logger.error(f"Error using Gemini API: {str(e)}")
                # Fall back to Ollama if Gemini fails
                logger.info("Falling back to Ollama due to Gemini error")
                response = requests.post(
                    "http://localhost:11434/api/generate",
                    json={
                        "model": llm_model,
                        "prompt": base_prompt,
                        "system": system_prompt,
                        "stream": False
                    },
                    timeout=60
                )
                response.raise_for_status()
                result_json = response.json()
                result_text = result_json.get("response", "").strip()
        else:
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": llm_model,
                    "prompt": base_prompt,
                    "system": system_prompt,
                    "stream": False
                },
                timeout=60
            )
            print("using ollama")
            response.raise_for_status()
            result_json = response.json()
            result_text = result_json.get("response", "").strip()
        lines = [line.strip() for line in result_text.split('\n') if line.strip()]
        print(f"LLM response raw text: {result_text}")
        results = []
        comment_map = {}
        # Try to match lines to comments by index, fallback to sequential assignment if no prefix match
        for i in range(len(comments)):
            # Prefer numbered prefix match
            matched = False
            for line in lines:
                if line.startswith(f"{i+1}."):
                    comment_map[i] = line
                    matched = True
                    break
            if not matched and i < len(lines):
                comment_map[i] = lines[i]
        for idx, comment in enumerate(comments):
            if idx in comment_map:
                result_line = comment_map[idx]
                is_fake = "fake" in result_line.lower() or "suspicious" in result_line.lower()
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
        elapsed = time.time() - start_time
        logger.info(f"analyze_comments_batch_ollama completed in {elapsed:.2f} seconds for {len(comments)} comments")
        return results
    except Exception as e:
        logger.error(f"Error in batch analysis with Ollama/Gemini: {str(e)}")
        elapsed = time.time() - start_time
        logger.info(f"analyze_comments_batch_ollama failed in {elapsed:.2f} seconds for {len(comments)} comments")
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
        logger.info(f"Attempting DB connection with config: {DB_CONFIG}")
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {str(e)} | Config: {DB_CONFIG}")
        raise

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


def semantic_search_postgres(query: str, top_n: int):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        query_embedding = model.encode(query).tolist()
        
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

########################## SEMANTIC FUNCTION

def analyze_suspicious_comment(analysis_results: List[Dict]) -> List[Dict]:
    suspicious_comments = []
    for idx, result in enumerate(analysis_results):
        explanation = result.get("explanation", "")
        if explanation.lower().startswith("suspicious"):
            verdict, sep, reason = explanation.partition("- ")
            username = result.get("username")
            # Try to get username from metadata if not present
            if not username and "metadata" in result and isinstance(result["metadata"], dict):
                username = result["metadata"].get("username")
            # Try to get username from batch metadata if available
            if not username and "usernames" in result:
                usernames_list = result["usernames"]
                if isinstance(usernames_list, list) and idx < len(usernames_list):
                    username = usernames_list[idx]
            # Try to get username from global batch if still missing
            if not username and "metadata" in result and isinstance(result["metadata"], list):
                if idx < len(result["metadata"]):
                    meta = result["metadata"][idx]
                    if isinstance(meta, dict):
                        username = meta.get("username")
            if not username:
                logger.warning(f"No username found for suspicious comment: {result.get('comment')}")
            semantic_analysis = suspicious_comment_semantic_search(result.get("comment"))
            behavioral_analysis = []
            if username and result.get("comment"):
                behavioral_analysis = collect_behavioral_signals(username, result.get("comment"), table_name)
            suspicious_comments.append({
                "comment": result.get("comment"),
                "username": username,
                "analysis": semantic_analysis,
                "behavioral": behavioral_analysis
            })
    return suspicious_comments

def suspicious_comment_semantic_search(comment: str) -> List[float]:
    try:
        result = semantic_search_postgres(comment, top_n=4)
        if result:
            return [row[4] for row in result if len(row) > 4]
        return []
    except Exception as error:
        logger.error(f"Error analyzing suspicious comment: {error}, comment: {comment}")
        return []

#################### clear postgresql

def clean_postgresql_data(table_name):
    try:
        # Connect to Supabase PostgreSQL
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        print("Removing records with empty comment...")
        try:
            cur.execute(f"DELETE FROM {table_name} WHERE comment IS NULL OR TRIM(comment) = '';")
            conn.commit()
        except psycopg2.errors.UniqueViolation as e:
            logger.error(f"UniqueViolation removing empty comments: {str(e)} | Table: {table_name}")
            conn.rollback()
        except Exception as e:
            logger.error(f"Error removing empty comments: {str(e)} | Table: {table_name}")
            conn.rollback()
        print("Removing emojis and \\n from text...")
        try:
            cur.execute(f"""
                UPDATE {table_name}
                SET comment = REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        comment,
                        '[\\n\\r]',  -- Remove newlines
                        '',
                        'g'
                    ),
                    '[^\\u0000-\\u007F\\u4E00-\\u9FFF\\u3400-\\u4DBF\\u2000-\\u206F\\u3000-\\u303F\\uFF00-\\uFFEF]',  -- Remove emojis, preserve Chinese
                    '',
                    'g'
                )
                WHERE comment ~ '[\\n\\r]' OR comment ~ '[^\\u0000-\\u007F\\u4E00-\\u9FFF\\u3400-\\u4DBF\\u2000-\\u206F\\u3000-\\u303F\\uFF00-\\uFFEF]';
            """)
            conn.commit()
        except psycopg2.errors.UniqueViolation as e:
            logger.error(f"UniqueViolation removing emojis/newlines: {str(e)} | Table: {table_name}")
            conn.rollback()
        except Exception as e:
            logger.error(f"Error removing emojis/newlines: {str(e)} | Table: {table_name}")
            conn.rollback()
        print("Removing duplicated comments...")
        try:
            cur.execute(f"""
                WITH ranked_comments AS (
                    SELECT 
                        id,  -- assuming there's a primary key
                        comment,
                        username,
                        rating,
                        source,
                        product,
                        page_timestamp,
                        ROW_NUMBER() OVER (PARTITION BY comment, username, rating, source, product, page_timestamp ORDER BY id) AS rn
                    FROM {table_name}
                )
                DELETE FROM {table_name}
                WHERE id IN (
                    SELECT id
                    FROM ranked_comments
                    WHERE rn > 1
                );
            """)
            conn.commit()
        except psycopg2.errors.UniqueViolation as e:
            logger.error(f"UniqueViolation removing duplicated comments: {str(e)} | Table: {table_name}")
            conn.rollback()
        except Exception as e:
            logger.error(f"Error removing duplicated comments: {str(e)} | Table: {table_name}")
            conn.rollback()
        print("Fetching records with no embedding...")
        try:
            cur.execute(f"SELECT id, comment FROM {table_name} WHERE embedding IS NULL;")
            rows = cur.fetchall()
        except Exception as e:
            logger.error(f"Error fetching records with no embedding: {str(e)} | Table: {table_name}")
            conn.rollback()
            rows = []
        print("Embedding records with no embedding...")
        for row_id, text in tqdm(rows):
            try:
                embedding = model.encode(text).tolist()
            except Exception as e:
                print(f"Error embedding row {row_id}: {e}")
                embedding = None
            try:
                cur.execute(
                    f"UPDATE {table_name} SET embedding = %s WHERE id = %s;",
                    (embedding, row_id)
                )
                conn.commit()
            except Exception as e:
                logger.error(f"Error updating embedding for row {row_id}: {str(e)} | Table: {table_name}")
                conn.rollback()
        cur.close()
        conn.close()
        print("Done!")
    except Exception as e:
        logger.error(f"Error in clean_postgresql_data: {str(e)} | Table: {table_name}")
        if 'Could not determine Google Generative AI version' in str(e):
            pass
        else:
            raise

def determine_review_genuinty(suspicious_comments: List[Dict]) -> List[Dict]:
    logger.info(f"suspicious_comments input: {json.dumps(suspicious_comments, default=str)}")
    semantic_scores = [item["analysis"] for item in suspicious_comments if "analysis" in item]
    behavioral_results = [item["behavioral"] for item in suspicious_comments if "behavioral" in item]
    logger.info(f"semantic_scores: {json.dumps(semantic_scores, default=str)}")
    logger.info(f"behavioral_results: {json.dumps(behavioral_results, default=str)}")
    behavioral_evidence = []
    for item in suspicious_comments:
        username = item.get("username")
        comment = item.get("comment")
        if username and comment:
            evidence = collect_behavioral_signals(username, comment, table_name)
        else:
            evidence = []
        behavioral_evidence.append(evidence)
        logger.info(f"behavioral_evidence (current): {json.dumps(behavioral_evidence, default=str)}")
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": f"{llm_model}",
                "prompt": (
                    "You are a fake review evaluator for e-commerce. For each review, classify as 'Fake' if either the behavioral analysis OR the semantic analysis indicates suspicious or promotional activity, even if only one is present. Classify as 'Genuine' ONLY if both behavioral and semantic analysis are normal. For each review, explain the reason in simple, clear, and friendly language that any online shopper can understand. Avoid technical terms like 'semantic analysis' or 'behavioral analysis'. Use phrases like 'This review looks real because...' or 'This review seems fake because...'. Keep explanations short, direct, and easy to read. Do not use words like 'semantic', 'behavioral', 'embedding', or 'similarity'.\n"
                    "If the review is flagged for semantic reasons (e.g., overly promotional, vague, lacks product details), but behavioral is normal, classify as 'Fake'. If the review is flagged for behavioral reasons (e.g., abnormal posting pattern), but semantic is normal, classify as 'Fake'. If both are normal, classify as 'Genuine'. If the review is vague/promotional or looks copied, classify as 'Fake' and do not hedge or say further investigation is needed. Be decisive: if any signal is suspicious, verdict must be 'Fake'.\n"
                    f"Semantic: {json.dumps(semantic_scores)}\n"
                    f"Behavioral: {json.dumps(behavioral_results)}\n"
                    f"BehavioralEvidence: {json.dumps(behavioral_evidence)}\n\n"
                    "Respond strictly with:\n"
                    "1. A **Python-style list** of classifications in this exact format:\n"
                    "   ['Genuine', 'Fake', 'Genuine']\n"
                    "2. A **Python-style list** of single sentence explanations for each review, matching the order above. Each explanation should clearly describe why the review is classified as 'Fake' or 'Genuine', and must not contradict the verdict. Do not say 'may be fake' or 'further investigation is needed'—be direct.\n\n"
                    "Do NOT add any introductions or explanations before the lists.\n"
                    "Begin your response immediately with the classification list, then the explanation list.\n"
                    "Example response:\n"
                    "['Genuine', 'Fake']\n"
                    "['This review looks real because it talks about the product in detail.', 'This review seems fake because it repeats the same phrases as other reviews.']"
                ),
                "system": "You are a strict output generator. Follow the output format exactly and avoid unnecessary text.",
                "stream": False
            },
            timeout=60
        )
        response.raise_for_status()
        result_json = response.json()
        result_text = result_json.get("response", "").strip()
        lines = [line.strip() for line in result_text.split('\n') if line.strip()]
        verdicts = []
        explanations = []
        for line in lines:
            if line.startswith("[") and line.endswith("]"):
                try:
                    parsed = json.loads(line.replace("'", '"'))
                    if not verdicts:
                        verdicts = parsed
                    else:
                        explanations = parsed
                except Exception as e:
                    logger.error(f"Error parsing list: {str(e)} | line: {line}")
        result = []
        for idx, item in enumerate(suspicious_comments):
            verdict = verdicts[idx] if idx < len(verdicts) else None
            explanation = explanations[idx] if idx < len(explanations) else None
            if verdict and verdict.strip().lower() == 'genuine':
                verdict = 'GENUINE'
            elif verdict and verdict.strip().lower() == 'fake':
                verdict = 'FAKE'
            result.append({
                "comment": item.get("comment"),
                "verdict": verdict,
                "explanation": explanation
            })
        logger.info(f"determine_review_genuinty result: {json.dumps(result, default=str)}")
        return result
    except Exception as e:
        logger.error(f"Error in determine_review_genuinty: {str(e)}")
        return [
            {
                "comment": item.get("comment"),
                "verdict": None,
                "explanation": f"Error: {str(e)}"
            }
            for item in suspicious_comments
        ]



# ─── DB Helper ────────────────────────────────────────────────────────────────
def _execute_query_with_param(query, params):
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = cursor.fetchall()
        cursor.close()
        conn.close()
        return result
    except Exception as e:
        logger.error(f"SQL Error: {e} | Query: {query} | Params: {params}")
        return None


# ─── SQL Query Wrappers ────────────────────────────────────────────────────────
def query_same_comment_multiple_users(comment, table_name):
    sql = f"""
    SELECT COUNT(DISTINCT username)
    FROM {table_name}
    WHERE comment = %s
    """
    return _execute_query_with_param(sql, (comment,))


def query_user_repeated_same_comment(username, comment, table_name):
    sql = f"""
    SELECT COUNT(*)
    FROM {table_name}
    WHERE username = %s AND comment = %s
    """
    return _execute_query_with_param(sql, (username, comment))


def query_comment_length(comment, table_name):
    sql = "SELECT LENGTH(%s)"
    return _execute_query_with_param(sql, (comment,))

def query_duplicate_comment_across_products(comment, table_name):
    sql = f"""
    SELECT COUNT(DISTINCT product)
    FROM {table_name}
    WHERE comment = %s
    """
    return _execute_query_with_param(sql, (comment,))

def query_user_posting_rate(username, table_name):
    sql = f"""
    SELECT MIN(page_timestamp), MAX(page_timestamp), COUNT(*)
    FROM {table_name}
    WHERE username = %s
    """
    return _execute_query_with_param(sql, (username,))

def collect_behavioral_signals(username, comment, table_name):
    evidence = []

    try:
        result = query_same_comment_multiple_users(comment, table_name)
        if result and len(result) > 0 and result[0][0] > 1:
            evidence.append("Same comment used by multiple users.")
    except Exception as e:
        logger.error(f"Error in query_same_comment_multiple_users: {str(e)}")

    try:
        result = query_user_repeated_same_comment(username, comment, table_name)
        if result and len(result) > 0 and result[0][0] > 1:
            evidence.append("User reused the same comment.")
    except Exception as e:
        logger.error(f"Error in query_user_repeated_same_comment: {str(e)}")

    try:
        result = query_comment_length(comment, table_name)
        if result and len(result) > 0 and result[0][0] < 20:
            evidence.append("Comment is short (under 30 chars).")
    except Exception as e:
        logger.error(f"Error in query_comment_length: {str(e)}")

    try:
        product_counts = query_duplicate_comment_across_products(comment, table_name)
        if product_counts and len(product_counts) > 0 and len(product_counts[0]) > 0 and product_counts[0][0] > 1:
            evidence.append("Same comment used for multiple products.")
    except Exception as e:
        logger.error(f"Error in query_duplicate_comment_across_products: {str(e)}")


    # Optional: time-based evidence (if timestamp exists)
    # rate_data = query_user_posting_rate(username, table_name)
    # do analysis here

    return evidence


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on http://127.0.0.1:8001")
    uvicorn.run("backend:app", host="0.0.0.0", port=8001, reload=False)


