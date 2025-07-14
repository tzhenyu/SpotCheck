import psycopg2
from dotenv import load_dotenv
import os
import csv

ALL_CAPS_CSV_FILE = "ratings_comments.csv"
ALL_CAPS_TABLE_NAME = "product_reviews"

def insertRecordsFromCsv(csvFilePath: str, tableName: str):
    try:
        connection = psycopg2.connect(
            user="postgres.kcyeuqltcbtjxydnziny",
            password="futurehack123",
            host="aws-0-ap-southeast-1.pooler.supabase.com",
            port=5432,
            dbname="postgres"
        )
        cursor = connection.cursor()
        with open(csvFilePath, newline='', encoding='utf-8') as csvfile:
            reader = list(csv.DictReader(csvfile))
            totalRecords = len(reader)
            batchSize = 100
            for start in range(0, totalRecords, batchSize):
                batch = reader[start:start+batchSize]
                values = [(row.get("rating"), row.get("comment")) for row in batch]
                assert all(r is not None and c is not None for r, c in values), "CSV missing required columns"
                try:
                    cursor.executemany(
                        f"INSERT INTO {tableName} (rating, comment) VALUES (%s, %s);",
                        values
                    )
                except Exception as insertError:
                    print(f"Insert error for batch starting at {start}: {insertError}")
                remaining = totalRecords - (start + batchSize)
                print(f"{max(remaining, 0)} records left to import")
            connection.commit()
        cursor.close()
        connection.close()
    except Exception as e:
        print(f"Failed to insert records: {e}")

insertRecordsFromCsv("backend/shopee_reviews_1k.csv", "product_reviews")