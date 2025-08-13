#!/usr/bin/env python3
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

# Test with explicit created_by
payment_data = {
    'org_id': 'ad808530-1ddb-4377-ab20-67bef145d80d',
    'customer_id': 1,
    'payment_type': 'advance_payment', 
    'amount': 100.00,
    'payment_mode': 'cash',
    'payment_date': '2024-01-15',
    'created_by': 1  # Explicitly provide created_by
}

print("Testing payment with created_by=1...")
response = requests.post(f"{BASE_URL}/payments/", json=payment_data)
print(f'Status: {response.status_code}')
if response.status_code != 200:
    print(f'Error: {response.text[:500]}')