#!/usr/bin/env python3
"""
Debug why invoices aren't being saved to database
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def test_minimal_invoice():
    """Create minimal invoice to test if it saves"""
    
    print("\n" + "=" * 60)
    print("🧪 TESTING MINIMAL INVOICE CREATION")
    print("=" * 60)
    
    # Create minimal invoice data
    invoice_data = {
        "customer_id": 28,  # Known existing customer (Nano)
        "customer_name": "Nano",
        "primary_phone": "9999999999",
        "invoice_date": datetime.now().isoformat(),
        "invoice_type": "tax_invoice",
        "payment_method": "cash",
        "payment_terms": "cash",
        "place_of_supply": "Maharashtra",
        
        # Single item with all possible field names
        "items": [
            {
                "product_id": 1,  # Try with product_id 1
                "product_name": "Test Product",
                "product_code": "TEST001",
                "hsn_code": "3004",
                "quantity": 1,
                "unit_price": 100.00,
                "rate": 100.00,  # Also include 'rate' field
                "mrp": 120.00,
                "discount_percent": 0,
                "discount_percentage": 0,  # Include both field names
                "gst_percent": 12,
                "gst_percentage": 12,  # Include both field names
                "tax_percent": 12,  # Also include tax_percent
                "uom": "PCS",
                "pack_type": "STRIP"
            }
        ],
        
        # Pre-calculated totals
        "subtotal_amount": 100.00,
        "subtotal": 100.00,  # Include both field names
        "discount_amount": 0,
        "taxable_amount": 100.00,
        "cgst_amount": 6.00,
        "sgst_amount": 6.00,
        "igst_amount": 0,
        "total_tax_amount": 12.00,
        "other_charges": 0,
        "final_amount": 112.00,
        "total_amount": 112.00,
        "net_amount": 112.00,
        "paid_amount": 112.00,
        "notes": "Debug test invoice"
    }
    
    print("📤 Sending minimal invoice...")
    print(f"   Customer: Nano (ID: 28)")
    print(f"   Product: Test Product")
    print(f"   Total: ₹112.00")
    
    # Send request
    response = requests.post(
        f"{API_BASE}/invoices/",  # WITH trailing slash
        json=invoice_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        },
        timeout=30
    )
    
    print(f"\n📥 Response Status: {response.status_code}")
    
    if response.status_code in [200, 201]:
        result = response.json()
        print("\n✅ API returned success:")
        print(f"   Response: {json.dumps(result, indent=2)}")
        
        invoice_id = result.get('invoice_id')
        invoice_number = result.get('invoice_number')
        
        if invoice_id:
            print(f"\n🔍 Checking if invoice {invoice_id} exists in database...")
            
            # Try to get the invoice back
            check_response = requests.get(
                f"{API_BASE}/invoices/{invoice_id}",
                headers={"X-Org-Id": ORG_ID}
            )
            
            if check_response.status_code == 200:
                print("✅ Invoice found in database!")
                invoice = check_response.json()
                print(f"   Number: {invoice.get('invoice_number')}")
                print(f"   Total: ₹{invoice.get('total_amount')}")
            else:
                print(f"❌ Invoice NOT found in database!")
                print(f"   This means the invoice was not committed!")
        
        return result
    else:
        print(f"\n❌ Failed with status {response.status_code}")
        print(f"Error: {response.text[:500]}")
        return None

def check_database_directly():
    """Generate SQL to check database directly"""
    
    print("\n" + "=" * 60)
    print("📝 CHECK DATABASE DIRECTLY")
    print("=" * 60)
    
    print("\nRun these queries in Supabase SQL Editor:")
    print("-" * 50)
    
    queries = [
        "-- 1. Check if ANY invoices exist:",
        "SELECT COUNT(*) as total_invoices FROM sales.invoices;",
        "",
        "-- 2. Check recent invoices:",
        "SELECT invoice_id, invoice_number, customer_name, total_amount, created_at",
        "FROM sales.invoices",
        "ORDER BY created_at DESC",
        "LIMIT 10;",
        "",
        "-- 3. Check if ANY invoice_items exist:",
        "SELECT COUNT(*) as total_items FROM sales.invoice_items;",
        "",
        "-- 4. Check for invoices created today:",
        "SELECT invoice_id, invoice_number, customer_name, total_amount",
        "FROM sales.invoices",
        "WHERE DATE(created_at) = CURRENT_DATE",
        "ORDER BY invoice_id DESC;",
        "",
        "-- 5. Check for org_id mismatch:",
        "SELECT DISTINCT org_id FROM sales.invoices;",
        "",
        "-- 6. Check if there are any constraints preventing insertion:",
        "SELECT conname, contype, conrelid::regclass",
        "FROM pg_constraint",
        "WHERE conrelid = 'sales.invoices'::regclass;"
    ]
    
    for query in queries:
        print(query)

def test_with_logging():
    """Test with server-side logging enabled"""
    
    print("\n" + "=" * 60)
    print("🔍 TESTING WITH LOGGING")
    print("=" * 60)
    
    # Create invoice with debug flag
    invoice_data = {
        "debug": True,  # Request debug logging
        "customer_id": 28,
        "customer_name": "Debug Test",
        "items": [],  # Empty items to test
        "total_amount": 0,
        "notes": f"Debug test at {datetime.now().isoformat()}"
    }
    
    response = requests.post(
        f"{API_BASE}/invoices/",
        json=invoice_data,
        headers={"X-Org-Id": ORG_ID, "Content-Type": "application/json"}
    )
    
    print(f"Response: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.text[:1000]}")

if __name__ == "__main__":
    # Test minimal invoice
    result = test_minimal_invoice()
    
    # Show SQL queries
    check_database_directly()
    
    # Test with logging
    test_with_logging()
    
    print("\n" + "=" * 60)
    print("🔍 DIAGNOSIS")
    print("=" * 60)
    print("\nPossible issues:")
    print("1. ❌ Transaction not being committed (db.commit() not reached)")
    print("2. ❌ Transaction being rolled back due to error")
    print("3. ❌ Wrong database/schema being used")
    print("4. ❌ Permissions issue preventing INSERT")
    print("5. ❌ org_id foreign key constraint failing")
    print("\nCheck Railway logs for the backend to see actual errors!")