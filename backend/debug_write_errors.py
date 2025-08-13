#!/usr/bin/env python3
"""Debug the failing write operations to see exact errors"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
USER_ID = 2  # Your admin user

print("Debugging Write Operation Errors")
print("=" * 60)

# 1. Debug Purchase Create - 500 error
print("\n1. PURCHASE CREATE - Testing with detailed data...")
purchase_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "branch_id": 1,
    "po_number": f"PO-TEST-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "po_type": "regular",
    "supplier_id": 1,
    "supplier_name": "Test Supplier",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "po_status": "draft",
    "created_by": USER_ID
}
r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
print(f"Status: {r.status_code}")
if r.status_code != 200:
    print("Error Details:")
    try:
        error = r.json()
        print(json.dumps(error, indent=2))
    except:
        print(r.text[:500])
else:
    print("✅ Success!")

# 2. Debug Order Create - 422 error  
print("\n2. ORDER CREATE - Testing with all fields...")
order_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "branch_id": 1,
    "customer_id": 32,
    "order_number": f"ORD-TEST-{datetime.now().strftime('%H%M%S')}",
    "order_date": "2024-01-15",
    "delivery_date": "2024-01-16",
    "order_type": "regular",
    "order_status": "pending",
    "delivery_status": "pending",
    "subtotal_amount": 500,
    "discount_amount": 0,
    "tax_amount": 60,
    "other_charges": 0,
    "final_amount": 560,
    "payment_status": "unpaid",
    "created_by": USER_ID,
    "items": []  # Empty for now
}
r = requests.post(f"{BASE_URL}/orders/", json=order_data)
print(f"Status: {r.status_code}")
if r.status_code not in [200, 201]:
    print("Error Details:")
    try:
        error = r.json()
        print(json.dumps(error, indent=2))
    except:
        print(r.text[:500])
else:
    print("✅ Success!")

# 3. Debug Customer Create - 422 error
print("\n3. CUSTOMER CREATE - Testing with all required fields...")
customer_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_code": f"CUST-{datetime.now().strftime('%H%M%S')}",
    "customer_name": f"Test Customer {datetime.now().strftime('%H%M')}",
    "customer_type": "retail",
    "primary_phone": "9999999999",
    "business_type": "retail_pharmacy",
    "credit_limit": 10000,
    "credit_days": 30,
    "is_active": True,
    "created_by": USER_ID
}
r = requests.post(f"{BASE_URL}/customers/", json=customer_data)
print(f"Status: {r.status_code}")
if r.status_code not in [200, 201]:
    print("Error Details:")
    try:
        error = r.json()
        print(json.dumps(error, indent=2))
    except:
        print(r.text[:500])
else:
    print("✅ Success!")

print("\n" + "=" * 60)