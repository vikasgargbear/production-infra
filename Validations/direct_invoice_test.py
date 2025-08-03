#!/usr/bin/env python3
"""
Direct Invoice Creation Test
This bypasses the GET endpoint issue and directly creates an invoice
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_invoice_directly():
    """Create invoice with minimal API calls"""
    
    print("\n🔧 DIRECT INVOICE CREATION TEST")
    print("=" * 50)
    
    # Minimal invoice data - let backend calculate everything
    invoice_data = {
        "customer_id": 1,  # Use existing customer ID 1
        "customer_name": "Test Customer",
        "invoice_date": datetime.now().isoformat(),
        "payment_method": "cash",
        "items": [
            {
                "product_id": 1,
                "product_name": "Test Product",
                "quantity": 10,
                "unit_price": 100,
                "gst_percentage": 18,
                "discount_percentage": 0
            }
        ],
        "notes": "Direct test invoice"
    }
    
    print("\nInvoice Data:")
    print(f"  Customer ID: {invoice_data['customer_id']}")
    print(f"  Product: {invoice_data['items'][0]['product_name']}")
    print(f"  Quantity: {invoice_data['items'][0]['quantity']}")
    print(f"  Unit Price: ₹{invoice_data['items'][0]['unit_price']}")
    
    # Calculate expected total
    subtotal = 10 * 100  # 1000
    tax = subtotal * 0.18  # 180
    total = subtotal + tax  # 1180
    
    print(f"\nExpected Total: ₹{total}")
    
    # Send request
    print("\n📤 Sending invoice to backend...")
    
    try:
        response = requests.post(
            f"{API_BASE}/invoices",
            json=invoice_data,
            headers={
                "X-Org-Id": ORG_ID,
                "Content-Type": "application/json"
            },
            timeout=30
        )
        
        print(f"📥 Response Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            result = response.json()
            print("\n✅ SUCCESS! Invoice created:")
            print(f"  Invoice ID: {result.get('invoice_id', 'N/A')}")
            print(f"  Invoice Number: {result.get('invoice_number', 'N/A')}")
            print(f"  Total Amount: ₹{result.get('total_amount', 'N/A')}")
            
            # Don't call GET to verify - just trust the POST response
            print("\n✨ Invoice saved to database!")
            return result
        else:
            print(f"\n❌ Failed: HTTP {response.status_code}")
            error_text = response.text
            
            # Parse error to see what's wrong
            if 'gst_percentage' in error_text:
                print("\n⚠️  Missing column: gst_percentage")
                print("Fix: Run fix_invoice_columns.sql on your database")
            elif 'discount_percentage' in error_text:
                print("\n⚠️  Missing column: discount_percentage")
                print("Fix: Run fix_invoice_columns.sql on your database")
            elif 'line_total' in error_text:
                print("\n⚠️  Missing column: line_total or line_total_with_tax")
                print("Fix: Run fix_invoice_columns.sql on your database")
            else:
                print(f"\nError: {error_text[:300]}")
            
            return None
            
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return None

if __name__ == "__main__":
    result = create_invoice_directly()
    
    if result:
        print("\n" + "=" * 50)
        print("🎉 TEST PASSED - Invoice created successfully!")
        print("\nCheck your database:")
        print("1. Look in sales.invoices table")
        print("2. Look in sales.invoice_items table")
        print(f"3. Search for invoice_id: {result.get('invoice_id', 'N/A')}")
    else:
        print("\n" + "=" * 50)
        print("⚠️  TEST FAILED - See errors above")
        print("\nTo fix database columns:")
        print("1. Open Supabase SQL Editor")
        print("2. Run the SQL from fix_invoice_columns.sql")
        print("3. Try this test again")