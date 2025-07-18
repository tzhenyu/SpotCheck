import json

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

# Test the username extraction logic
metadata = test_data.get('metadata', [])
usernames = [item.get("username") if isinstance(item, dict) else None for item in metadata[:6]] if metadata else [None]*len(test_data['comments'])
print(f'\nExtracted usernames: {usernames}')
