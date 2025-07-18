import requests
import json

# Test basic analysis with usernames
test_data = {
    'comments': [
        'This product is amazing, highly recommend!',
        'Great quality and fast delivery.'
    ],
    'metadata': [
        {
            'comment': 'This product is amazing, highly recommend!',
            'username': 'testuser123',
            'rating': 5,
            'source': 'test',
            'product': 'Test Product',
            'timestamp': '2025-01-15 10:30'
        },
        {
            'comment': 'Great quality and fast delivery.',
            'username': 'shopper456',
            'rating': 5,
            'source': 'test',
            'product': 'Test Product',
            'timestamp': '2025-01-15 11:45'
        }
    ],
    'product': 'Test Product'
}

print('Sending test request to backend...')
print(f'Request data: {json.dumps(test_data, indent=2)}')

try:
    response = requests.post(
        'http://localhost:8001/analyze',
        headers={'Content-Type': 'application/json'},
        json=test_data,
        timeout=30
    )
    
    print(f'Response status: {response.status_code}')
    
    if response.ok:
        data = response.json()
        print(f'Response data: {json.dumps(data, indent=2)}')
        
        # Check if usernames are preserved
        print('\nUsername preservation check:')
        for i, result in enumerate(data.get('results', [])):
            username = result.get('username')
            print(f'Comment {i+1}: username = "{username}"')
            
        # Check suspicious comments
        suspicious = data.get('suspicious_comments', [])
        print(f'\nSuspicious comments: {len(suspicious)}')
        for i, susp in enumerate(suspicious):
            username = susp.get('username')
            print(f'Suspicious {i+1}: username = "{username}"')
            
    else:
        print(f'Error response: {response.text}')
        
except Exception as e:
    print(f'Error: {e}')
