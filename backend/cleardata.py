import psycopg2
import os
from tqdm import tqdm
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
                import requests
                response = requests.post(
                    "http://localhost:8001/embed",
                    json={"text": text},
                    timeout=30
                )
                response.raise_for_status()
                embedding = response.json().get("embedding")
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

clean_postgresql_data(table_name)