#!/usr/bin/env python3
"""
Simple test to create invoice with minimal data
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

print("🧪 Simple Invoice Test")

# Minimal invoice data
invoice_data = {
    "customer_id": 35,  # Basim
    "customer_name": "Basim",
    "invoice_date": datetime.now().isoformat(),
    "items": [
        {
            "product_id": 47,  # Atlas
            "product_name": "Atlas",
            "quantity": 5,
            "unit_price": 11,
            "discount_percent": 0,
            "gst_percent": 12,
            "uom": "STRIP",
            "pack_type": "STRIP"
        }
    ],
    "subtotal_amount": 55,
    "discount_amount": 0,
    "taxable_amount": 55,
    "cgst_amount": 3.3,
    "sgst_amount": 3.3,
    "total_tax_amount": 6.6,
    "final_amount": 61.6,
    "total_amount": 61.6
}

print(f"\n📤 Creating invoice for customer {invoice_data['customer_name']}...")
print(f"   Product: {invoice_data['items'][0]['product_name']}")
print(f"   Quantity: {invoice_data['items'][0]['quantity']}")
print(f"   Total: ₹{invoice_data['total_amount']}")

response = requests.post(
    f"{API_BASE}/invoices/",
    json=invoice_data,
    headers={"X-Org-Id": ORG_ID},
    timeout=30
)

print(f"\n📥 Response: {response.status_code}")

if response.status_code in [200, 201]:
    result = response.json()
    print("\n✅ Invoice created:")
    print(f"   ID: {result.get('invoice_id')}")
    print(f"   Number: {result.get('invoice_number')}")
    print(f"   Order ID: {result.get('order_id')}")
else:
    print(f"\n❌ Error: {response.text}")