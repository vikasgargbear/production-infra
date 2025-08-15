#\!/usr/bin/env python3
"""Find out which columns actually exist by testing minimal inserts"""
import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

# Test with absolute minimum fields only
test_fields = [
    ["org_id", "po_number", "po_date", "supplier_id", "total_amount", "po_status"],
    ["org_id", "branch_id", "po_number", "po_date", "po_type", "supplier_id", "supplier_name", "total_amount", "po_status", "created_by"],
    ["org_id", "branch_id", "po_number", "po_date", "po_type", "supplier_id", "supplier_name", "subtotal_amount", "tax_amount", "total_amount", "po_status", "created_by"],
]

print("Testing which column sets work...")
print("=" * 60)

for i, field_set in enumerate(test_fields, 1):
    print(f"\nTest {i}: Fields = {field_set}")
    
    purchase_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "branch_id": 1,
        "po_number": f"PO-TEST-{i}-{datetime.now().strftime('%H%M%S')}",
        "po_date": "2024-01-15",
        "po_type": "regular",
        "supplier_id": 1,
        "supplier_name": "Test Supplier",
        "subtotal_amount": 1000,
        "tax_amount": 120,
        "total_amount": 1120,
        "po_status": "draft",
        "created_by": 2
    }
    
    # Only keep fields in this test set
    test_data = {k: v for k, v in purchase_data.items() if k in field_set}
    
    print(f"Sending: {json.dumps(test_data, indent=2)[:200]}...")
    
    # We'll need to bypass our API and test directly what columns exist
    # For now, let's see what error we get
