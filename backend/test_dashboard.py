import requests
import json

base_url = 'http://localhost:8000/api/dashboard'

endpoints = [
    '/kpis',
    '/sales-analytics', 
    '/inventory-summary',
    '/top-customers',
    '/financial-summary',
    '/top-products',
    '/expiry-alerts',
    '/low-stock-alerts',
    '/pending-payments',
    '/recent-activities'
]

print('Testing Dashboard Endpoints:')
print('='*50)

for endpoint in endpoints:
    try:
        response = requests.get(f'{base_url}{endpoint}?org_id=test')
        status = '✓ PASSED' if response.status_code == 200 else f'✗ FAILED ({response.status_code})'
        print(f'{endpoint:<25} {status}')
        if response.status_code != 200:
            print(f'  Error: {response.text[:200]}')
    except Exception as e:
        print(f'{endpoint:<25} ✗ FAILED (Connection Error)')
        print(f'  Error: {str(e)[:100]}')
