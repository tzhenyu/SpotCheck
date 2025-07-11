import os
import weaviate
from weaviate.classes.init import Auth
from weaviate.classes.query import MetadataQuery

# Best practice: store your credentials in environment variables
weaviate_url = os.environ["WEAVIATE_URL"]
weaviate_api_key = os.environ["WEAVIATE_API_KEY"]

# Connect to Weaviate Cloud
client = weaviate.connect_to_weaviate_cloud(
    cluster_url=weaviate_url,
    auth_credentials=Auth.api_key(weaviate_api_key),
)
def check_weaviate_connection():
    try:
        client = weaviate.connect_to_weaviate_cloud(
            cluster_url=weaviate_url,
            auth_credentials=Auth.api_key(weaviate_api_key),
        )
        is_ready = client.is_ready()
        client.close()
        return is_ready
    except Exception as error:
        print(f"Error checking Weaviate connection: {error}")
        return False

jeopardy = client.collections.get("Kaggle_shopee_review_119k")
response = jeopardy.query.near_text(
    query="this thing sucks ass",
    limit=5,
    return_metadata=MetadataQuery(distance=True)
)

print(client.is_ready())

for o in response.objects:
    print(o.properties)
    print(o.metadata.distance)

    

client.close()
