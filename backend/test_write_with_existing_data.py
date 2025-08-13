#\!/usr/bin/env python3
"""Test write operations with existing data from the database"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Testing Write Operations with Existing Data")
print("=" * 60)

# First, get existing product ID
print("\n1. Getting existing product...")
r = requests.get(f"{BASE_URL}/products/?limit=1")
if r.status_code == 200:
    products = r.json()
    if products and len(products) > 0:
        product_id = products[0].get('product_id')
        print(f"Found product ID: {product_id}")
    else:
        print("No products found, using default ID 1")
        product_id = 1
else:
    print(f"Failed to get products: {r.status_code}")
    product_id = 1

# Test Order Create with actual product
print("\n2. ORDER CREATE with existing product...")
order_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "sales",
    "items": [
        {
            "product_id": product_id,  # Use actual product ID
            "quantity": 10,
            "unit_price": 50
        }
    ]
}
r = requests.post(f"{BASE_URL}/orders/", json=order_data)
print(f"Status: {r.status_code} - {'✅ SUCCESS' if r.status_code in [200, 201] else '❌ FAILED'}")
if r.status_code not in [200, 201]:
    print(f"Error: {r.text[:300]}")

# Test Purchase Create (with our fixes)
print("\n3. PURCHASE CREATE (Fixed - no supplier_contact/gst)...")
purchase_data = {
    "po_number": f"PO-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "supplier_id": 1,
    "supplier_name": "Test Supplier",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "created_by": 2
}
r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
print(f"Status: {r.status_code} - {'✅ SUCCESS' if r.status_code in [200, 201] else '❌ FAILED'}")
if r.status_code not in [200, 201]:
    print(f"Error: {r.text[:300]}")

print("\n" + "=" * 60)
print("Summary: Check results above\!")
