#!/usr/bin/env python3
"""Simple test of extended operations without complex triggers"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("🧪 SIMPLIFIED EXTENDED OPERATIONS TEST")
print("=" * 60)

# Test working operations first
print("\n✅ WORKING OPERATIONS (3/6)")
print("-" * 30)

# 1. Supplier
supplier_data = {"name": f"Test Supplier {datetime.now().strftime('%H%M')}"}
r = requests.post(f"{BASE_URL}/suppliers/", json=supplier_data)
supplier_success = r.status_code in [200, 201]
print(f"Supplier: {'✅' if supplier_success else '❌'} ({r.status_code})")

# 2. Invoice  
invoice_data = {
    "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
    "customer_id": 32,
    "invoice_date": "2024-01-15",
    "invoice_type": "sales",
    "subtotal_amount": 100,
    "tax_amount": 12,
    "total_amount": 112,
    "items": [{"product_id": 50, "quantity": 1, "unit_price": 100, "tax_percentage": 12}]
}
r = requests.post(f"{BASE_URL}/invoices/", json=invoice_data)
invoice_success = r.status_code in [200, 201]
print(f"Invoice: {'✅' if invoice_success else '❌'} ({r.status_code})")

# 3. Payment
payment_data = {
    "customer_id": 32,
    "payment_date": "2024-01-15",
    "payment_type": "regular_payment",
    "payment_mode": "cash",
    "amount": 100
}
r = requests.post(f"{BASE_URL}/payments/", json=payment_data)
payment_success = r.status_code in [200, 201]
print(f"Payment: {'✅' if payment_success else '❌'} ({r.status_code})")

print("\n❌ PROBLEMATIC OPERATIONS (3/6)")
print("-" * 30)

# 4. Delivery Challan - Try with exact same structure as working orders
print("4. Testing delivery challan with working order structure...")
challan_data = {
    "customer_id": 32,
    "order_date": "2024-01-15",
    "order_type": "delivery",  # Different type
    "items": [{"product_id": 50, "quantity": 5, "unit_price": 10}]
}
r = requests.post(f"{BASE_URL}/delivery-challan/", json=challan_data)
challan_success = r.status_code in [200, 201]
print(f"Delivery Challan: {'✅' if challan_success else '❌'} ({r.status_code})")
if not challan_success:
    print(f"  Error: {r.text[:200]}")

# 5. Stock Adjustment - Try simplified version
print("\n5. Testing stock adjustment without batch...")
adjustment_data = {
    "product_id": 50,
    "adjustment_type": "damage",
    "quantity": 1,
    "movement_date": "2024-01-15",
    "reason": "Test damage"
}
r = requests.post(f"{BASE_URL}/stock-adjustments/", json=adjustment_data)
adjustment_success = r.status_code in [200, 201]
print(f"Stock Adjustment: {'✅' if adjustment_success else '❌'} ({r.status_code})")
if not adjustment_success:
    print(f"  Error: {r.text[:200]}")

# 6. Stock Movement - Try minimal version
print("\n6. Testing minimal stock movement...")
movement_data = {
    "product_id": 50,
    "quantity": 5,
    "movement_date": "2024-01-15",
    "reason": "Test receive"
}
r = requests.post(f"{BASE_URL}/stock-movements/receive", json=movement_data)
movement_success = r.status_code in [200, 201]
print(f"Stock Movement: {'✅' if movement_success else '❌'} ({r.status_code})")
if not movement_success:
    print(f"  Error: {r.text[:200]}")

# Summary
total_success = sum([supplier_success, invoice_success, payment_success, 
                    challan_success, adjustment_success, movement_success])
print(f"\n📊 FINAL STATUS: {total_success}/6 ({total_success/6*100:.1f}%)")
print("=" * 60)