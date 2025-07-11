import psycopg2
from psycopg2 import sql
import pandas as pd
import re

# 🔐 Configuration for remote database
remote_config = {
    'dbname': 'futurehack',
    'user': 'zhenyu',
    'password': '123123',
    'host': '100.97.20.73',
    'port': 5432
}

def remove_emojis_and_newlines(text):
    """
    Remove emojis and newline characters from text while preserving other content.
    """
    if text is None:
        return text
    
    # Remove emojis using regex pattern
    # This pattern matches most emoji characters
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\U00002500-\U00002BEF"  # chinese char
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
        "\ufe0f"  # dingbats
        "\u3030"
        "]+", flags=re.UNICODE)
    
    # Remove emojis
    text = emoji_pattern.sub('', text)
    
    # Remove newline characters (\n, \r\n, \r)
    text = text.replace('\n', ' ').replace('\r\n', ' ').replace('\r', ' ')
    
    # Clean up extra spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def get_and_clean_data(table_name, output_filename='cleaned_data.csv'):
    """
    Fetch data from the database, clean it, and export to CSV.
    """
    remote_conn = psycopg2.connect(**remote_config)
    remote_cur = remote_conn.cursor()
    
    try:
        # Get all columns from the table to preserve metadata
        remote_cur.execute(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """)
        columns = [row[0] for row in remote_cur.fetchall()]
        
        if not columns:
            print(f"Table {table_name} not found or has no columns.")
            return
        
        # Fetch all data from the table
        column_list = ', '.join(columns)
        remote_cur.execute(f"SELECT {column_list} FROM {table_name}")
        rows = remote_cur.fetchall()
        
        # Create DataFrame
        df = pd.DataFrame(rows, columns=columns)
        
        # Clean text columns (assuming they might contain emojis and newlines)
        text_columns = df.select_dtypes(include=['object']).columns
        
        for col in text_columns:
            df[col] = df[col].apply(remove_emojis_and_newlines)
        
        # Export to CSV
        df.to_csv(output_filename, index=False, encoding='utf-8')
        
        print(f"✅ Data cleaned and exported to {output_filename}")
        print(f"📊 Total rows processed: {len(df)}")
        print(f"📋 Columns: {list(df.columns)}")
        
        # Display first few rows for verification
        print("\n🔍 First 5 rows of cleaned data:")
        print(df.head())
        
        return df
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None
    finally:
        remote_cur.close()
        remote_conn.close()

def clean_specific_comments(table_name, comment_column='comment', output_filename='cleaned_comments.csv'):
    """
    Fetch only comment data, clean it, and export to CSV.
    This function focuses specifically on the comment column like in the original script.
    """
    remote_conn = psycopg2.connect(**remote_config)
    remote_cur = remote_conn.cursor()
    
    try:
        # Check if the comment column exists
        remote_cur.execute(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND column_name = '{comment_column}' AND table_schema = 'public';
        """)
        
        if not remote_cur.fetchone():
            print(f"Column '{comment_column}' not found in table '{table_name}'.")
            return
        
        # Fetch all columns to preserve metadata
        remote_cur.execute(f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '{table_name}' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """)
        all_columns = [row[0] for row in remote_cur.fetchall()]
        
        # Fetch all data
        column_list = ', '.join(all_columns)
        remote_cur.execute(f"SELECT {column_list} FROM {table_name}")
        rows = remote_cur.fetchall()
        
        # Create DataFrame
        df = pd.DataFrame(rows, columns=all_columns)
        
        # Clean the comment column specifically
        if comment_column in df.columns:
            df[comment_column] = df[comment_column].apply(remove_emojis_and_newlines)
        
        # Also clean any other text columns that might have emojis/newlines
        text_columns = df.select_dtypes(include=['object']).columns
        for col in text_columns:
            if col != comment_column:  # Don't double-process the comment column
                df[col] = df[col].apply(remove_emojis_and_newlines)
        
        # Export to CSV
        df.to_csv(output_filename, index=False, encoding='utf-8')
        
        print(f"✅ Comments cleaned and exported to {output_filename}")
        print(f"📊 Total rows processed: {len(df)}")
        print(f"📋 Columns preserved: {list(df.columns)}")
        
        # Display sample of cleaned comments
        if comment_column in df.columns:
            print(f"\n🔍 Sample cleaned {comment_column}s:")
            sample_comments = df[comment_column].dropna().head(3)
            for i, comment in enumerate(sample_comments, 1):
                print(f"{i}. {comment}")
        
        return df
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return None
    finally:
        remote_cur.close()
        remote_conn.close()

# Main function
if __name__ == "__main__":
    TABLE_NAME = "test_product"
    
    print("🧹 Starting data cleaning process...")
    
    # Option 1: Clean all data from table
    print("\n1️⃣ Cleaning all data from table...")
    df_all = get_and_clean_data(TABLE_NAME, 'cleaned_all_data.csv')
    
    # Option 2: Focus on comments specifically (like original script)
    print("\n2️⃣ Cleaning comment data specifically...")
    df_comments = clean_specific_comments(TABLE_NAME, 'comment', 'cleaned_comments.csv')
    
    print("\n🎉 Data cleaning completed!")
