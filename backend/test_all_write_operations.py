#!/usr/bin/env python3
"""Test ALL write operations (POST, PUT, DELETE)"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
USER_ID = 2  # Your actual admin user

print("Testing ALL Write Operations")
print("=" * 60)

results = []

# 1. Test Create Payment (POST)
print("\n1. Testing Payment Create (POST)...")
payment_data = {
    "customer_id": 32,
    "payment_type": "advance_payment",
    "amount": 100,
    "payment_mode": "cash",
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/payments/", json=payment_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Payment Create", status))
    print(f"   {status}")
except Exception as e:
    results.append(("Payment Create", f"❌ Error"))

# 2. Test Create Purchase (POST)
print("\n2. Testing Purchase Create (POST)...")
purchase_data = {
    "supplier_id": 1,
    "po_number": f"PO-TEST-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Purchase Create", status))
    print(f"   {status}")
    if r.status_code == 200:
        purchase_id = r.json().get('po_id')
except Exception as e:
    results.append(("Purchase Create", f"❌ Error"))

# 3. Test Create Order (POST)
print("\n3. Testing Order Create (POST)...")
order_data = {
    "customer_id": 32,
    "order_date": "2024-01-15",
    "delivery_date": "2024-01-16",
    "items": [],
    "subtotal_amount": 500,
    "tax_amount": 60,
    "final_amount": 560,
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/orders/", json=order_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Order Create", status))
    print(f"   {status}")
    if r.status_code == 200:
        order_id = r.json().get('order_id')
except Exception as e:
    results.append(("Order Create", f"❌ Error"))

# 4. Test Create Customer (POST)
print("\n4. Testing Customer Create (POST)...")
customer_data = {
    "customer_code": f"TEST{datetime.now().strftime('%H%M%S')}",
    "customer_name": f"Test Customer {datetime.now().strftime('%H%M%S')}",
    "customer_type": "retail",
    "primary_phone": "9999999999",
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/customers/", json=customer_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Customer Create", status))
    print(f"   {status}")
    if r.status_code == 200:
        new_customer_id = r.json().get('customer_id')
except Exception as e:
    results.append(("Customer Create", f"❌ Error"))

# 5. Test Update Customer (PUT)
print("\n5. Testing Customer Update (PUT)...")
if 'new_customer_id' in locals():
    update_data = {"customer_name": "Updated Test Customer"}
    try:
        r = requests.put(f"{BASE_URL}/customers/{new_customer_id}", json=update_data)
        status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
        results.append(("Customer Update", status))
        print(f"   {status}")
    except:
        results.append(("Customer Update", f"❌ Error"))
else:
    results.append(("Customer Update", "⏭️ Skipped"))

# 6. Test Create Product (POST)
print("\n6. Testing Product Create (POST)...")
product_data = {
    "product_code": f"PROD{datetime.now().strftime('%H%M%S')}",
    "product_name": f"Test Product {datetime.now().strftime('%H%M%S')}",
    "product_type": "medicine",
    "base_unit": "tablet",
    "gst_percentage": 12,
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/products/", json=product_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Product Create", status))
    print(f"   {status}")
except Exception as e:
    results.append(("Product Create", f"❌ Error"))

# 7. Test Create Invoice (POST)
print("\n7. Testing Invoice Create (POST)...")
invoice_data = {
    "customer_id": 32,
    "invoice_date": "2024-01-15",
    "items": [],
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "final_amount": 1120,
    "created_by": USER_ID
}
try:
    r = requests.post(f"{BASE_URL}/invoices/", json=invoice_data)
    status = "✅" if r.status_code == 200 else f"❌ {r.status_code}"
    results.append(("Invoice Create", status))
    print(f"   {status}")
except Exception as e:
    results.append(("Invoice Create", f"❌ Error"))

# 8. Test Delete (if we created a test customer)
print("\n8. Testing Delete...")
if 'new_customer_id' in locals():
    try:
        r = requests.delete(f"{BASE_URL}/customers/{new_customer_id}")
        status = "✅" if r.status_code in [200, 204] else f"❌ {r.status_code}"
        results.append(("Customer Delete", status))
        print(f"   {status}")
    except:
        results.append(("Customer Delete", f"❌ Error"))
else:
    results.append(("Customer Delete", "⏭️ Skipped"))

print("\n" + "=" * 60)
print("SUMMARY:")
for operation, status in results:
    print(f"  {operation:<20} {status}")

working = sum(1 for _, s in results if "✅" in s)
failed = sum(1 for _, s in results if "❌" in s)
print(f"\nTotal: {working} working, {failed} failed")