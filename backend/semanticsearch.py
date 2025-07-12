import psycopg2
import numpy as np
import requests

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
def semantic_search_postgres(query: str, top_n: int):
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

# Test it
print(semantic_search_postgres("very good", 5))
