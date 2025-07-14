import psycopg2
from dotenv import load_dotenv
import os

# Connect to the database
try:
    connection = psycopg2.connect(
        user="postgres.kcyeuqltcbtjxydnziny",
        password="futurehack123",
        host="aws-0-ap-southeast-1.pooler.supabase.com",
        port=5432,
        dbname="postgres"
    )
    print("Connection successful!")
    
    # Create a cursor to execute SQL queries
    cursor = connection.cursor()
    
    # Example query
    cursor.execute("SELECT NOW();")
    result = cursor.fetchone()
    print("Current Time:", result)

    # Close the cursor and connection
    cursor.close()
    connection.close()
    print("Connection closed.")

except Exception as e:
    print(f"Failed to connect: {e}")