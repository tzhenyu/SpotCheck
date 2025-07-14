import csv

def extract_10k_records_from_csv(file_path):
    RECORD_LIMIT = 1000
    records = []
    try:
        with open(file_path, mode='r', newline='', encoding='utf-8') as csvfile:
            reader = csv.reader(csvfile)
            for i, row in enumerate(reader):
                if i >= RECORD_LIMIT:
                    break
                records.append(row)
    except Exception as e:
        print(f"Error extracting records from {file_path}: {e}")
    return records

def save_records_to_csv(records, output_file_path):
    try:
        with open(output_file_path, mode='w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            writer.writerows(records)
    except Exception as e:
        print(f"Error saving records to {output_file_path}: {e}")

records = extract_10k_records_from_csv("backend/shopee_reviews_with_headers.csv")
save_records_to_csv(records, "backend/shopee_reviews_10k.csv")