#!/usr/bin/env python3
"""Test the fixed write operations"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
USER_ID = 2

print("Testing Fixed Write Operations")
print("=" * 60)

# 1. Test Fixed Purchase Create
print("\n1. PURCHASE CREATE (Fixed)...")
purchase_data = {
    "po_number": f"PO-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "supplier_id": 1,
    "supplier_name": "Test Supplier",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "created_by": USER_ID
}
r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
print(f"Status: {r.status_code} - {'✅ SUCCESS' if r.status_code in [200, 201] else '❌ FAILED'}")
if r.status_code not in [200, 201]:
    print(f"Error: {r.text[:200]}")

# 2. Test Fixed Order Create  
print("\n2. ORDER CREATE (Fixed)...")
order_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",  # Added org_id
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "sales",  # Changed from "regular" to "sales"
    "items": [  # Must have at least 1 item
        {
            "product_id": 1,
            "quantity": 10,
            "unit_price": 50
        }
    ],
    "subtotal_amount": 500,
    "tax_amount": 60,
    "final_amount": 560
}
r = requests.post(f"{BASE_URL}/orders/", json=order_data)
print(f"Status: {r.status_code} - {'✅ SUCCESS' if r.status_code in [200, 201] else '❌ FAILED'}")
if r.status_code not in [200, 201]:
    print(f"Error: {r.text[:200]}")

# 3. Test Fixed Customer Create
print("\n3. CUSTOMER CREATE (Fixed)...")
customer_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_code": f"CUST{datetime.now().strftime('%H%M%S')}",
    "customer_name": f"Test Customer {datetime.now().strftime('%H%M')}",
    "customer_type": "retail",
    "phone": "9999999999",  # Changed from primary_phone to phone
    "credit_limit": 10000,
    "credit_days": 30
}
r = requests.post(f"{BASE_URL}/customers/", json=customer_data)
print(f"Status: {r.status_code} - {'✅ SUCCESS' if r.status_code in [200, 201] else '❌ FAILED'}")
if r.status_code not in [200, 201]:
    print(f"Error: {r.text[:200]}")
else:
    # If customer created, test update
    if r.status_code in [200, 201]:
        try:
            new_customer = r.json()
            customer_id = new_customer.get('customer_id')
            
            print("\n4. CUSTOMER UPDATE (Testing)...")
            update_data = {"customer_name": "Updated Test Customer"}
            r2 = requests.put(f"{BASE_URL}/customers/{customer_id}", json=update_data)
            print(f"Status: {r2.status_code} - {'✅ SUCCESS' if r2.status_code in [200, 201] else '❌ FAILED'}")
            
            # Note: Customer delete route doesn't exist in the API
        except:
            pass

print("\n" + "=" * 60)
print("Summary: Check if all operations are now working!")