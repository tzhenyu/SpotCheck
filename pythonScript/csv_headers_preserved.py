"""
CSV Cleaner Script (Headers Preserved)

This script processes a Shopee reviews CSV file to:
1. Remove emojis from all text fields
2. Remove newlines from text
3. Keep the first column
4. Rename the first column heading from 'label' to 'rating'
5. Keep all headers in the CSV
6. Process rows according to the specified limit
7. Remove empty or whitespace-only rows

The processed data is saved to a new CSV file.
"""

import pandas as pd
import re
import argparse

# File paths and constants
CSV_FILE_PATH = "/home/jon/Downloads/shopee_reviews.csv"
OUTPUT_CSV_PATH = "pythonScript/shopee_reviews_with_headers.csv"
# Set to None for no limit or a positive integer to limit the number of rows
MAX_ROWS = None

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

def rename_first_column(data_frame):
    """
    Rename the first column from 'label' to 'rating'.
    
    Args:
        data_frame: Pandas DataFrame containing the columns to process
        
    Returns:
        DataFrame with the first column renamed
    """
    # Get the column names
    columns = data_frame.columns.tolist()
    
    if len(columns) > 0:
        # Replace the first column name with 'rating' if it exists
        if columns[0] == 'label':
            columns[0] = 'rating'
            data_frame.columns = columns
            print("Renamed first column from 'label' to 'rating'")
        else:
            print(f"First column is named '{columns[0]}', not 'label'. No renaming performed.")
    
    return data_frame

def process_and_save_data(input_csv_path: str, output_csv_path: str, max_rows=None):
    """
    Process the input CSV file and save the cleaned data to the output file.
    
    Processing steps:
    1. Read the CSV file
    2. Rename the first column from 'label' to 'rating'
    3. Remove empty or whitespace-only rows and rows with empty text
    4. Process text to remove emojis and newlines
    5. Save valid rows to the output file with headers (optionally limited by max_rows)
    
    Args:
        input_csv_path: Path to the input CSV file
        output_csv_path: Path where the processed CSV will be saved
        max_rows: Maximum number of rows to include in the output file (None for all rows)
    """
    try:
        # Read CSV file with low_memory=False to avoid DtypeWarning
        print(f"Reading CSV file from {input_csv_path}...")
        data_frame = pd.read_csv(input_csv_path, low_memory=False)
        print(f"Read {len(data_frame)} rows and {len(data_frame.columns)} columns")
        
        # Rename the first column from 'label' to 'rating'
        data_frame = rename_first_column(data_frame)
        
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
        
        # Process all columns by name to preserve column order and headers
        for col in data_frame.columns:
            if data_frame[col].dtype == 'object':  # Only process string columns
                data_frame[col] = data_frame[col].apply(remove_emojis)
                data_frame[col] = data_frame[col].apply(remove_newlines)
                print(f"Processed column: {col}")
        
        # Do a final check for any rows where text might be empty
        # Convert empty strings to NaN so they get caught by dropna
        empty_count_before = len(data_frame)
        
        # Check text columns for empty text
        for col in data_frame.columns:
            if data_frame[col].dtype == 'object':  # Only process string columns
                data_frame[col] = data_frame[col].replace('', pd.NA)
        
        # Remove any rows where any column is NA
        data_frame = data_frame.dropna()
        empty_count_after = len(data_frame)
        
        if empty_count_before - empty_count_after > 0:
            print(f"Removed {empty_count_before - empty_count_after} rows with empty text")
        
        # Limit to max_rows if specified
        original_row_count = len(data_frame)
        if max_rows is not None and len(data_frame) > max_rows:
            data_frame = data_frame.iloc[:max_rows]
            print(f"Limited output to {max_rows} rows (from {original_row_count} available rows)")
        
        # Save to CSV with headers
        data_frame.to_csv(output_csv_path, index=False, header=True)
        print(f"Output saved to {output_csv_path} with {len(data_frame)} non-empty rows (with headers)")
    except Exception as error:
        print(f"Error processing CSV file: {error}")

if __name__ == "__main__":
    # Set up command-line argument parsing
    parser = argparse.ArgumentParser(description='Process Shopee reviews CSV file (preserving headers)')
    parser.add_argument('--max-rows', type=int, default=MAX_ROWS,
                        help='Maximum number of rows to include in the output file (default: no limit)')
    parser.add_argument('--input', type=str, default=CSV_FILE_PATH,
                        help=f'Path to input CSV file (default: {CSV_FILE_PATH})')
    parser.add_argument('--output', type=str, default=OUTPUT_CSV_PATH,
                        help=f'Path to output CSV file (default: {OUTPUT_CSV_PATH})')
    
    args = parser.parse_args()
    
    # If --max-rows=0 is specified, treat it as None (no limit)
    max_rows = None if args.max_rows == 0 else args.max_rows
    
    # Process the data with the specified parameters
    process_and_save_data(args.input, args.output, max_rows)
