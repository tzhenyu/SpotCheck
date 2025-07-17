from langchain.agents.agent_toolkits import create_sql_agent
from langchain.chains import LLMChain
from langchain_community.agent_toolkits import create_sql_agent
from langchain_ollama import OllamaLLM
from langchain_community.utilities.sql_database import SQLDatabase
from dotenv import load_dotenv
import os
import psycopg2
import warnings
from sqlalchemy.exc import SAWarning
from langchain.prompts import PromptTemplate


load_dotenv()

DB_CONFIG = {
    "dbname": os.getenv("DBNAME"),
    "user": os.getenv("DB_USER"),  # Changed from USER to DB_USER to avoid system env variable conflict
    "password": os.getenv("PASSWORD"),
    "host": os.getenv("HOST"),
    "port": int(os.getenv("PORT", 5432))
}


llm = OllamaLLM(model="llama3-groq-tool-use:8b")

db = SQLDatabase.from_uri(
    f"postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
)
agent_executor = create_sql_agent(
    llm=llm,
    db=db,
    agent_type="zero-shot-react-description",
    verbose=True,
    handle_parsing_errors=True
)

explanation_prompt = PromptTemplate(
    input_variables=["username", "sql_result"],
    template="""
You are a behavioral analyst detecting fake reviews.
Given the username '{username}' and the following behavior analysis result:

{sql_result}

Explain if this user's behavior looks suspicious. Be concise and technical.
"""
)

behavior_explainer = LLMChain(
    llm=llm,
    prompt=explanation_prompt
)


USER_PROMPT = (
    "Check if the user with username 's*****d' is posting duplicate or spammy comments across multiple products in the 'product_reviews' table. "
    "Use only the columns: comment, username, rating, source, product, page_timestamp, embedding. "
    "The unique constraint is on (comment, username, rating, source, product, page_timestamp). "
    "Write a SELECT query to find if this user has posted the same comment on different products, or posted many reviews in a short time. "
    "If possible, show the SQL query and the results. If not enough data, state what is missing."
)

agent_result = agent_executor.invoke({"input": USER_PROMPT})
sql_result = str(agent_result["output"])  # May vary depending on return structure

username = "s*****d"  # You might parse this out dynamically

explanation = behavior_explainer.run(username=username, sql_result=sql_result)

print("\n🧠 Explanation from LLM:")
print(explanation)