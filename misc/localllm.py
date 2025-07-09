from langchain_community.chat_models import ChatOllama
from langchain.agents import initialize_agent, AgentType
from langchain.agents.agent_toolkits import Tool
from langchain_core.prompts import MessagesPlaceholder
from langchain.agents import AgentExecutor
from langchain_core.messages import HumanMessage

# Initialize Ollama model (use an instruction-following one if possible)
llm = ChatOllama(model="mistral", temperature=0)  # You can use llama3 instead

# Optional: tools (if agent needs function-calling)
tools = []

# Agent initialization
agent_executor = initialize_agent(
    tools=tools,
    llm=llm,
    agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,  # You can try CONVERSATIONAL_REACT_DESCRIPTION too
    verbose=True
)

# User input
prompt = "ini sangat bagus terima kaaasihh!! berbaloii! Is this a fake review? Reply yes or no only."

# Run the agent
response = agent_executor.run(prompt)
print("\nFinal answer:", response)
