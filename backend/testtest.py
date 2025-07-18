from dotenv import load_dotenv
import psycopg2
import os
import logging

# ─── Load Environment Variables ────────────────────────────────────────────────
load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432)),
}

table_name = os.getenv("TABLE_NAME")

# ─── Constants ─────────────────────────────────────────────────────────────────
DUPLICATE_COMMENT_PRODUCT_THRESHOLD = 2
USER_FAST_REVIEW_COUNT = 3
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

    if query_same_comment_multiple_users(comment, table_name)[0][0] > 1:
        evidence.append("Same comment used by multiple users.")

    if query_user_repeated_same_comment(username, comment, table_name)[0][0] > 1:
        evidence.append("User reused the same comment.")

    if query_comment_length(comment, table_name)[0][0] < 20:
        evidence.append("Comment is short (under 30 chars).")

    product_counts = query_duplicate_comment_across_products(comment, table_name)
    if product_counts and len(product_counts[0]) > 0 and product_counts[0][0] > 1:
        evidence.append("Same comment used for multiple products.")

    # Optional: time-based evidence (if timestamp exists)
    # rate_data = query_user_posting_rate(username, table_name)
    # do analysis here

    return evidence

review = "jden mmg terbaik..dh bli brand mig xsedap..xpremium..jden jugak premium kain cantik sedap pakai dah basuh bnyak kali tetap ok..beli selai2 dekt live dapat murah giler😂..total dekat 20 helai dh beli"
username = "s*****d"

print(collect_behavioral_signals(username, review, "product_reviews"))