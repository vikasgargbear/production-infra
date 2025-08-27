#!/usr/bin/env python3
"""Test complete challan creation flow"""

import requests
import json
import time
from datetime import date

# Configuration
API_BASE = "https://pharma-backend-production-0c09.up.railway.app"
ORG_ID = "e78d6777-35f6-4b19-994f-caaede2f021a"

# You need to get a valid token from browser
print("1. Open browser DevTools Network tab")
print("2. Create a challan in the UI")
print("3. Find the POST request to /api/enterprise-delivery-challan/")
print("4. Copy the Authorization header value")
print()
TOKEN = input("Paste the Bearer token here: ").strip()

if not TOKEN.startswith("Bearer "):
    TOKEN = f"Bearer {TOKEN}"

headers = {
    "Content-Type": "application/json",
    "Authorization": TOKEN,
    "org-id": ORG_ID
}

# Test data
test_data = {
    "customer_id": 108,
    "dispatch_date": str(date.today()),
    "delivery_address": "Test Address 123",
    "delivery_city": "Mumbai",
    "delivery_state": "Maharashtra",
    "delivery_pincode": "400001",
    "transport_company": "Test Transport",
    "vehicle_number": "MH01AB1234",
    "lr_number": "LR123",
    "freight_amount": 20.0,
    "freight_charges": 20.0,
    "notes": "Test challan with all values",
    "items": [
        {
            "product_id": 123,
            "product_name": "Test Product 1",
            "dispatched_quantity": 10,
            "unit_price": 25.0,
            "gst_percent": 12.0,
            "cgst_percent": 6.0,
            "sgst_percent": 6.0,
            "igst_percent": 0,
            "uom": "NOS",
            "package_type": "UNIT"
        },
        {
            "product_id": 124,
            "product_name": "Test Product 2",
            "dispatched_quantity": 2,
            "unit_price": 25.0,
            "gst_percent": 12.0,
            "cgst_percent": 6.0,
            "sgst_percent": 6.0,
            "igst_percent": 0,
            "uom": "NOS",
            "package_type": "UNIT"
        }
    ]
}

# Expected calculations
print("\n=== EXPECTED VALUES ===")
print("Item 1: 10 × 25 = 250")
print("Item 2: 2 × 25 = 50")
print("Taxable Amount: 250 + 50 = 300")
print("GST on Item 1: 250 × 12% = 30")
print("GST on Item 2: 50 × 12% = 6")
print("Total GST: 30 + 6 = 36")
print("Freight: 20")
print("Total: 300 + 36 + 20 = 356")
print("=" * 30)

# Create challan
print("\nCreating challan...")
response = requests.post(
    f"{API_BASE}/api/enterprise-delivery-challan/",
    json=test_data,
    headers=headers
)

if response.status_code == 200:
    result = response.json()
    challan_id = result.get('challan_id')
    print(f"✓ Challan created successfully! ID: {challan_id}")
    print(f"  Challan Number: {result.get('challan_number')}")
    
    # Wait for DB to settle
    time.sleep(2)
    
    # Get the challan to verify stored values
    print("\nFetching challan from database...")
    get_response = requests.get(
        f"{API_BASE}/api/enterprise-delivery-challan/",
        headers=headers
    )
    
    if get_response.status_code == 200:
        challans = get_response.json()
        # Find our challan
        our_challan = None
        for c in challans:
            if c.get('challan_id') == challan_id:
                our_challan = c
                break
        
        if our_challan:
            print("\n=== ACTUAL VALUES IN DATABASE ===")
            print(f"taxable_amount: {our_challan.get('taxable_amount')}")
            print(f"gst_amount: {our_challan.get('gst_amount')}")
            print(f"freight_charges: {our_challan.get('freight_charges')}")
            print(f"total_amount: {our_challan.get('total_amount')}")
            print("=" * 30)
            
            # Verify
            expected = {
                'taxable_amount': '300.00',
                'gst_amount': '36.00',
                'freight_charges': '20.00',
                'total_amount': '356.00'
            }
            
            actual = {
                'taxable_amount': str(our_challan.get('taxable_amount')),
                'gst_amount': str(our_challan.get('gst_amount')),
                'freight_charges': str(our_challan.get('freight_charges')),
                'total_amount': str(our_challan.get('total_amount'))
            }
            
            print("\n=== VERIFICATION ===")
            all_correct = True
            for field, exp_value in expected.items():
                act_value = actual[field]
                if float(exp_value) == float(act_value):
                    print(f"✓ {field}: {act_value} (correct)")
                else:
                    print(f"✗ {field}: Expected {exp_value}, Got {act_value}")
                    all_correct = False
            
            if all_correct:
                print("\n🎉 SUCCESS! All values are correct!")
            else:
                print("\n❌ FAILURE! Some values are incorrect.")
        else:
            print(f"Could not find challan {challan_id} in list")
    else:
        print(f"Failed to fetch challans: {get_response.status_code}")
        print(get_response.text)
else:
    print(f"Failed to create challan: {response.status_code}")
    print(response.text)