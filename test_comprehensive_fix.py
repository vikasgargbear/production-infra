#!/usr/bin/env python3
"""
Comprehensive test of database fix APIs and invoice creation
"""

import requests
import json
from datetime import datetime
import time

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def api_call(method, endpoint, data=None, headers=None):
    """Make API call with proper error handling"""
    url = f"{API_BASE}{endpoint}"
    default_headers = {"X-Org-Id": ORG_ID}
    if headers:
        default_headers.update(headers)
    
    try:
        if method == "GET":
            response = requests.get(url, headers=default_headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, headers=default_headers, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, headers=default_headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except Exception as e:
        print(f"❌ API call failed: {e}")
        return None

print("🚀 Comprehensive Database Fix and Invoice Creation Test")
print("=" * 60)

# Step 1: Check current schema issues
print_section("1. Checking Schema Issues")
response = api_call("GET", "/database-fix/check-schema-issues")
if response and response.status_code == 200:
    issues = response.json()
    print(f"✅ Found {issues['issues_found']} schema issues")
    print(f"   Auto-fixable: {issues['auto_fixable']}")
    for issue in issues['issues']:
        print(f"   - {issue['schema']}.{issue['table']}: {issue['description']}")
else:
    print(f"❌ Failed to check schema issues")

# Step 2: Check triggers
print_section("2. Checking Database Triggers")
response = api_call("GET", "/database-fix/check-triggers?schema=sales&table=invoice_items")
if response and response.status_code == 200:
    triggers = response.json()
    print(f"✅ Found {triggers['total_triggers']} triggers on invoice_items")
    for trigger in triggers['triggers']:
        print(f"   - {trigger['name']} ({trigger['event']})")
else:
    print(f"❌ Failed to check triggers")

# Step 3: Auto-fix issues
print_section("3. Auto-Fixing Database Issues")
response = api_call("POST", "/database-fix/auto-fix-issues")
if response and response.status_code == 200:
    fix_result = response.json()
    if fix_result['success']:
        print(f"✅ Fixed {fix_result['fixed_count']} issues:")
        for fix in fix_result['fixed']:
            print(f"   ✓ {fix}")
    if fix_result['failed_count'] > 0:
        print(f"⚠️  Failed to fix {fix_result['failed_count']} issues:")
        for fail in fix_result['failed']:
            print(f"   ✗ {fail}")
else:
    print(f"❌ Auto-fix failed: {response.text if response else 'No response'}")

# Step 4: Validate invoice creation
print_section("4. Validating Invoice Creation Prerequisites")
response = api_call("POST", "/database-fix/validate-invoice-creation")
if response and response.status_code == 200:
    validation = response.json()
    print(f"✅ Database ready: {validation['database_ready']}")
    print(f"   Triggers OK: {validation['triggers_ok']}")
    print(f"   Columns OK: {validation['columns_ok']}")
    print(f"   Foreign Keys OK: {validation['foreign_keys_ok']}")
    print(f"   Sample Data OK: {validation['sample_data_ok']}")
    if validation['issues']:
        print(f"   Issues: {', '.join(validation['issues'])}")
else:
    print(f"❌ Validation failed")

# Step 5: Test complete invoice flow
print_section("5. Testing Complete Invoice Flow")
response = api_call("POST", "/database-fix/test-invoice-flow")
if response and response.status_code == 200:
    result = response.json()
    if result['success']:
        print(f"✅ Invoice flow test successful!")
        print(f"   Invoice ID: {result['invoice_id']}")
        print(f"   Order ID: {result['order_id']}")
        print(f"   Items created: {result['items_created']}")
        print("\n   Steps completed:")
        for step in result['steps']:
            status_icon = "✓" if step['status'] == 'completed' else "✗"
            print(f"   {status_icon} {step['step']}: {step['status']}")
            if 'error' in step:
                print(f"      Error: {step['error']}")
        
        # Get invoice details
        invoice_id = result['invoice_id']
        print(f"\n   Fetching invoice {invoice_id} details...")
        detail_response = api_call("GET", f"/database-fix/invoice-details/{invoice_id}")
        if detail_response and detail_response.status_code == 200:
            details = detail_response.json()
            print(f"   ✓ Invoice has {details['items_count']} items")
    else:
        print(f"❌ Invoice flow test failed: {result.get('error', 'Unknown error')}")
        if 'steps' in result:
            for step in result['steps']:
                if step.get('status') == 'failed':
                    print(f"   Failed at: {step['step']}")
                    if 'error' in step:
                        print(f"   Error: {step['error']}")
else:
    print(f"❌ Test failed: {response.text if response else 'No response'}")

# Step 6: Create real invoice with fixed database
print_section("6. Creating Real Invoice")
invoice_data = {
    "customer_id": 35,
    "customer_name": "Basim",
    "invoice_date": datetime.now().isoformat(),
    "items": [
        {
            "product_id": 47,
            "product_name": "Atlas",
            "quantity": 10,
            "unit_price": 11,
            "discount_percent": 5,
            "gst_percent": 12,
            "uom": "STRIP",
            "pack_type": "STRIP"
        },
        {
            "product_id": 13,
            "product_name": "Aciloc 150",
            "quantity": 5,
            "unit_price": 10,
            "discount_percent": 0,
            "gst_percent": 12,
            "uom": "STRIP",
            "pack_type": "STRIP"
        }
    ],
    "subtotal_amount": 160,
    "discount_amount": 5.5,
    "taxable_amount": 154.5,
    "cgst_amount": 9.27,
    "sgst_amount": 9.27,
    "total_tax_amount": 18.54,
    "final_amount": 173.04,
    "total_amount": 173.04
}

response = api_call("POST", "/invoices/", invoice_data)
if response and response.status_code in [200, 201]:
    result = response.json()
    print(f"✅ Real invoice created successfully!")
    print(f"   Invoice ID: {result.get('invoice_id')}")
    print(f"   Invoice Number: {result.get('invoice_number')}")
    print(f"   Order ID: {result.get('order_id')}")
    
    # Verify items were created
    if 'invoice_id' in result:
        time.sleep(1)  # Give database time to process
        detail_response = api_call("GET", f"/database-fix/invoice-details/{result['invoice_id']}")
        if detail_response and detail_response.status_code == 200:
            details = detail_response.json()
            print(f"   ✓ Invoice has {details['items_count']} items")
            for item in details['items']:
                print(f"      - {item['product_name']}: {item['quantity']} @ ₹{item['unit_price']}")
else:
    print(f"❌ Failed to create real invoice: {response.text if response else 'No response'}")

# Step 7: Clean up test data
print_section("7. Cleaning Up Test Data")
response = api_call("DELETE", "/database-fix/cleanup-test-data")
if response and response.status_code == 200:
    cleanup = response.json()
    print(f"✅ Cleanup successful:")
    print(f"   Items deleted: {cleanup['items_deleted']}")
    print(f"   Invoices deleted: {cleanup['invoices_deleted']}")
    print(f"   Orders deleted: {cleanup['orders_deleted']}")
else:
    print(f"⚠️  Cleanup failed")

print("\n" + "="*60)
print("✅ Comprehensive test completed!")
print("="*60)