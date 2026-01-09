#!/usr/bin/env python3
"""
Sales Module Schema Compliance Audit
Comprehensive check of all sales-related field names against DATABASE-SCHEMA.md
"""

import re
import os
from pathlib import Path
from collections import defaultdict
import json

# Canonical Sales Table Field Names from DATABASE-SCHEMA.md
SALES_SCHEMA = {
    "invoices": [
        "invoice_id", "org_id", "branch_id", "invoice_number", "invoice_date",
        "invoice_type", "order_id", "challan_ids", "customer_id", "customer_name",
        "billing_address_id", "shipping_address_id", "place_of_supply", "reverse_charge",
        "subtotal_amount", "discount_amount", "scheme_discount", "taxable_amount",
        "igst_amount", "cgst_amount", "sgst_amount", "cess_amount", "total_tax_amount",
        "freight_charges", "insurance_charges", "other_charges", "round_off_amount",
        "final_amount", "amount_in_words", "payment_terms", "due_date",
        "payment_status", "paid_amount", "einvoice_required", "irn", "irn_generated_date",
        "qr_code", "ack_number", "ack_date", "invoice_status", "cancellation_reason",
        "cancelled_date", "notes", "internal_notes", "terms_and_conditions",
        "bank_account_id", "created_at", "updated_at", "created_by", "posted_by",
        "posted_at", "items_count", "total_quantity", "loyalty_points_used",
        "loyalty_discount", "credit_amount", "allocated_amount", "unallocated_amount"
    ],
    "invoice_items": [
        "invoice_item_id", "invoice_id", "order_item_id", "product_id", "product_name",
        "product_description", "hsn_code", "batch_id", "batch_number",
        "manufacturing_date", "expiry_date", "quantity", "uom", "pack_type",
        "pack_size", "base_quantity", "mrp", "unit_price", "discount_percent",
        "discount_amount", "taxable_amount", "igst_rate", "igst_amount",
        "cgst_rate", "cgst_amount", "sgst_rate", "sgst_amount", "cess_rate",
        "cess_amount", "total_tax_amount", "line_total", "is_free_item",
        "display_order", "created_at", "free_quantity", "item_id", "quantity_returned"
    ],
    "orders": [
        "order_id", "org_id", "branch_id", "order_number", "order_date",
        "order_type", "customer_id", "customer_po_number", "customer_po_date",
        "delivery_date", "delivery_priority", "delivery_address_id",
        "delivery_instructions", "salesperson_id", "territory_id", "route_id",
        "price_list_id", "currency_code", "subtotal_amount", "discount_amount",
        "scheme_discount", "taxable_amount", "tax_amount", "round_off_amount",
        "final_amount", "igst_amount", "cgst_amount", "sgst_amount", "cess_amount",
        "order_status", "approval_status", "approved_by", "approved_at",
        "payment_terms", "payment_status", "fulfillment_status", "items_count",
        "items_delivered", "notes", "internal_notes", "tags", "created_at",
        "updated_at", "created_by", "updated_by", "paid_amount", "confirmed_at",
        "delivered_at", "customer_name", "customer_phone", "balance_amount",
        "payment_mode", "eway_bill_number", "pod_recorded", "last_tracking_update",
        "expected_delivery_date", "delivery_area"
    ],
    "order_items": [
        "order_item_id", "order_id", "product_id", "product_name", "hsn_code",
        "quantity", "uom", "pack_type", "pack_size", "base_quantity", "unit_price",
        "mrp", "discount_percent", "discount_amount", "scheme_discount_percent",
        "scheme_discount_amount", "free_quantity", "scheme_code", "taxable_amount",
        "tax_percent", "tax_amount", "igst_percent", "cgst_percent", "sgst_percent",
        "cess_percent", "line_total", "batch_id", "batch_number", "batch_expiry",
        "ordered_quantity", "delivered_quantity", "pending_quantity",
        "cancelled_quantity", "item_status", "item_notes", "display_order",
        "created_at", "updated_at", "cgst_rate", "sgst_rate", "igst_rate",
        "cgst_amount", "sgst_amount", "igst_amount", "cess_rate", "cess_amount",
        "delivery_status", "notes", "product_code"
    ],
    "delivery_challans": [
        "challan_id", "org_id", "branch_id", "challan_number", "challan_date",
        "challan_type", "order_id", "invoice_id", "customer_id", "delivery_address_id",
        "dispatch_date", "dispatch_time", "dispatch_address_id", "transport_mode",
        "transporter_name", "vehicle_number", "lr_number", "lr_date",
        "freight_charges", "eway_bill_required", "eway_bill_number", "eway_bill_date",
        "eway_bill_validity_days", "eway_bill_data", "total_quantity", "total_amount",
        "challan_status", "delivery_status", "delivered_date", "delivered_time",
        "received_by", "delivery_notes", "pod_document", "is_returnable",
        "return_by_date", "return_status", "notes", "internal_notes", "created_at",
        "updated_at", "created_by", "taxable_amount", "gst_amount"
    ],
    "sales_returns": [
        "return_id", "org_id", "branch_id", "return_number", "return_date",
        "return_type", "invoice_id", "customer_id", "return_reason",
        "detailed_reason", "approval_required", "approval_status", "approved_by",
        "approved_at", "return_amount", "tax_amount", "total_amount",
        "credit_note_number", "credit_note_date", "credit_note_status",
        "refund_amount", "refund_method", "refund_status", "igst_amount",
        "cgst_amount", "sgst_amount", "adjustment_type", "adjusted_amount",
        "restocking_fee", "notes", "created_at", "updated_at", "created_by"
    ],
    "sales_return_items": [
        "return_item_id", "return_id", "invoice_item_id", "product_id",
        "batch_id", "batch_number", "quantity_returned", "unit_price",
        "discount_percent", "taxable_amount", "tax_amount", "total_amount",
        "return_reason", "item_condition", "restock_status", "restocked_quantity",
        "wastage_quantity", "notes", "created_at"
    ]
}

# Known bad aliases to check for
BAD_ALIASES = {
    "invoice_no",  # should be invoice_number
    "order_no",    # should be order_number
    "challan_no",  # should be challan_number
    "batch_no",    # should be batch_number
    "invoiceNo",   # camelCase variant
    "orderNo",     # camelCase variant
    "challanNo",   # camelCase variant
    "batchNo",     # camelCase variant
}

def scan_file_for_fields(file_path):
    """Extract potential database field references"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        return set(), set()
   
    # Pattern for field references
    patterns = [
        r'\.get\(["\'](\w+)["\']\)',  # dict.get("field")
        r'\[["\'](\w+)["\']\]',        # dict["field"]
        r':(\w+)',                      # SQL :param or TS types
        r'(\w+)[:=]',                   # param=value or field: type
    ]
   
    all_fields = set()
    for pattern in patterns:
        matches = re.findall(pattern, content)
        all_fields.update(matches)
   
    # Find bad aliases
    bad_found = all_fields & BAD_ALIASES
   
    return all_fields, bad_found

def audit_backend():
    """Audit backend sales code"""
    print("\n=== BACKEND SALES AUDIT ===\n")
   
    backend_paths = [
        "backend/app/api/services/sales",
        "backend/app/api/routes/sales",
        "backend/app/api/schemas/sales"
    ]
   
    issues = []
    files_scanned = 0
   
    for base_path in backend_paths:
        path = Path(base_path)
        if not path.exists():
            continue
           
        for py_file in path.rglob('*.py'):
            if '__pycache__' in str(py_file):
                continue
               
            files_scanned += 1
            fields, bad = scan_file_for_fields(py_file)
           
            if bad:
                issues.append({
                    "file": str(py_file),
                    "bad_aliases": list(bad)
                })
   
    print(f"Files scanned: {files_scanned}")
    print(f"Issues found: {len(issues)}\n")
   
    if issues:
        print("❌ BAD ALIASES FOUND:\n")
        for issue in issues:
            print(f"  {issue['file']}")
            for alias in issue['bad_aliases']:
                print(f"    - {alias}")
        return False
    else:
        print("✅ No bad aliases found in backend")
        return True

def audit_frontend():
    """Audit frontend sales code"""
    print("\n=== FRONTEND SALES AUDIT ===\n")
   
    frontend_paths = [
        "frontend/src/components/sales",
        "frontend/src/services/api/modules/sales"
    ]
   
    issues = []
    files_scanned = 0
   
    for base_path in frontend_paths:
        path = Path(base_path)
        if not path.exists():
            continue
           
        for ts_file in path.rglob('*.ts*'):
            files_scanned += 1
            fields, bad = scan_file_for_fields(ts_file)
           
            if bad:
                issues.append({
                    "file": str(ts_file),
                    "bad_aliases": list(bad)
                })
   
    print(f"Files scanned: {files_scanned}")
    print(f"Issues found: {len(issues)}\n")
   
    if issues:
        print("❌ BAD ALIASES FOUND:\n")
        for issue in issues:
            print(f"  {issue['file']}")
            for alias in issue['bad_aliases']:
                print(f"    - {alias}")
        return False
    else:
        print("✅ No bad aliases found in frontend")
        return True

def main():
    print("=" * 60)
    print("SALES MODULE SCHEMA COMPLIANCE AUDIT")
    print("=" * 60)
   
    backend_ok = audit_backend()
    frontend_ok = audit_frontend()
   
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Backend: {'✅ PASS' if backend_ok else '❌ FAIL'}")
    print(f"Frontend: {'✅ PASS' if frontend_ok else '❌ FAIL'}")
    print()
   
    return 0 if (backend_ok and frontend_ok) else 1

if __name__ == '__main__':
    exit(main())
