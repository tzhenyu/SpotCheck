#!/usr/bin/env python3
import json

# Simulate what the frontend should send
test_data = {
    'comments': ['This review seems suspicious and repetitive', 'This review also seems suspicious and repetitive'],
    'metadata': [
        {'comment': 'This review seems suspicious and repetitive', 'username': 'testuser123', 'rating': 5, 'source': 'test', 'product': 'Test Product', 'timestamp': '2025-01-15 10:30'},
        {'comment': 'This review also seems suspicious and repetitive', 'username': 'shopper456', 'rating': 5, 'source': 'test', 'product': 'Test Product', 'timestamp': '2025-01-15 11:45'}
    ],
    'product': 'Test Product'
}

print('Test data structure:')
print(json.dumps(test_data, indent=2))

# Test the backend username extraction logic
metadata = test_data.get('metadata', [])
usernames = [item.get("username") if isinstance(item, dict) else None for item in metadata[:6]] if metadata else [None]*len(test_data['comments'])
print(f'\nExtracted usernames: {usernames}')

# Test what happens if metadata is None
test_data_no_metadata = {
    'comments': ['This review seems suspicious and repetitive', 'This review also seems suspicious and repetitive'],
    'metadata': None,
    'product': 'Test Product'
}

metadata2 = test_data_no_metadata.get('metadata', [])
usernames2 = [item.get("username") if isinstance(item, dict) else None for item in metadata2[:6]] if metadata2 else [None]*len(test_data_no_metadata['comments'])
print(f'Without metadata - usernames: {usernames2}')
