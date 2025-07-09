import psycopg2
from psycopg2 import sql
import numpy as np
import pandas as pd
import re

def clean_comments(df):
    """
    Clean comment data by removing newlines, emojis, and other inappropriate characters
    """
    # Make a copy to avoid modifying original data
    cleaned_df = df.copy()
    
    # Handle null values
    cleaned_df['comment'] = cleaned_df['comment'].fillna('')
    
    # Remove newlines and replace with spaces
    cleaned_df['comment'] = cleaned_df['comment'].str.replace('\n', ' ', regex=True)
    cleaned_df['comment'] = cleaned_df['comment'].str.replace('\r', ' ', regex=True)
    cleaned_df['comment'] = cleaned_df['comment'].str.replace('\t', ' ', regex=True)
    
    # Remove emojis (including skin tone modifiers like 🏻)
    # This regex covers most emoji ranges
    emoji_pattern = re.compile("["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
        u"\U00002500-\U00002BEF"  # chinese char
        u"\U00002702-\U000027B0"
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        u"\U0001f926-\U0001f937"
        u"\U00010000-\U0010ffff"
        u"\u2640-\u2642"
        u"\u2600-\u2B55"
        u"\u200d"
        u"\u23cf"
        u"\u23e9"
        u"\u231a"
        u"\ufe0f"  # dingbats
        u"\u3030"
        "]+", flags=re.UNICODE)
    
    cleaned_df['comment'] = cleaned_df['comment'].apply(lambda x: emoji_pattern.sub('', x))
    
    # Remove extra whitespace
    cleaned_df['comment'] = cleaned_df['comment'].str.strip()
    cleaned_df['comment'] = cleaned_df['comment'].str.replace(r'\s+', ' ', regex=True)
    
    # Remove comments that are empty or only whitespace after cleaning
    cleaned_df = cleaned_df[cleaned_df['comment'].str.len() > 0]
    
    return cleaned_df

# 🔐 Configuration for remote and local databases
remote_config = {
    'dbname': 'futurehack',
    'user': 'zhenyu',
    'password': '123123',
    'host': '100.97.20.73',
    'port': 5432
}


def clone_table(remote_conn, table_name):
    remote_cur = remote_conn.cursor()
    try:
        # 🔍 Step 1: Get table schema
        remote_cur.execute(f"""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = '{table_name}' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """)
        columns = remote_cur.fetchall()

        if not columns:
            print(f"Table {table_name} not found or has no columns.")
            return

        # 🛠️ Build CREATE TABLE statement
        create_table_sql = sql.SQL("CREATE TABLE IF NOT EXISTS {table} (").format(
            table=sql.Identifier(table_name)
        )

        column_defs = []
        for col in columns:
            col_name, col_type, is_nullable, default = col
            col_def = sql.Identifier(col_name) + sql.SQL(" ") + sql.SQL(col_type.upper())

            if default and "nextval" not in default:
                col_def += sql.SQL(" DEFAULT ") + sql.SQL(default)
            if is_nullable == "NO":
                col_def += sql.SQL(" NOT NULL")

            column_defs.append(col_def)

        create_table_sql += sql.SQL(", ").join(column_defs) + sql.SQL(");")


        # 📤 Step 2: Copy data from remote
        remote_cur.execute(sql.SQL("SELECT comment FROM {}").format(sql.Identifier(table_name)))
        rows = remote_cur.fetchall()

        # Convert to DataFrame
        df = pd.DataFrame(rows, columns=['comment'])
        
        print(f"Total rows fetched: {len(df)}")
        print("\nFirst 5 raw comments:")
        for i, comment in enumerate(df['comment'].head().tolist()):
            print(f"{i+1}. {repr(comment)}")
        
        # Clean the comments
        cleaned_df = clean_comments(df)
        
        print(f"\nRows after cleaning: {len(cleaned_df)}")
        print("\nFirst 5 cleaned comments:")
        for i, comment in enumerate(cleaned_df['comment'].head().tolist()):
            print(f"{i+1}. {comment}")
        
        # Save cleaned data to CSV
        csv_filename = f"{table_name}_comments_cleaned.csv"
        cleaned_df.to_csv(csv_filename, index=False)
        print(f"\nCleaned data saved to: {csv_filename}")
        
        return cleaned_df
            


    except Exception as e:
        print("❌ Error:", e)
    finally:
        remote_cur.close()

# Main function
if __name__ == "__main__":
    # 🔁 Connect to remote and local DBs
    remote_conn = psycopg2.connect(**remote_config)

    TABLE_NAME = "test_product"
    
    try:
        # Call clone_table with the specified table name
        clone_table(remote_conn, TABLE_NAME)
    except Exception as e:
        print(f"❌ Failed to process table {TABLE_NAME}: {e}")
    finally:
        remote_conn.close()
