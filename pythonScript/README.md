# Text Embedding Utility

This script generates embeddings for text data stored in a CSV file using SentenceTransformer models.

## Features

- Generate embeddings for text data from CSV files
- Save embeddings to a pickle file for later use
- Search for similar texts using the generated embeddings
- Customizable batch processing to handle large datasets efficiently

## Requirements

Install the required packages using pip:

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

Generate embeddings from a CSV file:

```bash
python Embed.py --input your_data.csv --output your_embeddings.pkl
```

### Command-line Arguments

- `--input`, `-i`: Path to the input CSV file (default: shopee_reviews_no_label.csv)
- `--output`, `-o`: Path to save the embeddings output file (default: embeddings.pkl)
- `--model`, `-m`: Name of the SentenceTransformer model to use (default: all-MiniLM-L6-v2)
- `--batch-size`, `-b`: Batch size for processing (default: 64)
- `--text-column`, `-c`: Name of the column in the CSV containing the text to embed (default: text)
- `--search`, `-s`: Query text to search for similar items in the dataset
- `--top-k`, `-k`: Number of top similar results to return when searching (default: 5)
- `--load-only`, `-l`: Only load existing embeddings without generating new ones

### Examples

Generate embeddings with a larger batch size:
```bash
python Embed.py --input data.csv --batch-size 128
```

Search for similar texts in an existing embedding file:
```bash
python Embed.py --load-only --search "good quality product" --top-k 3
```

## Output

The script saves embeddings as a pickle file that can be loaded for later use. When using the search functionality, the script will display the top matching texts along with their similarity scores.
