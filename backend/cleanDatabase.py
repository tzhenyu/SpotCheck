import psycopg2
from tqdm import tqdm
import re
import requests


def clean_postgresql_data(table_name):
    # Connect to Supabase PostgreSQL
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres.your-tenant-id",
        password="your-super-secret-and-long-postgres-password",
        host="localhost",
        port="5432"
    )

    cur = conn.cursor()

    # Remove records with empty comment
    print("Removing records with empty comment...")
    cur.execute(f"DELETE FROM {table_name} WHERE comment IS NULL OR TRIM(comment) = '';")
    conn.commit()

    # Remove emojis and \n from text in PostgreSQL
    print("Removing emojis and \\n from text...")
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

    # Remove duplicated comments
    print("Removing duplicated comments...")
    cur.execute(f"""
        WITH ranked_comments AS (
            SELECT 
                id,  -- assuming there's a primary key
                comment,
                ROW_NUMBER() OVER (PARTITION BY comment ORDER BY id) AS rn
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

    # Fetch rows that don't have embeddings yet
    print("Fetching records with no embedding...")
    cur.execute(f"SELECT id, comment FROM {table_name} WHERE embedding IS NULL;")
    rows = cur.fetchall()

    # Generate and update embeddings
    print("Embedding records with no embedding...")
    for row_id, text in tqdm(rows):
        try:
            response = requests.post(
                "http://localhost:8001/embed",
                json={"text": text},
                timeout=10
            )
            response.raise_for_status()
            embedding = response.json().get("embedding")
        except Exception as e:
            print(f"Error embedding row {row_id}: {e}")
            embedding = None
        cur.execute(
            f"UPDATE {table_name} SET embedding = %s WHERE id = %s;",
            (embedding, row_id)
        )

    conn.commit()
    cur.close()
    conn.close()

    print("Done!")

clean_postgresql_data("product_reviews")