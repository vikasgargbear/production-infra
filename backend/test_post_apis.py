#!/usr/bin/env python3
"""Test POST APIs that were failing"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Testing POST/Create APIs...")
print("=" * 60)

# Test creating a payment
payment_data = {
    "customer_id": 1,
    "payment_type": "advance_payment",
    "amount": 100,
    "payment_mode": "cash",
    "payment_date": "2024-01-15"
}

print("1. Testing Payment Create...")
try:
    response = requests.post(f"{BASE_URL}/payments/", json=payment_data)
    if response.status_code == 200:
        print("   ✅ Payment Create - Working")
    else:
        print(f"   ❌ Payment Create - Error {response.status_code}")
        print(f"   Details: {response.text[:200]}")
except Exception as e:
    print(f"   ❌ Payment Create - Error: {str(e)}")

# Test creating a purchase
purchase_data = {
    "supplier_id": 1,
    "items": [
        {
            "product_id": 1,
            "quantity": 10,
            "rate": 100
        }
    ],
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "final_amount": 1120
}

print("\n2. Testing Purchase Create...")
try:
    response = requests.post(f"{BASE_URL}/purchases-enhanced/with-items", json=purchase_data)
    if response.status_code == 200:
        print("   ✅ Purchase Create - Working")
    else:
        print(f"   ❌ Purchase Create - Error {response.status_code}")
        print(f"   Details: {response.text[:200]}")
except Exception as e:
    print(f"   ❌ Purchase Create - Error: {str(e)}")

print("\n" + "=" * 60)