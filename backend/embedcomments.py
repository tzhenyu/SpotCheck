import psycopg2
from tqdm import tqdm
import re

def remove_emojis_and_newlines(text):
    if text is None:
        return text
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"
        "\U0001F300-\U0001F5FF"
        "\U0001F680-\U0001F6FF"
        "\U0001F1E0-\U0001F1FF"
        "\U00002500-\U00002BEF"
        "\U00002702-\U000027B0"
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "\U0001f926-\U0001f937"
        "\U00010000-\U0010ffff"
        "\u2640-\u2642"
        "\u2600-\u2B55"
        "\u200d"
        "\u23cf"
        "\u23e9"
        "\u231a"
        "\ufe0f"
        "\u3030"
        "]+", flags=re.UNICODE)
    text = emoji_pattern.sub('', text)
    text = text.replace('\n', ' ').replace('\r\n', ' ').replace('\r', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


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
cur.execute("DELETE FROM product_reviews WHERE comment IS NULL OR TRIM(comment) = '';")
conn.commit()

# Clean emojis and newlines from comments in-place in the database
cur.execute("SELECT id, comment FROM product_reviews WHERE comment IS NOT NULL;")
rows = cur.fetchall()
for row_id, text in tqdm(rows):
    cleaned_comment = remove_emojis_and_newlines(text)
    cur.execute(
        "UPDATE product_reviews SET comment = %s WHERE id = %s;",
        (cleaned_comment, row_id)
    )
conn.commit()

# Fetch rows that don't have embeddings yet
cur.execute("SELECT id, comment FROM product_reviews WHERE embedding IS NULL;")
rows = cur.fetchall()


conn.commit()
cur.close()
conn.close()
