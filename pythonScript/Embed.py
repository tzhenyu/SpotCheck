from sentence_transformers import SentenceTransformer
import pandas as pd
import numpy as np
import os
import time
import pickle
import argparse
from sklearn.metrics.pairwise import cosine_similarity

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Generate embeddings from text in a CSV file')
    parser.add_argument(
        '--input', '-i', 
        type=str, 
        default=os.path.join(os.path.dirname(__file__), 'shopee_reviews_no_label.csv'),
        help='Path to the input CSV file containing text data'
    )
    parser.add_argument(
        '--output', '-o', 
        type=str, 
        default=os.path.join(os.path.dirname(__file__), 'embeddings.pkl'),
        help='Path to save the embeddings output file'
    )
    parser.add_argument(
        '--model', '-m', 
        type=str, 
        default='all-MiniLM-L6-v2',
        help='Name of the SentenceTransformer model to use'
    )
    parser.add_argument(
        '--batch-size', '-b', 
        type=int, 
        default=64,
        help='Batch size for processing'
    )
    parser.add_argument(
        '--text-column', '-c', 
        type=str, 
        default='text',
        help='Name of the column in the CSV file containing the text to embed'
    )
    parser.add_argument(
        '--search', '-s', 
        type=str, 
        default='',
        help='Query text to search for similar items in the dataset'
    )
    parser.add_argument(
        '--top-k', '-k', 
        type=int, 
        default=5,
        help='Number of top similar results to return when searching'
    )
    parser.add_argument(
        '--load-only', '-l', 
        action='store_true',
        help='Only load existing embeddings without generating new ones'
    )
    return parser.parse_args()

def load_data(csv_path, text_column):
    """Load text data from CSV file"""
    print(f"Loading data from {csv_path}...")
    df = pd.read_csv(csv_path)
    texts = df[text_column].tolist()
    print(f"Loaded {len(texts)} text samples")
    return texts

def generate_embeddings(texts, model, batch_size):
    """Generate embeddings for a list of texts"""
    print("Generating embeddings...")
    start_time = time.time()
    
    # Process in batches to avoid memory issues with large datasets
    all_embeddings = []
    total_texts = len(texts)
    
    for i in range(0, total_texts, batch_size):
        batch_texts = texts[i:i+batch_size]
        batch_embeddings = model.encode(batch_texts)
        all_embeddings.append(batch_embeddings)
        
        # Print progress update
        progress = min((i + batch_size) / total_texts * 100, 100)
        elapsed = time.time() - start_time
        print(f"Progress: {progress:.1f}% - Processed {i+len(batch_texts)}/{total_texts} samples ({elapsed:.1f}s)")
    
    # Combine all batches
    embeddings = np.vstack(all_embeddings)
    
    print(f"Embedding generation completed in {time.time() - start_time:.1f} seconds")
    print(f"Embeddings shape: {embeddings.shape}")
    
    return embeddings

def save_embeddings(embeddings, path):
    """Save embeddings to a file"""
    print(f"Saving embeddings to {path}...")
    with open(path, 'wb') as f:
        pickle.dump(embeddings, f)
    print("Embeddings saved successfully")

def search_similar_texts(query_text, embeddings, texts, model, top_k=5):
    """Search for similar texts using cosine similarity"""
    print(f"Searching for texts similar to: '{query_text}'")
    
    # Generate embedding for the query text
    query_embedding = model.encode([query_text])[0]
    
    # Reshape for cosine similarity
    query_embedding = query_embedding.reshape(1, -1)
    
    # Calculate cosine similarity
    similarities = cosine_similarity(query_embedding, embeddings)[0]
    
    # Get the indices of the top-k most similar texts
    top_indices = np.argsort(similarities)[::-1][:top_k]
    
    results = []
    for i, idx in enumerate(top_indices):
        results.append({
            'rank': i + 1,
            'text': texts[idx],
            'similarity': similarities[idx]
        })
    
    return results

def load_embeddings(path):
    """Load embeddings from a file"""
    print(f"Loading embeddings from {path}...")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Embedding file not found: {path}")
        
    with open(path, 'rb') as f:
        embeddings = pickle.load(f)
    
    print(f"Loaded embeddings with shape: {embeddings.shape}")
    return embeddings

def main():
    print("Starting embedding generation process...")
    
    # Parse command line arguments
    args = parse_arguments()
    
    # Initialize the model
    model = SentenceTransformer(args.model)
    print(f"Loaded model: {model}")
    
    # If search mode and embeddings exist, load them
    if args.search and args.load_only and os.path.exists(args.output):
        embeddings = load_embeddings(args.output)
        texts = load_data(args.input, args.text_column)
        
        # Perform search
        results = search_similar_texts(args.search, embeddings, texts, model, args.top_k)
        
        # Display results
        print("\nSearch Results:")
        for result in results:
            print(f"Rank {result['rank']} (Similarity: {result['similarity']:.4f}):")
            print(f"  {result['text']}")
            print()
            
    else:
        # Load data
        texts = load_data(args.input, args.text_column)
        
        if args.load_only and os.path.exists(args.output):
            embeddings = load_embeddings(args.output)
        else:
            # Generate embeddings
            embeddings = generate_embeddings(texts, model, args.batch_size)
            # Save embeddings
            save_embeddings(embeddings, args.output)
        
        # If search query provided, search for similar texts
        if args.search:
            results = search_similar_texts(args.search, embeddings, texts, model, args.top_k)
            
            # Display results
            print("\nSearch Results:")
            for result in results:
                print(f"Rank {result['rank']} (Similarity: {result['similarity']:.4f}):")
                print(f"  {result['text']}")
                print()
    
    print("Process completed successfully!")

if __name__ == "__main__":
    main()

