from sentence_transformers import SentenceTransformer
import psycopg2
import numpy as np
from tqdm import tqdm

# Load model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Connect to Supabase PostgreSQL
conn = psycopg2.connect(
    dbname="postgres",
    user="postgres.your-tenant-id",
    password="your-super-secret-and-long-postgres-password",
    host="localhost",
    port="5432"
)
cur = conn.cursor()

# Fetch rows that don't have embeddings yet
cur.execute("SELECT id, comment FROM product_reviews WHERE embedding IS NULL;")
rows = cur.fetchall()

# Generate and update embeddings
for row_id, text in tqdm(rows):
    embedding = model.encode(text).tolist()
    cur.execute(
        "UPDATE product_reviews SET embedding = %s WHERE id = %s;",
        (embedding, row_id)
    )

conn.commit()
cur.close()
conn.close()
