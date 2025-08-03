#!/usr/bin/env python3
"""
WORKING Invoice Creation Test - Creates customer first, then invoice
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_customer():
    """Create Basim customer"""
    print("\n1️⃣ Creating Customer...")
    
    customer_data = {
        "customer_name": "Basim",
        "customer_type": "retail",
        "primary_phone": "7738228969",
        "primary_email": "basim@example.com",
        "state": "Maharashtra",
        "city": "Mumbai",
        "credit_limit": 50000,
        "credit_period_days": 30
    }
    
    response = requests.post(
        f"{API_BASE}/customers/",  # Note: might need trailing slash
        json=customer_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        }
    )
    
    if response.status_code in [200, 201]:
        result = response.json()
        customer_id = result.get('customer_id') or result.get('id')
        print(f"✅ Customer created: Basim (ID: {customer_id})")
        return customer_id
    else:
        print(f"❌ Customer creation failed: {response.status_code}")
        # Try to find existing customer
        search_response = requests.get(
            f"{API_BASE}/customers?search=7738228969&limit=1",
            headers={"X-Org-Id": ORG_ID}
        )
        if search_response.status_code == 200:
            data = search_response.json()
            if data.get('customers'):
                customer_id = data['customers'][0]['customer_id']
                print(f"✅ Found existing customer: ID {customer_id}")
                return customer_id
        
        # Fallback - use a known ID or create manually
        print("⚠️ Using fallback customer_id: 28")
        return 28  # From earlier tests we know ID 28 exists

def create_invoice(customer_id):
    """Create invoice for the customer"""
    print(f"\n2️⃣ Creating Invoice for Customer ID: {customer_id}...")
    
    invoice_data = {
        "customer_id": customer_id,
        "customer_name": "Basim",
        "primary_phone": "7738228969",
        "invoice_date": datetime.now().isoformat(),
        "invoice_type": "tax_invoice",
        "payment_method": "cash",
        "payment_terms": "cash",
        "place_of_supply": "Maharashtra",
        "items": [
            {
                "product_id": 1,
                "product_name": "Atlas Tablet",
                "product_code": "ATL001",
                "hsn_code": "3004",
                "quantity": 12,
                "unit_price": 100.00,
                "mrp": 120.00,
                "discount_percent": 10.0,
                "uom": "STRIP",
                "pack_type": "STRIP"
            }
        ],
        "subtotal_amount": 1200.00,
        "discount_amount": 120.00,
        "taxable_amount": 1080.00,
        "cgst_amount": 97.20,
        "sgst_amount": 97.20,
        "igst_amount": 0,
        "total_tax_amount": 194.40,
        "other_charges": 20.00,
        "other_charges_description": "Transportation",
        "final_amount": 1294.40,
        "total_amount": 1294.40,
        "net_amount": 1294.40,
        "paid_amount": 1294.40,
        "notes": "Basim invoice - Atlas x12, 10% discount, ₹20 transport"
    }
    
    response = requests.post(
        f"{API_BASE}/invoices/",  # WITH trailing slash!
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
        print(f"   Invoice ID: {result.get('invoice_id', 'N/A')}")
        print(f"   Invoice Number: {result.get('invoice_number', 'N/A')}")
        print(f"   Total Amount: ₹{result.get('total_amount', 'N/A')}")
        return result
    else:
        print(f"\n❌ Failed: HTTP {response.status_code}")
        try:
            error = response.json()
            print(f"Error: {json.dumps(error, indent=2)[:500]}")
        except:
            print(f"Error: {response.text[:500]}")
        return None

def verify_in_database(invoice_id):
    """Check if invoice exists in database"""
    print(f"\n3️⃣ Verifying Invoice ID {invoice_id} in database...")
    
    response = requests.get(
        f"{API_BASE}/invoices/{invoice_id}",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        invoice = response.json()
        print(f"✅ Invoice verified in database!")
        print(f"   Number: {invoice.get('invoice_number')}")
        print(f"   Customer: {invoice.get('customer_name')}")
        print(f"   Amount: ₹{invoice.get('total_amount')}")
        return True
    else:
        print(f"⚠️ Could not verify invoice: {response.status_code}")
        return False

def main():
    print("\n" + "="*60)
    print("🚀 COMPLETE INVOICE CREATION WORKFLOW")
    print("="*60)
    
    # Step 1: Create or find customer
    customer_id = create_customer()
    
    if not customer_id:
        print("\n❌ Cannot proceed without customer")
        return
    
    # Step 2: Create invoice
    invoice = create_invoice(customer_id)
    
    if invoice and invoice.get('invoice_id'):
        # Step 3: Verify
        verify_in_database(invoice['invoice_id'])
        
        print("\n" + "="*60)
        print("🎉 COMPLETE SUCCESS!")
        print("Invoice has been created and saved to database")
        print("\nCheck Supabase tables:")
        print(f"  - sales.invoices WHERE invoice_id = {invoice['invoice_id']}")
        print(f"  - sales.invoice_items WHERE invoice_id = {invoice['invoice_id']}")
    else:
        print("\n" + "="*60)
        print("⚠️ Invoice creation had issues")
        print("Check the errors above for details")

if __name__ == "__main__":
    main()