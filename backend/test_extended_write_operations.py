#!/usr/bin/env python3
"""Extended test of additional write operations"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("🧪 EXTENDED WRITE OPERATIONS TEST")
print("=" * 80)

# Test 1: Supplier Operations
print("\n🏭 1. SUPPLIER OPERATIONS")
print("-" * 40)

supplier_data = {
    "name": f"Test Supplier {datetime.now().strftime('%H%M')}",
    "code": f"SUP{datetime.now().strftime('%H%M%S')}",
    "contact_person": "Test Contact",
    "phone": "9999999999",
    "email": "test@supplier.com",
    "address": "Test Address",
    "gst_number": "22AAAAA0000A1Z5"
}

print("1.1 Creating supplier...")
r = requests.post(f"{BASE_URL}/suppliers/", json=supplier_data)
supplier_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if supplier_success else '❌ FAILED'}")
if supplier_success:
    supplier = r.json()
    supplier_id = supplier.get('supplier_id')
    print(f"Created supplier ID: {supplier_id}")
else:
    print(f"Error: {r.text[:200]}")
    supplier_id = 1  # Use fallback

# Test 2: Invoice Operations
print("\n📄 2. INVOICE OPERATIONS")
print("-" * 40)

invoice_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,  # Use existing customer
    "invoice_date": "2024-01-15",
    "invoice_type": "sales",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120,
    "items": [
        {
            "product_id": 50,  # Use existing product
            "quantity": 10,
            "unit_price": 50,
            "tax_percentage": 12
        }
    ]
}

print("2.1 Creating invoice...")
r = requests.post(f"{BASE_URL}/invoices/", json=invoice_data)
invoice_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if invoice_success else '❌ FAILED'}")
if invoice_success:
    invoice = r.json()
    invoice_id = invoice.get('invoice_id')
    print(f"Created invoice ID: {invoice_id}")
else:
    print(f"Error: {r.text[:300]}")
    invoice_id = None

# Test 3: Delivery Challan Operations
print("\n🚚 3. DELIVERY CHALLAN OPERATIONS")
print("-" * 40)

challan_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "delivery",
    "delivery_address": "Test Delivery Address",
    "items": [
        {
            "product_id": 50,
            "quantity": 5,
            "unit_price": 10
        }
    ]
}

print("3.1 Creating delivery challan...")
r = requests.post(f"{BASE_URL}/delivery-challan/", json=challan_data)
challan_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if challan_success else '❌ FAILED'}")
if challan_success:
    challan = r.json()
    print(f"Created challan ID: {challan.get('challan_id')}")
else:
    print(f"Error: {r.text[:300]}")

# Test 4: Stock Operations
print("\n📦 4. STOCK OPERATIONS")
print("-" * 40)

# Stock Adjustment
stock_adjustment_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "product_id": 50,
    "adjustment_type": "damage",
    "quantity": 10,
    "reason": "Test stock adjustment",
    "movement_date": "2024-01-15"
}

print("4.1 Creating stock adjustment...")
r = requests.post(f"{BASE_URL}/stock-adjustments/", json=stock_adjustment_data)
stock_adjustment_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if stock_adjustment_success else '❌ FAILED'}")
if not stock_adjustment_success:
    print(f"Error: {r.text[:300]}")

# Stock Movement
stock_movement_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "product_id": 50,
    "quantity": 50,
    "movement_date": "2024-01-15",
    "batch_number": f"BATCH{datetime.now().strftime('%H%M%S')}",
    "expiry_date": "2025-12-31",
    "supplier_id": 1,
    "reason": "Test stock receipt"
}

print("4.2 Creating stock movement...")
r = requests.post(f"{BASE_URL}/stock-movements/receive", json=stock_movement_data)
stock_movement_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if stock_movement_success else '❌ FAILED'}")
if not stock_movement_success:
    print(f"Error: {r.text[:300]}")

# Test 5: Payment Operations
print("\n💰 5. PAYMENT OPERATIONS")
print("-" * 40)

payment_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "payment_date": "2024-01-15",
    "payment_type": "regular_payment",
    "payment_mode": "cash",
    "amount": 500,
    "reference_number": f"PAY{datetime.now().strftime('%H%M%S')}",
    "notes": "Test payment"
}

print("5.1 Creating payment...")
r = requests.post(f"{BASE_URL}/payments/", json=payment_data)
payment_success = r.status_code in [200, 201]
print(f"Status: {r.status_code} - {'✅ SUCCESS' if payment_success else '❌ FAILED'}")
if payment_success:
    payment = r.json()
    print(f"Created payment ID: {payment.get('payment_id')}")
else:
    print(f"Error: {r.text[:300]}")

# Summary
print("\n" + "=" * 80)
print("📊 EXTENDED OPERATIONS SUMMARY")
print("=" * 80)
print(f"Supplier Create:     {'✅' if supplier_success else '❌'}")
print(f"Invoice Create:      {'✅' if invoice_success else '❌'}")
print(f"Delivery Ch. Create: {'✅' if challan_success else '❌'}")
print(f"Stock Adjustment:    {'✅' if stock_adjustment_success else '❌'}")
print(f"Stock Movement:      {'✅' if stock_movement_success else '❌'}")
print(f"Payment Create:      {'✅' if payment_success else '❌'}")

total_tests = 6
passed_tests = sum([supplier_success, invoice_success, challan_success, 
                   stock_adjustment_success, stock_movement_success, payment_success])

print(f"\nPASSED: {passed_tests}/{total_tests} ({passed_tests/total_tests*100:.1f}%)")

if passed_tests == total_tests:
    print("\n🎉 ALL EXTENDED OPERATIONS ARE WORKING! 🎉")
else:
    print(f"\n⚠️  {total_tests - passed_tests} operations still need fixing")

print("=" * 80)