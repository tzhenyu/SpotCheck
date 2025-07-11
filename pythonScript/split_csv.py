"""
CSV Splitter Script

This script processes a Shopee reviews CSV file to:
1. Remove emojis from all text fields
2. Remove newlines from text
3. Remove the first column entirely
4. Remove all headers from the CSV
5. Remove empty or whitespace-only rows
6. Split the processed data into 6 separate CSV files, each containing 10,000 unique rows

The processed data is saved to multiple CSV files, each with 10,000 rows.
"""

import pandas as pd
import re
import argparse
import os

# File paths and constants
CSV_FILE_PATH = "/home/jon/Downloads/shopee_reviews.csv"
OUTPUT_DIR = "pythonScript/split_files"
ROWS_PER_FILE = 10000
TOTAL_FILES = 6

# Enhanced emoji pattern to catch more variations
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F700-\U0001F77F"  # alchemical symbols
    "\U0001F780-\U0001F7FF"  # Geometric Shapes
    "\U0001F800-\U0001F8FF"  # Supplemental Arrows-C
    "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
    "\U0001FA00-\U0001FA6F"  # Chess Symbols
    "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
    "\U00002702-\U000027B0"  # Dingbats
    "\U000024C2-\U0001F251"  # Enclosed characters
    "\U0001F1E0-\U0001F1FF"  # flags (iOS)
    "\U00002500-\U00002BEF"  # Chinese/Japanese/Korean symbols
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001f926-\U0001f937"
    "\U00010000-\U0010ffff"
    "\u200d"  # Zero width joiner
    "\u2640-\u2642" 
    "\u2600-\u2B55"
    "\u23cf"
    "\u23e9"
    "\u231a"
    "\u3030"
    "\ufe0f"  # Variation selector
    "\u20d0-\u20ff"  # Combining diacritical marks for symbols
    "]+",
    flags=re.UNICODE
)

def remove_emojis(text):
    """
    Remove emojis and special characters from text.
    
    Args:
        text: Input text that may contain emojis
        
    Returns:
        Text with emojis removed
    """
    if isinstance(text, str):
        # Remove emojis using the pattern
        text_without_emojis = EMOJI_PATTERN.sub(r'', text)
        # Remove any zero-width spaces that might remain
        text_without_emojis = text_without_emojis.replace('\u200b', '')
        return text_without_emojis
    return text

def remove_newlines(text):
    """
    Remove newlines and carriage returns from text.
    
    Args:
        text: Input text that may contain newlines
        
    Returns:
        Text with newlines replaced by spaces
    """
    if isinstance(text, str):
        return text.replace('\n', ' ').replace('\r', ' ')
    return text

def remove_first_column(data_frame):
    """
    Remove the first column from the DataFrame.
    
    Args:
        data_frame: Pandas DataFrame containing the columns to process
        
    Returns:
        DataFrame with the first column removed
    """
    if data_frame.columns.size > 0:
        return data_frame.iloc[:, 1:]
    return data_frame

def process_and_split_data(input_csv_path, output_dir, rows_per_file, total_files):
    """
    Process the input CSV file and split into multiple files with specified rows per file.
    
    Processing steps:
    1. Read the CSV file
    2. Remove the first column
    3. Remove empty or whitespace-only rows and rows with empty text
    4. Process text to remove emojis and newlines
    5. Split the processed data into multiple files, each with specified number of rows
    
    Args:
        input_csv_path: Path to the input CSV file
        output_dir: Directory where the processed CSV files will be saved
        rows_per_file: Number of rows per output file
        total_files: Total number of files to create
    """
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Read CSV file with low_memory=False to avoid DtypeWarning
        print(f"Reading CSV file from {input_csv_path}...")
        data_frame = pd.read_csv(input_csv_path, low_memory=False)
        print(f"Read {len(data_frame)} rows and {len(data_frame.columns)} columns")
        
        # Remove the first column
        data_frame = remove_first_column(data_frame)
        print(f"Removed first column, now have {len(data_frame.columns)} columns")
        
        # Remove rows where all cells are NaN
        original_row_count = len(data_frame)
        data_frame = data_frame.dropna(how='all')
        print(f"Removed {original_row_count - len(data_frame)} completely empty (NaN) rows")
        
        # Remove rows where all cells contain only whitespace or empty strings
        original_row_count = len(data_frame)
        
        # Create a mask for rows where:
        # 1. All string columns are empty strings or only whitespace
        # 2. Non-string columns are either True (to ignore them) or empty
        whitespace_mask = data_frame.apply(
            lambda col: ~col.astype(str).str.strip().astype(bool) if col.dtype == 'object' else True)
        
        # Remove rows that are effectively empty (all columns are empty/whitespace)
        data_frame = data_frame[~whitespace_mask.all(axis=1)]
        
        # Additional check for rows where 'text' column is empty but not NaN
        if 'text' in data_frame.columns:
            # Find rows where text is empty string or just a whitespace (not NaN)
            empty_text_mask = data_frame['text'].astype(str).str.strip() == ""
            
            # Count rows that would be removed
            empty_text_count = empty_text_mask.sum()
            if empty_text_count > 0:
                print(f"Found {empty_text_count} rows with empty text values")
                
            # Remove rows with empty text values
            data_frame = data_frame[~empty_text_mask]
            
        print(f"Removed {original_row_count - len(data_frame)} empty/whitespace-only rows")
        
        # After all the filtering, report how many rows we have
        print(f"After filtering, found {len(data_frame)} rows")
        
        # Process all text columns to remove emojis and newlines
        print("Processing text to remove emojis and newlines...")
        # Process all columns 
        for col_idx in range(len(data_frame.columns)):
            data_frame.iloc[:, col_idx] = data_frame.iloc[:, col_idx].apply(remove_emojis)
            data_frame.iloc[:, col_idx] = data_frame.iloc[:, col_idx].apply(remove_newlines)
        
        # Do a final check for any rows where text might be empty
        # Convert empty strings to NaN so they get caught by dropna
        empty_count_before = len(data_frame)
        
        # Check all columns for empty text
        for col_idx in range(len(data_frame.columns)):
            data_frame.iloc[:, col_idx] = data_frame.iloc[:, col_idx].replace('', pd.NA)
        
        # Remove any rows where any column is NA
        data_frame = data_frame.dropna()
        empty_count_after = len(data_frame)
        
        if empty_count_before - empty_count_after > 0:
            print(f"Removed {empty_count_before - empty_count_after} rows with empty text")
        
        # Process other columns if needed
        other_cols = [col for col in data_frame.columns if col != 'text' and col != 'label' and data_frame[col].dtype == 'object']
        if other_cols:
            print(f"Removing emojis from {len(other_cols)} additional columns...")
            for col in other_cols:
                data_frame[col] = data_frame[col].apply(remove_emojis)
        
        # Ensure we have enough rows for all files
        total_rows_needed = rows_per_file * total_files
        if len(data_frame) < total_rows_needed:
            print(f"Warning: Not enough rows to create {total_files} files with {rows_per_file} rows each.")
            print(f"Available rows: {len(data_frame)}, needed: {total_rows_needed}")
            print(f"Will create as many complete files as possible.")
            total_files = len(data_frame) // rows_per_file
            print(f"Will create {total_files} files.")
        
        # Split the data into multiple files
        print(f"Splitting data into {total_files} files with {rows_per_file} rows each...")
        
        # Shuffle the data to ensure random distribution across files
        data_frame = data_frame.sample(frac=1, random_state=42).reset_index(drop=True)
        
        for i in range(total_files):
            # Calculate start and end indices for this chunk
            start_idx = i * rows_per_file
            end_idx = start_idx + rows_per_file
            
            # Extract chunk of data
            chunk = data_frame.iloc[start_idx:end_idx]
            
            # Create output filename
            output_file = os.path.join(output_dir, f"shopee_reviews_part{i+1}.csv")
            
            # Save to CSV without headers
            chunk.to_csv(output_file, index=False, header=False)
            print(f"Saved {len(chunk)} rows to {output_file}")
        
        print(f"Successfully created {total_files} files with {rows_per_file} rows each.")
        print(f"Output files are in directory: {output_dir}")
        
    except Exception as error:
        print(f"Error processing CSV file: {error}")

if __name__ == "__main__":
    # Set up command-line argument parsing
    parser = argparse.ArgumentParser(description='Split Shopee reviews CSV file into multiple files')
    parser.add_argument('--input', type=str, default=CSV_FILE_PATH,
                        help=f'Path to input CSV file (default: {CSV_FILE_PATH})')
    parser.add_argument('--output-dir', type=str, default=OUTPUT_DIR,
                        help=f'Directory for output CSV files (default: {OUTPUT_DIR})')
    parser.add_argument('--rows-per-file', type=int, default=ROWS_PER_FILE,
                        help=f'Number of rows per output file (default: {ROWS_PER_FILE})')
    parser.add_argument('--total-files', type=int, default=TOTAL_FILES,
                        help=f'Total number of files to create (default: {TOTAL_FILES})')
    
    args = parser.parse_args()
    
    # Process the data with the specified parameters
    process_and_split_data(args.input, args.output_dir, args.rows_per_file, args.total_files)
