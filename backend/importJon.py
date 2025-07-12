import os
import csv
import requests
import psycopg2

DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres.your-tenant-id",
    "password": "your-super-secret-and-long-postgres-password",
    "host": "localhost",
    "port": 5432
}
TABLE_NAME = "product_reviews"



def delete_duplicate_comments():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    try:
        cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
        before_count = cur.fetchone()[0]
        cur.execute(f"""
            DELETE FROM {TABLE_NAME}
            WHERE id NOT IN (
                SELECT MIN(id) FROM {TABLE_NAME}
                GROUP BY comment
            )
        """)
        conn.commit()
        cur.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}")
        after_count = cur.fetchone()[0]
        print(f"Rows before: {before_count}, rows after: {after_count}, removed: {before_count - after_count}")
    except Exception as error:
        print(f"Error deleting duplicate comments: {error}")
        conn.rollback()
    cur.close()
    conn.close()


if __name__ == "__main__":
    delete_duplicate_comments()