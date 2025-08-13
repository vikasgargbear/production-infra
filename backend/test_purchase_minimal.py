#\!/usr/bin/env python3
"""Test purchase create with minimal required fields only"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Testing Purchase Create with Minimal Fields")
print("=" * 60)

# Test with only the most essential fields
purchase_data = {
    "po_number": f"PO-MIN-{datetime.now().strftime('%H%M%S')}",
    "po_date": "2024-01-15",
    "supplier_id": 1,
    "supplier_name": "Test Supplier",
    "subtotal_amount": 1000,
    "tax_amount": 120,
    "total_amount": 1120
}

print(f"\nSending minimal purchase data: {json.dumps(purchase_data, indent=2)}")

r = requests.post(f"{BASE_URL}/purchases/", json=purchase_data)
print(f"\nStatus: {r.status_code}")

if r.status_code in [200, 201]:
    print("✅ SUCCESS\!")
    print(f"Response: {json.dumps(r.json(), indent=2)[:500]}")
else:
    print("❌ FAILED")
    error_text = r.text
    # Try to extract the specific error
    if "column" in error_text and "does not exist" in error_text:
        import re
        match = re.search(r'column "([^"]+)" .* does not exist', error_text)
        if match:
            print(f"Missing column: {match.group(1)}")
    print(f"Full error: {error_text[:1000]}")
