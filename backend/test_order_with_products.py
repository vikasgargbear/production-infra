#\!/usr/bin/env python3
"""Test order creation with actual product IDs"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Testing Order Creation with Real Products")
print("=" * 60)

# First get a product ID
print("\n1. Getting a product ID...")
r = requests.post(f"{BASE_URL}/products/", json={
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "product_code": f"TEST{datetime.now().strftime('%H%M%S')}",
    "product_name": "Test Product for Order",
    "generic_name": "Test",
    "brand": "Test Brand",
    "manufacturer": "Test Mfg",
    "product_type": "tablet",
    "hsn_code": "30049099",
    "gst_percentage": 12,
    "is_active": True,
    "is_saleable": True,
    "pack_config": {"base_uom": "tablet"}
})

if r.status_code in [200, 201]:
    product = r.json()
    product_id = product.get('product_id')
    print(f"✅ Created product with ID: {product_id}")
else:
    print(f"Failed to create product, using ID 50")
    product_id = 50  # Use the Paracetamol we created earlier

# Now create an order
print(f"\n2. Creating order with product_id={product_id}...")
order_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "sales",
    "items": [
        {
            "product_id": product_id,
            "quantity": 5,
            "unit_price": 100
        }
    ]
}

r = requests.post(f"{BASE_URL}/orders/", json=order_data)
print(f"Status: {r.status_code}")
if r.status_code in [200, 201]:
    print("✅ SUCCESS - Order created\!")
    order = r.json()
    print(f"Order ID: {order.get('order_id')}")
    print(f"Order Number: {order.get('order_number')}")
else:
    print("❌ FAILED")
    print(f"Error: {r.text[:500]}")

print("\n" + "=" * 60)
