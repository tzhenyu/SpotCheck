# fake_review_agent.py

from dotenv import load_dotenv
import psycopg2
import os
import logging
from langchain.tools import Tool
from langchain.agents import initialize_agent
from langchain_ollama import ChatOllama

# ─── Load Environment Variables ────────────────────────────────────────────────
load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432)),
}

# ─── Constants ─────────────────────────────────────────────────────────────────
DUPLICATE_COMMENT_PRODUCT_THRESHOLD = 3
USER_FAST_REVIEW_COUNT = 5
USER_FAST_REVIEW_INTERVAL = "1 hour"
GENERIC_COMMENT_LENGTH = 40
GENERIC_COMMENT_PRODUCT_THRESHOLD = 3
HIGH_AVG_RATING = 5.0
HIGH_AVG_RATING_COUNT = 5

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


def _format_result(result):
    if not result:
        return "No suspicious pattern found."
    return "\n".join(str(row) for row in result)


# ─── SQL Query Wrappers ────────────────────────────────────────────────────────
def query_duplicate_comment_across_products(comment, table_name):
    sql = f"""
    SELECT username, comment, COUNT(DISTINCT product) as count
    FROM {table_name}
    WHERE comment = %s
    GROUP BY username, comment
    HAVING COUNT(DISTINCT product) > {DUPLICATE_COMMENT_PRODUCT_THRESHOLD};
    """
    return _execute_query_with_param(sql, (comment,))


def query_user_many_reviews_quickly(username, table_name):
    sql = f"""
    SELECT username, COUNT(*) AS num_reviews,
           MIN(page_timestamp) AS first_post,
           MAX(page_timestamp) AS last_post,
           MAX(page_timestamp) - MIN(page_timestamp) AS span
    FROM {table_name}
    WHERE username = %s
    GROUP BY username
    HAVING COUNT(*) >= {USER_FAST_REVIEW_COUNT}
           AND MAX(page_timestamp) - MIN(page_timestamp) <= interval '{USER_FAST_REVIEW_INTERVAL}';
    """
    return _execute_query_with_param(sql, (username,))


def query_same_comment_multiple_users_products(comment, username, table_name):
    sql = f"""
    SELECT comment, COUNT(DISTINCT username) AS user_count
    FROM {table_name}
    WHERE comment = %s AND username != %s
    GROUP BY comment
    HAVING COUNT(DISTINCT username) > 1;
    """
    return _execute_query_with_param(sql, (comment, username))


def query_generic_comment_across_products(comment, username, table_name):
    sql = f"""
    SELECT comment, COUNT(DISTINCT source) AS product_count
    FROM {table_name}
    WHERE LENGTH(comment) < {GENERIC_COMMENT_LENGTH}
          AND comment = %s AND username = %s
    GROUP BY comment
    HAVING COUNT(DISTINCT source) > {GENERIC_COMMENT_PRODUCT_THRESHOLD};
    """
    return _execute_query_with_param(sql, (comment, username))


def query_high_avg_rating_users(comment, username, table_name):
    sql = f"""
    SELECT username, AVG(rate) AS avg_rating, COUNT(*) AS review_count
    FROM {table_name}
    WHERE comment = %s AND username = %s
    GROUP BY username
    HAVING review_count >= {HIGH_AVG_RATING_COUNT}
           AND avg_rating = {HIGH_AVG_RATING};
    """
    return _execute_query_with_param(sql, (comment, username))


# ─── Define Tools ──────────────────────────────────────────────────────────────
tools = [
    Tool(
        name="CheckDuplicateCommentsAcrossProducts",
        func=lambda args: _format_result(query_duplicate_comment_across_products(args["comment"], "product_reviews")) if isinstance(args, dict) else _format_result(query_duplicate_comment_across_products(args, "product_reviews")),
        description="Check if the same comment is used by a user across multiple products. Input: comment string."
    ),
    Tool(
        name="CheckUserReviewBurst",
        func=lambda args: _format_result(query_user_many_reviews_quickly(args["username"], "product_reviews")) if isinstance(args, dict) else _format_result(query_user_many_reviews_quickly(args, "product_reviews")),
        description="Check if a user posts many reviews in a short time. Input: username string."
    ),
    Tool(
        name="CheckSameCommentByDifferentUsers",
        func=lambda args: _format_result(query_same_comment_multiple_users_products(args["comment"], args["username"], "product_reviews")) if isinstance(args, dict) else _format_result(query_same_comment_multiple_users_products(args, None, "product_reviews")),
        description="Check if multiple users posted the same comment. Input: dict with 'comment' and 'username'."
    ),
    Tool(
        name="CheckGenericCommentReuse",
        func=lambda args: _format_result(query_generic_comment_across_products(args["comment"], args["username"], "product_reviews")) if isinstance(args, dict) else _format_result(query_generic_comment_across_products(args, None, "product_reviews")),
        description="Check if a user reused a short generic comment across products. Input: dict with 'comment' and 'username'."
    ),
    Tool(
        name="CheckHighAvgRatingUser",
        func=lambda args: _format_result(query_high_avg_rating_users(args["comment"], args["username"], "product_reviews")) if isinstance(args, dict) else _format_result(query_high_avg_rating_users(args, None, "product_reviews")),
        description="Check if a user consistently gives 5-star ratings. Input: dict with 'comment' and 'username'."
    ),
]

# ─── Initialize LangChain Agent ────────────────────────────────────────────────
llm = ChatOllama(model="llama3-groq-tool-use:8b")

system_prompt = (
    "You are a fake review investigator. Your goal is to determine if a review or user appears suspicious.\n"
    "You have access to SQL tools that analyze patterns such as:\n"
    "- Comment duplication across products\n"
    "- Posting reviews very quickly\n"
    "- Reuse of generic comments\n"
    "- Multiple users posting same comments\n"
    "- Consistently giving max ratings\n\n"
    "The database table 'product_reviews' has a unique constraint on (comment, username, rating, source, product, page_timestamp).\n"
    "When responding, always use the following format for each reasoning step, even if information is missing or unclear:\n"
    "Thought: <your reasoning>\n"
    "Action: <tool name or 'None'>\n"
    "Action Input: <input or 'None'>\n"
    "Observation: <result or 'None'>\n"
    "Repeat Thought/Action/Observation as needed. Do not skip any step, even if you cannot proceed.\n"
    "At the end, provide:\n"
    "- Verdict: Genuine / Suspicious / Unclear\n"
    "- Reason: Short explanation\n"
    "- Evidence: SQL result shown\n"
)

agent = initialize_agent(
    tools=tools,
    llm=llm,
    agent="zero-shot-react-description",
    verbose=True,
    system_message=system_prompt,
    handle_parsing_errors=True
)

# ─── Run Agent ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    response = agent.invoke("Check if user 's*****d' is suspicious based on comment 'jden mmg terbaik..dh bli brand mig xsedap..xpremium..jden jugak premium kain cantik sedap pakai dah basuh bnyak kali tetap ok..beli selai2 dekt live dapat murah giler😂..total dekat 20 helai dh beli'")
    print("\n🧠 Verdict:\n")
    print(response)
