"""
CSV Cleaner Script

This script processes a Shopee reviews CSV file to:
1. Remove emojis from all text fields
2. Remove newlines from text
3. Remove the first column entirely
4. Remove all headers from the CSV
5. Limit the output to a maximum number of rows (10,000)
6. Remove empty or whitespace-only rows

The processed data is saved to a new CSV file.
"""

import pandas as pd
import re

# File paths and constants
CSV_FILE_PATH = "/home/jon/Downloads/shopee_reviews.csv"
OUTPUT_CSV_PATH = "pythonScript/shopee_reviews_cleaned.csv"
MAX_ROWS = 10000

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

def process_and_save_data(input_csv_path: str, output_csv_path: str, max_rows: int = MAX_ROWS):
    """
    Process the input CSV file and save the cleaned data to the output file.
    
    Processing steps:
    1. Read the CSV file (reading more rows than needed to account for filtering)
    2. Remove the first column
    3. Remove empty or whitespace-only rows and rows with empty text
    4. Process text to remove emojis and newlines
    5. Ensure exactly max_rows valid rows in the output
    6. Save to the output CSV file without headers
    
    Args:
        input_csv_path: Path to the input CSV file
        output_csv_path: Path where the processed CSV will be saved
        max_rows: Maximum number of rows to include in the output
    """
    try:
        # Read CSV file with low_memory=False to avoid DtypeWarning
        # Read more rows than needed to account for filtering
        print(f"Reading CSV file from {input_csv_path}...")
        # Read at least max_rows*1.1 to account for filtering
        rows_to_read = int(max_rows * 1.1)
        data_frame = pd.read_csv(input_csv_path, low_memory=False, nrows=rows_to_read)
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
        
        # After all the filtering, check if we have enough rows
        print(f"After filtering, found {len(data_frame)} rows")
        
        # If we don't have enough rows, read more from the file
        while len(data_frame) < max_rows:
            # Calculate how many more rows we need
            rows_needed = max_rows - len(data_frame)
            print(f"Need {rows_needed} more rows to reach target of {max_rows}")
            
            try:
                # Get the number of the last row we processed
                last_row = max(data_frame.index.max() + 1, len(data_frame)) if not data_frame.empty else 0
                
                # Read more rows than we need to account for filtering
                additional_rows_to_read = rows_needed * 2
                print(f"Reading {additional_rows_to_read} additional rows starting from row {last_row + 1}")
                
                # Skip the header and the rows we've already processed
                additional_data = pd.read_csv(input_csv_path, 
                                            skiprows=range(1, last_row + 1), 
                                            header=0,
                                            nrows=additional_rows_to_read,
                                            low_memory=False)
                
                if len(additional_data) == 0:
                    print("No more data available to read")
                    break
                    
                # Process the additional data through the same pipeline
                additional_data = remove_first_column(additional_data)
                additional_data = additional_data.dropna(how='all')
                
                # Remove whitespace-only rows
                whitespace_mask = additional_data.apply(
                    lambda col: ~col.astype(str).str.strip().astype(bool) if col.dtype == 'object' else True)
                additional_data = additional_data[~whitespace_mask.all(axis=1)]
                
                # Clean all columns
                for col_idx in range(len(additional_data.columns)):
                    # Process text in each column
                    additional_data.iloc[:, col_idx] = additional_data.iloc[:, col_idx].apply(remove_emojis)
                    additional_data.iloc[:, col_idx] = additional_data.iloc[:, col_idx].apply(remove_newlines)
                
                # Remove empty text values in any column
                additional_data = additional_data[additional_data.astype(str).apply(lambda x: x.str.strip() != "").all(axis=1)]
                
                # Append to our existing dataframe
                data_frame = pd.concat([data_frame, additional_data])
                print(f"After adding additional rows, now have {len(data_frame)} rows")
                
            except Exception as e:
                print(f"Error reading additional rows: {e}")
                break
        
        # Limit to max_rows
        if len(data_frame) > max_rows:
            data_frame = data_frame.iloc[:max_rows]
            print(f"Limited output to {max_rows} rows")
        
        # Process all text columns to remove emojis and newlines
        # After removing the first column and headers, we need to work with column indices
        print("Processing text to remove emojis and newlines...")
        # Process all columns (there should be only one after removing the first column)
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
            
        # If we're below max_rows, try to get additional rows to reach the target
        if len(data_frame) < max_rows:
            try:
                # Read additional rows beyond what we've seen so far
                additional_data = pd.read_csv(input_csv_path, low_memory=False, 
                                            skiprows=range(1, max(data_frame.index.max() + 1, max_rows) + 1),
                                            header=0,
                                            nrows=(max_rows - len(data_frame)) * 2)  # Get 2x what we need
                
                if len(additional_data) > 0:
                    print(f"Adding {len(additional_data)} additional rows to reach target count")
                    
                    # Process these new rows
                    additional_data = remove_first_column(additional_data)
                    
                    # Clean all columns in the additional data
                    for col_idx in range(len(additional_data.columns)):
                        additional_data.iloc[:, col_idx] = additional_data.iloc[:, col_idx].apply(remove_emojis)
                        additional_data.iloc[:, col_idx] = additional_data.iloc[:, col_idx].apply(remove_newlines)
                    
                    # Remove empty rows
                    additional_data = additional_data.dropna()
                    additional_data = additional_data[additional_data.astype(str).apply(lambda x: x.str.strip() != "").all(axis=1)]
                    
                    # Add to our dataframe
                    data_frame = pd.concat([data_frame, additional_data])
                    
                    # Make sure we have exactly max_rows
                    if len(data_frame) > max_rows:
                        data_frame = data_frame.iloc[:max_rows]
            except Exception as e:
                print(f"Error trying to add more rows: {e}")
        
        # Process other columns if needed
        other_cols = [col for col in data_frame.columns if col != 'text' and col != 'label' and data_frame[col].dtype == 'object']
        if other_cols:
            print(f"Removing emojis from {len(other_cols)} additional columns...")
            for col in other_cols:
                data_frame[col] = data_frame[col].apply(remove_emojis)
        
        # Save to CSV without headers
        data_frame.to_csv(output_csv_path, index=False, header=False)
        print(f"Output saved to {output_csv_path} with {len(data_frame)} non-empty rows (no headers)")
    except Exception as error:
        print(f"Error processing CSV file: {error}")

if __name__ == "__main__":
    process_and_save_data(CSV_FILE_PATH, OUTPUT_CSV_PATH)