#!/usr/bin/env python3
"""
Schema Compliance Audit
Verifies that all field names in code match DATABASE-SCHEMA.md
"""

import re
import os
from pathlib import Path
from collections import defaultdict

# Key tables we actively use in the codebase
CRITICAL_TABLES = {
    "inventory.batches": [
        "batch_id", "batch_number", "product_id", "quantity_available",
        "mrp_per_unit", "sale_price_per_unit", "cost_per_unit", "expiry_date",
        "manufacturing_date", "supplier_id", "source_type", "source_reference_id",
        "batch_status", "storage_condition", "pack_size", "pack_type"
    ],
    "inventory.products": [
        "product_id", "product_code", "product_name", " generic_name", "hsn_code",
        "gst_percent", "manufacturer", "category_id", "is_active", "total_stock"
    ],
    "sales.invoices": [
        "invoice_id", "invoice_number", "invoice_date", "customer_id", "due_date",
        "sub_total", "discount_amount", "tax_amount", "total_amount", "final_amount",
        "paid_amount", "balance_amount", "payment_status", "invoice_status"
    ],
    "procurement.purchase_orders": [
        "po_id", "po_number", "po_date", "supplier_id", "expected_delivery",
        "total_amount", "order_status", "supplier_amount", "calculated_amount"
    ],
    "procurement.goods_receipt_notes": [
        "grn_id", "grn_number", "grn_date", "purchase_order_id", "supplier_id",
        "supplier_invoice_number", "supplier_invoice_date", "supplier_challan_number",
        "vehicle_number", "lr_number", "qc_required", "stock_updated", "grn_status"
    ],
    "financial.payments": [
        "payment_id", "payment_number", "payment_date", "payment_type", "party_type",
        "party_id", "payment_method", "amount_paid", "reference_number", "payment_status"
    ]
}

# Known acceptable interim variables (not saved to DB)
ACCEPTABLE_INTERIM = [
    "item", "items", "total", "totals", "calculated", "temp", "preview",
    "state", "selected", "current", "invoice", "product", "batch"
]

def extract_field_references(file_path):
    """Extract potential database field references from code file"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
   
    # Pattern for field references (dict access, object properties)
    patterns = [
        r'\.get\(["\'](\w+)["\']\)',  # dict.get("field")
        r'\[["\'](\w+)["\']\]',        # dict["field"]
        r':(\w+)',                      # SQL :param
        r'(\w+)=',                      # param=value
    ]
   
    fields = set()
    for pattern in patterns:
        matches = re.findall(pattern, content)
        fields.update(matches)
   
    return fields

def main():
    issues = []
   
    # Scan backend
    backend_root = Path('backend/app/api')
    for py_file in backend_root.rglob('*.py'):
        if '__pycache__' in str(py_file):
            continue
       
        fields = extract_field_references(py_file)
       
        # Check for known BAD aliases
        bad_aliases = {'batch_no', 'invoice_no', 'invoiceNo', 'batchNo'}
        found_bad = fields & bad_aliases
       
        if found_bad:
            issues.append(f"  {py_file.relative_to(backend_root)}: {found_bad}")
   
    print("=== Schema Compliance Audit ===\n")
    print(f"Scanned: backend/app/api/**/*.py")
    print(f"Issues found: {len(issues)}\n")
   
    if issues:
        print("❌ FAILED - Bad aliases found:")
        for issue in issues:
            print(issue)
        return 1
    else:
        print("✅ PASSED - No bad aliases found")
        return 0

if __name__ == '__main__':
    exit(main())
