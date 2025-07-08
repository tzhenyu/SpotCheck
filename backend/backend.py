from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
import logging
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict
import asyncio
from google import genai
import os
from dotenv import load_dotenv


# Load environment variables from .env file
load_dotenv()



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini API with API key
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    logger.error("GEMINI_API_KEY environment variable not set")
    raise ValueError("GEMINI_API_KEY environment variable is required")

# Initialize Gemini client with API key
client = genai.Client(api_key=API_KEY)
gemini_model = "gemini-2.0-flash"

# Create data models
class CommentData(BaseModel):
    comments: List[str]

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

async def analyze_comments_batch(comments: List[str]) -> List[Dict]:
    """Process multiple comments in a single Gemini API call"""
    try:
        # Format all comments into a single prompt
        prompt = "Analyze each product review below and determine if it's real or fake.\n"
        prompt += "For each review, respond with REAL or FAKE followed by a brief explanation (15 words max).\n"
        prompt += "Format your response as numbered list matching the order of reviews:\n\n"
        
        for i, comment in enumerate(comments, 1):
            prompt += f"{i}. Review: '{comment}'\n"
        
        # Make a single API call for all comments
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=gemini_model,
            contents=prompt
        )
        
        result_text = response.text.strip()
        
        # Parse the response to extract results for each comment
        lines = result_text.split('\n')
        results = []
        
        current_index = 0
        for i, comment in enumerate(comments):
            # Look for lines containing the comment number
            result_line = ""
            for j in range(current_index, len(lines)):
                if lines[j].strip().startswith(f"{i+1}."):
                    result_line = lines[j].strip()
                    current_index = j + 1
                    break
            
            # If no specific line found, use a default message
            if not result_line:
                results.append({
                    "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                    "is_fake": None,
                    "explanation": "Unable to determine from batch analysis"
                })
                continue
            
            # Extract REAL/FAKE status and explanation
            is_fake = "fake" in result_line.lower()
            
            # Clean up the explanation by removing redundant REAL/FAKE prefixes
            explanation = result_line.replace(f"{i+1}.", "").strip()
            # Remove redundant REAL: or FAKE: prefix if it appears twice
            if is_fake and explanation.lower().startswith("fake:"):
                explanation = explanation.replace("FAKE:", "", 1).replace("Fake:", "", 1).replace("fake:", "", 1).strip()
            elif not is_fake and explanation.lower().startswith("real:"):
                explanation = explanation.replace("REAL:", "", 1).replace("Real:", "", 1).replace("real:", "", 1).strip()
            
            results.append({
                "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                "is_fake": is_fake,
                "explanation": explanation
            })
        
        return results
    except Exception as e:
        logger.error(f"Error in batch analysis with Gemini: {str(e)}")
        # Return error results for all comments
        return [
            {
                "comment": comment[:50] + "..." if len(comment) > 50 else comment,
                "is_fake": None,
                "explanation": f"Batch analysis error: {str(e)}"
            }
            for comment in comments
        ]

@app.post("/comments")
async def process_comments(data: CommentData):
    """Process comments from Shopee with Gemini API"""
    logger.info(f"Received {len(data.comments)} comments")
    
    # Process up to 6 comments to avoid rate limits
    comments_to_process = data.comments[:6]
    
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
        results = await analyze_comments_batch(comments_to_process)
    
    logger.info(f"Completed analysis of {len(results)} comments")
    return {
        "message": f"Processed {len(results)} comments", 
        "results": results
    }

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on http://127.0.0.1:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)