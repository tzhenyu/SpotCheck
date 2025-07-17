import os
import psycopg2
import logging
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432))
}

REMOTE_DB_CONFIG = {
    "dbname": "futurehack",
    "user": "zhenyu",
    "password": "123123",
    "host": "100.97.20.73",
    "port": int(os.getenv("PORT", 5432)),
}

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_table_data(table_name: str):
    try:
        logger.info(f"Fetching data from remote table: {table_name}")
        conn = psycopg2.connect(**REMOTE_DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {table_name}")
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        logger.info(f"Fetched {len(rows)} records from remote table: {table_name}")
        print(f"[DEBUG] Remote table '{table_name}' record count: {len(rows)}")
        cursor.close()
        conn.close()
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        logger.error(f"Error fetching data from {table_name}: {e}")
        print(f"[DEBUG] Error fetching data from remote table '{table_name}': {e}")
        return None

def insert_records_to_db(table_name: str, records: list):
    if not records:
        logger.error("No records to insert.")
        print(f"[DEBUG] No records to insert into local table '{table_name}'.")
        return
    try:
        logger.info(f"Inserting {len(records)} records into local table: {table_name}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        # Exclude 'id' from columns if present
        columns = [col for col in records[0].keys() if col != 'id']
        columns_str = ','.join(columns)
        values_template = ','.join(['%s'] * len(columns))
        insert_query = f"INSERT INTO {table_name} ({columns_str}) VALUES ({values_template})"
        inserted_count = 0
        total_records = len(records)
        for idx, record in enumerate(records):
            try:
                values = tuple(record[col] for col in columns)
                cursor.execute(insert_query, values)
                inserted_count += 1
            except Exception as e:
                logger.error(f"Error inserting record with values {record}: {e}")
                conn.rollback()
            records_left = total_records - (idx + 1)
            print(f"[DEBUG] Records left to import: {records_left}")
        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"Inserted {inserted_count} records into {table_name}.")
        print(f"[DEBUG] Local table '{table_name}' inserted record count: {inserted_count}")
    except Exception as e:
        logger.error(f"Error inserting records into {table_name}: {e}")
        print(f"[DEBUG] Error inserting records into local table '{table_name}': {e}")

if __name__ == "__main__":
    table = os.getenv("TABLE_NAME")
    if not table:
        logger.error("TABLE_NAME not set in environment variables.")
    else:
        records = get_table_data(table)
        if records:
            logger.info(f"Fetched {len(records)} records from remote DB.")
            insert_records_to_db(table, records)
        else:
            logger.info("No records fetched from remote DB.")
