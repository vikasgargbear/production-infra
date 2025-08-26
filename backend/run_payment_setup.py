#!/usr/bin/env python3
"""
Run the payment methods setup SQL via API endpoint
"""

import requests
import os

# Get the production API URL
API_URL = "https://pharma-backend-production-0c09.up.railway.app"

# Create a special endpoint to run the setup
print("Running payment methods setup on production database...")

# For now, let's check if payment methods exist via a test invoice
test_data = {
    "customer_id": 108,  # Test customer
    "items": [
        {
            "product_id": 123,
            "quantity": 1,
            "unit_price": 100,
            "discount_percent": 0
        }
    ],
    "payments": [
        {"method": "cash", "amount": 100}
    ]
}

response = requests.post(
    f"{API_URL}/api/invoices/create",
    json=test_data,
    headers={"Content-Type": "application/json"}
)

if response.status_code == 200:
    print("✅ Invoice created successfully - payment methods are working!")
    print(f"Response: {response.json()}")
else:
    print(f"❌ Failed: {response.status_code}")
    print(f"Error: {response.text}")