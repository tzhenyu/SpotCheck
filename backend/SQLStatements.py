import psycopg2
from psycopg2 import sql
import numpy as np
import pandas as pd
# 🔐 Configuration for remote and local databases
remote_config = {
    'dbname': 'futurehack',
    'user': 'zhenyu',
    'password': '123123',
    'host': '100.97.20.73',
    'port': 5432
}


def generate_select_all_query(table_name):
    """
    Generates a SQL query to select all records from a specified table.
    
    Args:
        table_name (str): The name of the table to query
        
    Returns:
        str: A SQL query string
    """
    return f"SELECT * FROM {table_name}"


def execute_select_all_query(connection, table_name):
    """
    Executes a SELECT * query on the specified table and returns results.
    
    Args:
        connection: Database connection object
        table_name (str): The name of the table to query
        
    Returns:
        list: Query results
    """
    cursor = connection.cursor()
    try:
        query = generate_select_all_query(table_name)
        cursor.execute(query)
        results = cursor.fetchall()
        return results
    except Exception as e:
        print(f"❌ Error executing query: {e}")
        return []
    finally:
        cursor.close()


# Main function
if __name__ == "__main__":
    # 🔁 Connect to remote DB
    remote_conn = psycopg2.connect(**remote_config)

    TABLE_NAME = "test_product"
    
    try:
        # Execute query and print results
        results = execute_select_all_query(remote_conn, TABLE_NAME)
        print(f"Results from {TABLE_NAME}:")
        for row in results:
            print(row)
    except Exception as e:
        print(f"❌ Failed to process table {TABLE_NAME}: {e}")
    finally:
        remote_conn.close()