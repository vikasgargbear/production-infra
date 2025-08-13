#!/usr/bin/env python3
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

# Test with your actual user_id=2
payment_data = {
    'org_id': 'ad808530-1ddb-4377-ab20-67bef145d80d',
    'customer_id': 32,  # Use the customer you showed me
    'payment_type': 'advance_payment', 
    'amount': 100.00,
    'payment_mode': 'cash',
    'payment_date': '2024-01-15',
    'created_by': 2  # Use your actual admin user
}

print("Testing payment with created_by=2 (your admin user)...")
response = requests.post(f"{BASE_URL}/payments/", json=payment_data)
print(f'Status: {response.status_code}')
if response.status_code == 200:
    print("✅ SUCCESS! Payment created!")
    print(json.dumps(response.json(), indent=2))
else:
    print(f'❌ Error: {response.text[:500]}')