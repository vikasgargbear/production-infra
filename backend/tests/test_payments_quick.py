"""
Quick test for payments API
"""
import requests
import json
from datetime import date

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

# Test 1: Create a general payment
payment_data = {
    "customer_id": 13,
    "payment_type": "advance_payment",
    "amount": 1000.00,
    "payment_mode": "cash",
    "payment_date": date.today().isoformat(),
    "notes": "Test payment"
}

print("Testing POST /payments:")
response = requests.post(f"{BASE_URL}/payments", json=payment_data, headers=HEADERS)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    print(f"✅ Payment created: {response.json()}")
else:
    print(f"❌ Error: {response.text[:300]}")

# Test 2: Get outstanding invoices
print("\nTesting GET /payments/outstanding:")
response = requests.get(f"{BASE_URL}/payments/outstanding?customer_id=13", headers=HEADERS)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f"✅ Found {len(data) if isinstance(data, list) else data.get('total', 0)} outstanding invoices")
else:
    print(f"❌ Error: {response.text[:300]}")

# Test 3: Get aging report
print("\nTesting GET /payments/aging-report:")
response = requests.get(f"{BASE_URL}/payments/aging-report", headers=HEADERS)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    print(f"✅ Aging report retrieved")
else:
    print(f"❌ Error: {response.text[:300]}")