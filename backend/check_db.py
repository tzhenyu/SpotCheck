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

def check_database_content():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check for comments starting with "jden"
        cursor.execute(f"""
            SELECT comment, username, COUNT(*) as count
            FROM {table_name} 
            WHERE comment LIKE 'jden%' 
            GROUP BY comment, username
            ORDER BY count DESC
        """)
        
        results = cursor.fetchall()
        print(f"Found {len(results)} comments starting with 'jden':")
        for comment, username, count in results:
            print(f"Username: {username}, Count: {count}")
            print(f"Comment: '{comment}'")
            print(f"Length: {len(comment)} chars")
            print("---")
        
        # Check for the specific username
        cursor.execute(f"""
            SELECT comment, COUNT(*) as count
            FROM {table_name} 
            WHERE username = %s
            GROUP BY comment
            ORDER BY count DESC
        """, ('s*****d',))
        
        results = cursor.fetchall()
        print(f"\nFound {len(results)} comments for username 's*****d':")
        for comment, count in results:
            print(f"Count: {count}")
            print(f"Comment: '{comment}'")
            print(f"Length: {len(comment)} chars")
            print("---")
        
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_database_content()
