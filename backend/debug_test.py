#!/usr/bin/env python3

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
import psycopg2
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

print(f"DB_CONFIG: {DB_CONFIG}")
print(f"table_name: {table_name}")

def _execute_query_with_param(query, params):
    try:
        print(f"Executing SQL query: {query} with params: {params}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(query, params)
        result = cursor.fetchall()
        print(f"Query result: {result}")
        cursor.close()
        conn.close()
        return result
    except Exception as e:
        print(f"SQL Error: {e} | Query: {query} | Params: {params}")
        return None

def query_user_repeated_same_comment(username, comment, table_name):
    print(f"query_user_repeated_same_comment called with username='{username}', comment='{comment[:30]}...', table='{table_name}'")
    sql = f"""
    SELECT COUNT(*)
    FROM {table_name}
    WHERE username = %s AND comment = %s
    """
    result = _execute_query_with_param(sql, (username, comment))
    print(f"query_user_repeated_same_comment returning: {result}")
    return result

# Test the specific case
review = "jden mmg terbaik..dh bli brand mig xsedap..xpremium..jden jugak premium kain cantik sedap pakai dah basuh bnyak kali tetap ok..beli selai2 dekt live dapat murah giler😂..total dekat 20 helai dh beli"
username = "s*****d"

print("\n=== Testing query_user_repeated_same_comment ===")
result = query_user_repeated_same_comment(username, review, table_name)
print(f"Final result: {result}")

if result and len(result) > 0 and result[0][0] > 1:
    print(f"Evidence found: User reused comment {result[0][0]} times")
else:
    print("No evidence found for repeated comment")
