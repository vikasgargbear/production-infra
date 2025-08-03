#!/usr/bin/env python3
import requests

# Test products endpoint directly
response = requests.get(
    'https://pharma-backend-production-0c09.up.railway.app/api/products',
    params={'limit': 5},
    headers={'X-Org-Id': '11111111-1111-1111-1111-111111111111'}
)
print('Status:', response.status_code)
if response.status_code != 200:
    print('Error:', response.text[:500])
else:
    result = response.json()
    print('Success! Products found:', len(result.get('products', [])))
    if result.get('products'):
        print('First product:', result['products'][0])