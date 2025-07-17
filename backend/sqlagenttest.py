from langchain_community.agent_toolkits.sql.toolkit import SQLDatabaseToolkit
from langchain.agents import AgentExecutor
from langchain.chains import LLMSQLChain
from langchain.prompts import PromptTemplate
from langchain_community.llms import Ollama
from langchain.sql_database import SQLDatabase

llm = Ollama(model="llama3:instruct")  # Or mistral, phi3, etc.

db = SQLDatabase.from_uri(
    "postgresql://postgres:futurehack123@db.kcyeuqltcbtjxydnziny.supabase.co:5432/postgres"
)

toolkit = SQLDatabaseToolkit(db=db, llm=llm)

prompt = PromptTemplate.from_template("""
You are a SQL agent.
You are only allowed to run read-only SELECT statements.
Do not use INSERT, UPDATE, DELETE, DROP, TRUNCATE, or ALTER.

Given an input question, create a syntactically correct PostgreSQL query to run, then return the results.

Use the following format:

Question: "..."
SQLQuery: "SELECT ..."
SQLResult: "..."
Answer: "..."

Only respond with SELECT queries. Never modify data.
""")

sql_chain = LLMSQLChain.from_llm(llm=llm, db=db, prompt=prompt, verbose=True)
agent_executor = AgentExecutor.from_chain(sql_chain, verbose=True)

response = agent_executor.run("Check if user \"s*****d\" is spamming")
print(response)

