import logging
from pydantic import BaseModel
import psycopg2
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.prebuilt import create_react_agent
import requests
#Constant for PostgreSQL statement
DUPLICATE_COMMENT_PRODUCT_THRESHOLD = 3
USER_FAST_REVIEW_COUNT = 5
USER_FAST_REVIEW_INTERVAL = "1 hour"
GENERIC_COMMENT_LENGTH = 40
GENERIC_COMMENT_PRODUCT_THRESHOLD = 3
HIGH_AVG_RATING = 5.0
HIGH_AVG_RATING_COUNT = 5
BURST_COUNT_THRESHOLD = 5
table_name = "product_reviews"

# Database configuration
DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres.your-tenant-id",
    "password": "your-super-secret-and-long-postgres-password",
    "host": "localhost",
    "port": 5432
}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Query(BaseModel):
    text: str

############## TOOLS FOR LLM AGENTS
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
        logger.error(f"Error executing parameterized query: {str(e)} | Query: {query} | Params: {params}")
        return None
    

@tool
def query_duplicate_comment_across_products(comment, username, table_name):
    """Query for duplicate comments across products by a user."""
    sql_query = f"""
    SELECT username, comment, COUNT(DISTINCT source) AS product_count
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY username, comment
    HAVING COUNT(DISTINCT source) > {DUPLICATE_COMMENT_PRODUCT_THRESHOLD};
    """
    return _execute_query_with_param(sql_query, (comment, username))
@tool
def query_user_many_reviews_quickly(comment, username, table_name):
    """Query for users who posted many reviews quickly."""
    sql_query = f"""
    SELECT username, MIN(timestamp) AS first, MAX(timestamp) AS last, COUNT(*) AS total
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY username
    HAVING COUNT(*) > {USER_FAST_REVIEW_COUNT} AND MAX(timestamp) - MIN(timestamp) < INTERVAL '{USER_FAST_REVIEW_INTERVAL}';
    """
    return _execute_query_with_param(sql_query, (comment, username))
@tool
def query_same_comment_multiple_users_products(comment, username, table_name):
    """Query for same comment posted by multiple users across products."""
    sql_query = f"""
    SELECT comment, COUNT(DISTINCT username) AS user_count, COUNT(DISTINCT source) AS product_count
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY comment
    HAVING user_count > 3 AND product_count > 3;
    """
    return _execute_query_with_param(sql_query, (comment, username))
@tool
def query_generic_comment_across_products(comment, username, table_name):
    """Query for generic comments across products."""
    sql_query = f"""
    SELECT comment, COUNT(DISTINCT source) AS product_count
    FROM {table_name}
    WHERE LENGTH(comment) < {GENERIC_COMMENT_LENGTH} AND comment = %s AND username = %s
    GROUP BY comment
    HAVING product_count > {GENERIC_COMMENT_PRODUCT_THRESHOLD};
    """
    return _execute_query_with_param(sql_query, (comment, username))
@tool
def query_high_avg_rating_users(comment, username, table_name):
    """Query for users with high average rating."""
    sql_query = f"""
    SELECT username, AVG(rate) AS avg_rating, COUNT(*) AS review_count
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY username
    HAVING review_count >= {HIGH_AVG_RATING_COUNT} AND avg_rating = {HIGH_AVG_RATING};
    """
    return _execute_query_with_param(sql_query, (comment, username))
@tool
def query_review_burst(comment, username, table_name):
    """Query for review bursts by a user."""
    sql_query = f"""
    SELECT source, DATE_TRUNC('minute', timestamp) AS minute, COUNT(*) AS burst_count
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY source, minute
    HAVING COUNT(*) > {BURST_COUNT_THRESHOLD};
    """
    return _execute_query_with_param(sql_query, (comment, username))


def run_agent_executor(input_data):
    logger.info(f"Invoking LLM agent with input: {input_data}")
    try:
        # Only pass parameters required by tools
        agent_input = {
            "comment": input_data.get("comment", ""),
            "username": input_data.get("username", ""),
        }
        result = agent_executor.invoke(agent_input)
        logger.info(f"LLM agent result: {result}")
        # Check for empty response
        if not result or (isinstance(result, dict) and 'messages' in result and all(getattr(m, 'content', None) == '' for m in result['messages'])):
            logger.warning(f"Agent returned empty response: {result}")
        return result
    except Exception as error:
        logger.error(f"Error during LLM agent execution: {error}, input: {input_data}")
        return None

def get_embedding(query_text):
    try:
        headers = {"Authorization": "Bearer YOUR_API_KEY"}  # Replace with your actual key/token
        response = requests.post(
            "http://127.0.0.1:8001/embed",
            json={"text": query_text},
            headers=headers
        )
        response.raise_for_status()
        data = response.json()
        if "embedding" not in data:
            print(f"Error: 'embedding' key missing in response: {data}, query_text: {query_text}")
            return None
        return data["embedding"]
    except Exception as error:
        print(f"Error during embedding request: {error}, query_text: {query_text}")
        return None
    
@tool
def semantic_search_postgres(query: str, top_n: int):
    """Semantic search for similar comments in Postgres using pgvector."""
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
        query_embedding = get_embedding(query)

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

############## LLM AGENTS


# Tools
tools = [
    query_review_burst, 
    query_high_avg_rating_users,
    query_generic_comment_across_products,
    query_same_comment_multiple_users_products,
    query_user_many_reviews_quickly,
    query_duplicate_comment_across_products,
    semantic_search_postgres
]

# Create LLM
llm = ChatOllama(model="llama3-groq-tool-use:8b")

# Create ReAct-style agent with a static prompt
agent = create_react_agent(
    model=llm,
    tools=tools,
    prompt="You are a fake review detection agent. Never answer questions unrelated to fake reviews. Only use the provided tools to investigate reviews and patterns. Reject anything about weather, location, or general knowledge."
)

# Wrap in an executor for invoking
agent_executor = agent

def preprocess_review_input(input_data):
    try:
        # Extract comment from input string
        input_str = input_data.get("input", "")
        # Simple extraction for quoted review
        if "'" in input_str:
            comment = input_str.split("'")[1]
        else:
            comment = input_str
        # Use default values for username and table_name
        username = "unknown_user"
        table = table_name
        return {"comment": comment, "username": username, "table_name": table}
    except Exception as error:
        logger.error(f"Error preprocessing input: {error}, input_data: {input_data}")
        return {"comment": "", "username": "", "table_name": table_name}

input_data = {"input": "Check if this review is fake: 'Great product, fast shipping!'"}
preprocessed = preprocess_review_input(input_data)
result = run_agent_executor(preprocessed)
print(result)

# print(semantic_search_postgres("very good",5))