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

        ## You shall start processing the rows here.
        ## Extract only the comment from database using pandas.
        ## Filter out unnessary words like "/n" or whatever tf
        print(rows)
            


    except Exception as e:
        print("❌ Error:", e)
    finally:
        remote_cur.close()

# Main function
if __name__ == "__main__":
    # 🔁 Connect to remote and local DBs
    remote_conn = psycopg2.connect(**remote_config)

    TABLE_NAME = "test_reviews"
    
    try:
        # Call clone_table with the specified table name
        clone_table(remote_conn, TABLE_NAME)
    except Exception as e:
        print(f"❌ Failed to process table {TABLE_NAME}: {e}")
    finally:
        remote_conn.close()
