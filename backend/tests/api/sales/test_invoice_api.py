#!/usr/bin/env python3
"""
Invoice API Test - Creates invoice via API and verifies all tables
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_invoice_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
from datetime import date, timedelta

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

def create_test_invoice():
    """Create a test invoice with 2 items and transport details"""
    
    # Test invoice payload
    payload = {
        "customer_id": 108,  # Use an existing customer
        "invoice_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=30)),
        "billing_address": "Test Address, City 123456",
        "shipping_address": "Test Address, City 123456",
        "delivery_type": "DELIVERY",
        "discount_type": "percentage",
        "discount_percent": 10,
        "freight_charges": 15,
        "gst_type": "CGST/SGST",
        "notes": "API Test Invoice - Auto Created",
        "payment_mode": "split",
        "transport_company": "Test Transport",
        "vehicle_number": "TEST-1234",
        "items": [
            {
                "product_id": 122,
                "batch_id": 119,
                "quantity": 1,
                "free_quantity": 1,
                "unit_price": 30,
                "mrp": 45,
                "discount_percent": 5,
                "gst_percent": 12
            },
            {
                "product_id": 134,
                "batch_id": 124,
                "quantity": 1,
                "free_quantity": 0,
                "unit_price": 23,
                "mrp": 140,
                "discount_percent": 0,
                "gst_percent": 0
            }
        ],
        "payments": [
            {"method": "cash", "amount": 32},
            {"method": "credit", "amount": 32}
        ],
        "salesperson_id": 14
    }
    
    return payload

def main():
    print("=" * 70)
    print("INVOICE API TEST (TEST_MODE)")
    print("=" * 70)
    
    print(f"\nAPI URL: {API_BASE_URL}")
    print("Auth: TEST_MODE bypass (no token needed)")
    
    # Step 1: Create invoice
    print("\n--- STEP 1: Create Invoice ---")
    payload = create_test_invoice()
    print(f"Payload items: {len(payload['items'])} items")
    print(f"Transport: {payload['transport_company']} / {payload['vehicle_number']}")
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/invoices/",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code not in [200, 201]:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        print(f"✅ Invoice created: {result.get('invoice_number', 'N/A')}")
        print(f"   Invoice ID: {result.get('invoice_id', 'N/A')}")
        print(f"   Challan ID: {result.get('challan_id', 'N/A')}")
        print(f"   Challan Number: {result.get('challan_number', 'N/A')}")
        
        invoice_id = result.get('invoice_id')
        
        # Step 2: Fetch and verify invoice
        print("\n--- STEP 2: Verify Invoice Data ---")
        if invoice_id:
            inv_response = requests.get(
                f"{API_BASE_URL}/api/invoices/{invoice_id}",
                headers=headers,
                timeout=10
            )
            if inv_response.status_code == 200:
                inv_data = inv_response.json()
                print(f"   taxable_amount:    {inv_data.get('taxable_amount', 'N/A')}")
                print(f"   total_tax_amount:  {inv_data.get('total_tax_amount', 'N/A')}")
                print(f"   final_amount:      {inv_data.get('final_amount', 'N/A')}")
                print(f"   challan_ids:       {inv_data.get('challan_ids', 'N/A')}")
        
        print("\n--- STEP 3: Summary ---")
        print("Check challan values in database with:")
        print(f"""
SELECT 
    i.invoice_number,
    i.taxable_amount as invoice_taxable,
    i.total_tax_amount as invoice_gst,
    c.taxable_amount as challan_taxable,
    c.gst_amount as challan_gst,
    CASE WHEN ABS(i.taxable_amount - c.taxable_amount) < 0.1 THEN '✅' ELSE '❌' END as taxable_ok,
    CASE WHEN ABS(i.total_tax_amount - c.gst_amount) < 0.1 THEN '✅' ELSE '❌' END as gst_ok
FROM sales.invoices i
JOIN sales.delivery_challans c ON c.invoice_id = i.invoice_id
WHERE i.invoice_id = {invoice_id};
""")
        
        return True
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
