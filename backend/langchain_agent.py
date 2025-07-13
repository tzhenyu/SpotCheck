from langchain.tools import tool
from langgraph.agent import create_agent, AgentConfig
from langchain.schema import AgentAction, AgentFinish
from typing import Any, Dict
from backend import (
    query_duplicate_comment_across_products,
    query_user_many_reviews_quickly,
    query_same_comment_multiple_users_products,
    query_generic_comment_across_products,
    query_high_avg_rating_users,
    query_review_burst,
    semantic_search
    
)

def _wrap_tool(fn, name, description, arg_names=None):
    if arg_names is None:
        arg_names = ["table_name"]
    @tool(name=name, description=description)
    def wrapped_tool(*args, **kwargs):
        if len(arg_names) == 1:
            return fn(args[0])
        return fn(**{k: v for k, v in zip(arg_names, args)})
    return wrapped_tool

duplicate_comment_tool = _wrap_tool(
    query_duplicate_comment_across_products,
    "query_duplicate_comment_across_products",
    "Find duplicate comments across products."
)

user_many_reviews_tool = _wrap_tool(
    query_user_many_reviews_quickly,
    "query_user_many_reviews_quickly",
    "Find users who posted many reviews quickly."
)

same_comment_tool = _wrap_tool(
    query_same_comment_multiple_users_products,
    "query_same_comment_multiple_users_products",
    "Find same comment posted by multiple users across products."
)

generic_comment_tool = _wrap_tool(
    query_generic_comment_across_products,
    "query_generic_comment_across_products",
    "Find generic comments across products."
)

high_avg_rating_tool = _wrap_tool(
    query_high_avg_rating_users,
    "query_high_avg_rating_users",
    "Find users with high average rating."
)

review_burst_tool = _wrap_tool(
    query_review_burst,
    "query_review_burst",
    "Find review bursts by minute."
)

semantic_search_tool = _wrap_tool(
    semantic_search,
    "semantic_search",
    "Semantic search for comments using pgvector.",
    ["query", "top_n"]
)

tools = [
    duplicate_comment_tool,
    user_many_reviews_tool,
    same_comment_tool,
    generic_comment_tool,
    high_avg_rating_tool,
    review_burst_tool,
    semantic_search_tool
]

config = AgentConfig(
    tools=tools,
    max_iterations=3,
    verbose=True
)

agent = create_agent(config)

# Example usage:
# result = agent.run("query_duplicate_comment_across_products", table_name="product_reviews")
# print(result)
