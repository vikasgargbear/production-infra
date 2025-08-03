#!/usr/bin/env python3
"""
Test order creation separately
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

print("🧪 Testing Order Creation")

# Check if orders endpoint exists
print("\n1️⃣ Checking orders endpoint...")
response = requests.get(f"{API_BASE}/orders", params={"limit": 1})
print(f"   GET /orders status: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    print(f"   Orders found: {data.get('total', 0)}")

# Try to create an order
print("\n2️⃣ Creating test order...")
order_data = {
    "org_id": ORG_ID,
    "customer_id": 35,  # Basim
    "customer_name": "Basim",
    "order_date": datetime.now().isoformat(),
    "order_type": "sales_order",
    "delivery_type": "pickup",
    "payment_mode": "cash",
    "items": [
        {
            "product_id": 47,
            "product_name": "Atlas",
            "quantity": 5,
            "unit_price": 11,
            "discount_percent": 0
        }
    ],
    "subtotal_amount": 55,
    "discount_amount": 0,
    "taxable_amount": 55,
    "cgst_amount": 3.3,
    "sgst_amount": 3.3,
    "total_tax_amount": 6.6,
    "total_amount": 61.6,
    "order_status": "confirmed"
}

response = requests.post(
    f"{API_BASE}/orders/",
    json=order_data,
    headers={"X-Org-Id": ORG_ID}
)

print(f"   POST /orders status: {response.status_code}")
if response.status_code in [200, 201]:
    result = response.json()
    print(f"   ✅ Order created: {result}")
else:
    print(f"   ❌ Error: {response.text[:500]}")