#\!/usr/bin/env python3
"""Comprehensive test of all fixed write operations"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("🧪 COMPREHENSIVE WRITE OPERATIONS TEST")
print("=" * 80)

# Test 1: Customer Operations
print("\n📋 1. CUSTOMER OPERATIONS")
print("-" * 40)

# Create Customer
customer_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_code": f"TEST{datetime.now().strftime('%H%M%S')}",
    "customer_name": f"Test Customer {datetime.now().strftime('%H%M')}",
    "customer_type": "retail",
    "phone": "9999999999",
    "credit_limit": 10000,
    "credit_days": 30
}

print("1.1 Creating customer...")
r = requests.post(f"{BASE_URL}/customers/", json=customer_data)
customer_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if customer_success else '❌ FAILED'}")
if customer_success:
    customer = r.json()
    customer_id = customer.get('customer_id')
    print(f"Created customer ID: {customer_id}")
else:
    print(f"Error: {r.text[:200]}")
    customer_id = None

# Update Customer
if customer_id:
    print("\n1.2 Updating customer...")
    r = requests.put(f"{BASE_URL}/customers/{customer_id}", json={"customer_name": "Updated Test Customer"})
    customer_update_success = r.status_code in [200, 201]
    print(f"Status: {r.status_code} - {'✅ SUCCESS' if customer_update_success else '❌ FAILED'}")
else:
    customer_update_success = False

# Delete Customer
if customer_id:
    print("\n1.3 Deleting customer...")
    r = requests.delete(f"{BASE_URL}/customers/{customer_id}")
    customer_delete_success = r.status_code in [200, 204]
    print(f"Status: {r.status_code} - {'✅ SUCCESS' if customer_delete_success else '❌ FAILED'}")
    if not customer_delete_success:
        print(f"Error: {r.text[:200]}")
else:
    customer_delete_success = False

# Test 2: Product Operations
print("\n📦 2. PRODUCT OPERATIONS")
print("-" * 40)

product_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "product_code": f"PROD{datetime.now().strftime('%H%M%S')}",
    "product_name": f"Test Product {datetime.now().strftime('%H%M')}",
    "generic_name": "Test Generic",
    "brand": "Test Brand",
    "manufacturer": "Test Manufacturer",
    "product_type": "tablet",
    "hsn_code": "30049099",
    "gst_percentage": 12,
    "is_active": True,
    "is_saleable": True,
    "pack_config": {"base_uom": "tablet"}
}

print("2.1 Creating product...")
r = requests.post(f"{BASE_URL}/products/", json=product_data)
product_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if product_success else '❌ FAILED'}")
if product_success:
    product = r.json()
    product_id = product.get('product_id')
    print(f"Created product ID: {product_id}")
else:
    print(f"Error: {r.text[:200]}")
    product_id = 50  # Use fallback

# Test 3: Purchase Operations
print("\n🛒 3. PURCHASE OPERATIONS")
print("-" * 40)

purchase_data = {
    "po_number": f"PO-TEST-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "supplier_id": 1,
    "supplier_name": "Test Supplier",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "created_by": 2
}

print("3.1 Creating purchase order...")
r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
purchase_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if purchase_success else '❌ FAILED'}")
if purchase_success:
    purchase = r.json()
    print(f"Created PO ID: {purchase.get('po_id')} - {purchase.get('po_number')}")
else:
    print(f"Error: {r.text[:200]}")

# Test 4: Order Operations
print("\n📋 4. ORDER OPERATIONS")
print("-" * 40)

order_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,  # Use existing customer
    "order_date": "2024-01-15",
    "order_type": "sales",
    "items": [
        {
            "product_id": product_id,
            "quantity": 10,
            "unit_price": 50
        }
    ]
}

print("4.1 Creating order...")
r = requests.post(f"{BASE_URL}/orders/", json=order_data)
order_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if order_success else '❌ FAILED'}")
if order_success:
    order = r.json()
    print(f"Created Order ID: {order.get('order_id')} - {order.get('order_number')}")
else:
    print(f"Error: {r.text[:300]}")

# Summary
print("\n" + "=" * 80)
print("📊 FINAL SUMMARY")
print("=" * 80)
print(f"Customer Create: {'✅' if customer_success else '❌'}")
print(f"Customer Update: {'✅' if customer_update_success else '❌'}")
print(f"Customer Delete: {'✅' if customer_delete_success else '❌'}")
print(f"Product Create:  {'✅' if product_success else '❌'}")
print(f"Purchase Create: {'✅' if purchase_success else '❌'}")
print(f"Order Create:    {'✅' if order_success else '❌'}")

total_tests = 6
passed_tests = sum([customer_success, customer_update_success, customer_delete_success, 
                   product_success, purchase_success, order_success])

print(f"\nPASSED: {passed_tests}/{total_tests} ({passed_tests/total_tests*100:.1f}%)")

if passed_tests == total_tests:
    print("\n🎉 ALL WRITE OPERATIONS ARE WORKING\! 🎉")
else:
    print(f"\n⚠️  {total_tests - passed_tests} operations still need fixing")

print("=" * 80)
