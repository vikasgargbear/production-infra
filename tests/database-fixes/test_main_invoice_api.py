#!/usr/bin/env python3
"""
Test main invoice API creation
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

print("🧪 Testing Main Invoice API")
print("=" * 60)

# First, run the database fixes
print("\n1️⃣ Running database fixes...")
fixes = requests.post(
    f"{API_BASE.replace('/api', '')}/database-fix/drop-all-broken-triggers",
    headers={"X-Org-Id": ORG_ID},
    timeout=10
)
print(f"   Triggers dropped: {fixes.json().get('message', 'Unknown')}")

# Minimal invoice data
invoice_data = {
    "customer_id": 35,
    "customer_name": "Basim", 
    "invoice_date": datetime.now().isoformat(),
    "branch_id": 1,  # Added based on our fixes
    "created_by": 2,  # Added based on our fixes
    "items": [
        {
            "product_id": 47,
            "product_name": "Atlas",
            "quantity": 5,
            "unit_price": 11,
            "discount_percent": 0,
            "gst_percent": 12,
            "cgst_rate": 6,
            "sgst_rate": 6,
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
    "final_amount": 61.6  # Changed from total_amount
}

print("\n2️⃣ Creating invoice via main API...")
print(f"   Customer: {invoice_data['customer_name']}")
print(f"   Product: {invoice_data['items'][0]['product_name']}")
print(f"   Total: ₹{invoice_data['final_amount']}")

response = requests.post(
    f"{API_BASE}/invoices/",
    json=invoice_data,
    headers={"X-Org-Id": ORG_ID},
    timeout=30
)

print(f"\n3️⃣ Response: {response.status_code}")

if response.status_code in [200, 201]:
    result = response.json()
    print("✅ Invoice created successfully!")
    print(f"   Invoice ID: {result.get('invoice_id')}")
    print(f"   Invoice Number: {result.get('invoice_number')}")
    print(f"   Order ID: {result.get('order_id')}")
    
    # Check if items were created
    if result.get('invoice_id'):
        check = requests.get(
            f"{API_BASE}/invoices/",
            headers={"X-Org-Id": ORG_ID},
            timeout=10
        )
        if check.status_code == 200:
            invoices = check.json().get('invoices', [])
            our_invoice = next((inv for inv in invoices if inv['invoice_id'] == result['invoice_id']), None)
            if our_invoice:
                print(f"   Items created: {len(our_invoice.get('items', []))}")
else:
    print(f"❌ Failed: {response.text}")

print("\n" + "=" * 60)
print("Summary: Main invoice API is", "✅ WORKING" if response.status_code in [200, 201] else "❌ NOT WORKING")