# connect PostgreSQL database
import psycopg2


database="zhenyu"
host="100.97.20.73"  # Tailscale IP of the remote server
user="zhenyu"
password="123123"
port="5432"  # or custom if you configured it differently

conn = psycopg2.connect(
    database=database,
    host=host,  # Tailscale IP of the remote server
    user=user,
    password=password,
    port=port  # or custom if you configured it differently
)

cursor = conn.cursor()
cursor.execute("SELECT * FROM authors;")
print(cursor.fetchone())
conn.close()