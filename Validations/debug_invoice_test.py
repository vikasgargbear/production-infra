#!/usr/bin/env python3
"""
Debug Invoice Test - See exactly what's happening
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def test_invoice_creation():
    """Test with minimal data to see what happens"""
    
    print("\n🔍 DEBUG INVOICE TEST")
    print("="*50)
    
    # Super minimal invoice
    invoice_data = {
        "customer_id": 1,
        "customer_name": "Test Customer",
        "items": [
            {
                "product_id": 1,
                "product_name": "Test Product", 
                "quantity": 1,
                "unit_price": 100,
                "uom": "PCS",
                "pack_type": "STRIP"
            }
        ]
    }
    
    print("\n📤 Sending minimal invoice...")
    print(f"Data: {json.dumps(invoice_data, indent=2)}")
    
    response = requests.post(
        f"{API_BASE}/invoices",
        json=invoice_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        },
        timeout=30
    )
    
    print(f"\n📥 Response Status: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    
    try:
        result = response.json()
        print(f"\n📋 Response Body:")
        print(json.dumps(result, indent=2))
        
        # Check if it's the invoice data or a list
        if isinstance(result, dict):
            if 'invoice_id' in result:
                print("\n✅ Got invoice creation response!")
                print(f"Invoice ID: {result['invoice_id']}")
                print(f"Invoice Number: {result.get('invoice_number')}")
                return result['invoice_id']
            elif 'invoices' in result:
                print("\n⚠️ Got invoice LIST instead of creation response")
                print(f"Total invoices: {result.get('total', 0)}")
                if result['invoices']:
                    print("Latest invoice:", result['invoices'][0])
        
    except Exception as e:
        print(f"\n❌ Error parsing response: {e}")
        print(f"Raw response: {response.text[:500]}")
    
    return None

def check_database_directly():
    """Check if invoices exist in database"""
    print("\n🔍 Checking existing invoices...")
    
    response = requests.get(
        f"{API_BASE}/invoices?limit=5",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"Found {data.get('total', 0)} invoices")
        if data.get('invoices'):
            for inv in data['invoices'][:3]:
                print(f"  - ID: {inv['invoice_id']}, Number: {inv['invoice_number']}, Amount: ₹{inv['final_amount']}")
    else:
        print(f"Failed to get invoices: {response.status_code}")

def main():
    # First check what's in database
    check_database_directly()
    
    # Try to create new invoice
    print("\n" + "="*50)
    invoice_id = test_invoice_creation()
    
    if invoice_id:
        print(f"\n✅ Success! Check Supabase for invoice_id: {invoice_id}")
    else:
        print("\n⚠️ Could not confirm invoice creation")
        print("\nPossible issues:")
        print("1. Invoice might be created but response is wrong")
        print("2. Database connection issue")
        print("3. Missing required fields")
        
    # Check again
    print("\n" + "="*50)
    check_database_directly()

if __name__ == "__main__":
    main()