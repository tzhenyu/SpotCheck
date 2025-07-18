#!/usr/bin/env python3

from dotenv import load_dotenv
import psycopg2
import os
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432)),
}

table_name = os.getenv("TABLE_NAME")

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

    return evidence

if __name__ == "__main__":
    review = "jden mmg terbaik..dh bli brand mig xsedap..xpremium..jden jugak premium kain cantik sedap pakai dah basuh bnyak kali tetap ok..beli selai2 dekt live dapat murah giler😂..total dekat 20 helai dh beli"
    username = "s*****d"
    
    print("Testing collect_behavioral_signals function...")
    print(f"Review: {review}")
    print(f"Username: {username}")
    print(f"Table: {table_name}")
    
    try:
        result = collect_behavioral_signals(username, review, table_name)
        print(f"Result: {result}")
        print(f"Evidence count: {len(result)}")
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
