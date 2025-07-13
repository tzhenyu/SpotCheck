import csv
import psycopg2

DB_CONFIG = {
    "dbname": "postgres",
    "user": "postgres.your-tenant-id",
    "password": "your-super-secret-and-long-postgres-password",
    "host": "localhost",
    "port": 5432
}
TABLE_NAME = "product_reviews"


def import_csv_to_postgresql(csv_file_path: str):
    try:
        connection = psycopg2.connect(**DB_CONFIG)
        cursor = connection.cursor()
        with open(csv_file_path, newline='', encoding='utf-8') as csvfile:
            reader = list(csv.DictReader(csvfile))
            total_records = len(reader)
            if total_records == 0:
                print(f"No records found in file: {csv_file_path}")
                return
            for idx, row in enumerate(reader):
                rating = row.get('rating')
                comment = row.get('comment')
                assert rating is not None and comment is not None, "CSV missing required columns"
                cursor.execute(
                    f"INSERT INTO {TABLE_NAME} (rating, comment) VALUES (%s, %s)",
                    (rating, comment)
                )
                remaining = total_records - (idx + 1)
                print(f"{remaining} records left to import")
        connection.commit()
    except Exception as _error:
        print(f"Error importing CSV to PostgreSQL: {_error}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'connection' in locals():
            connection.close()


if __name__ == "__main__":
    import_csv_to_postgresql("backend/shopee_reviews_with_headers.csv")