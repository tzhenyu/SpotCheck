import pandas as pd
import re

CSV_FILE_PATH = "/home/jon/Downloads/shopee_reviews.csv"
OUTPUT_CSV_PATH = "pythonScript/shopee_reviews_no_label.csv"
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
    if isinstance(text, str):
        # Remove emojis using the pattern
        text_without_emojis = EMOJI_PATTERN.sub(r'', text)
        # Remove any zero-width spaces that might remain
        text_without_emojis = text_without_emojis.replace('\u200b', '')
        return text_without_emojis
    return text

def remove_first_column_and_save(input_csv_path: str, output_csv_path: str, max_rows: int = MAX_ROWS):
    try:
        # Read CSV file
        data_frame = pd.read_csv(input_csv_path)
        
        # Remove first column
        if data_frame.columns.size > 0:
            data_frame = data_frame.iloc[:, 1:]
        
        # Remove empty rows (rows where all cells are empty or NaN)
        data_frame = data_frame.dropna(how='all')
        
        # Also remove rows where all cells contain only whitespace
        data_frame = data_frame[~data_frame.applymap(
            lambda x: str(x).isspace() if isinstance(x, str) else False).all(axis=1)]
        
        # Limit to max_rows
        if len(data_frame) > max_rows:
            data_frame = data_frame.iloc[:max_rows]
        
        # Remove emojis from all cells
        data_frame = data_frame.applymap(remove_emojis)
        
        # Save to CSV
        data_frame.to_csv(output_csv_path, index=False)
        print(f"Output saved to {output_csv_path} with {len(data_frame)} non-empty rows")
    except Exception as error:
        print(f"Error processing CSV file: {error}")

if __name__ == "__main__":
    remove_first_column_and_save(CSV_FILE_PATH, OUTPUT_CSV_PATH)