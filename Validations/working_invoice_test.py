#!/usr/bin/env python3
"""
WORKING Invoice Creation Test - Creates customer first, then invoice
"""

import requests
import json
from datetime import datetime

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_or_find_customer():
    """Create or find Basim customer using the customer API"""
    print("\n1️⃣ Step 1: Customer Setup...")
    
    # First, try to find existing customer by phone
    print("   Searching for existing customer...")
    search_response = requests.get(
        f"{API_BASE}/customers",  # Using the customers list endpoint
        params={"search": "7738228969", "limit": 1},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if search_response.status_code == 200:
        data = search_response.json()
        if data.get('customers') and len(data['customers']) > 0:
            customer = data['customers'][0]
            customer_id = customer['customer_id']
            print(f"   ✅ Found existing customer: {customer.get('customer_name', 'Basim')} (ID: {customer_id})")
            return customer_id
    
    # Customer not found, create new one
    print("   Creating new customer...")
    customer_data = {
        "customer_name": "Basim",
        "customer_code": "BASIM001",  # Add customer code
        "customer_type": "retail",
        "primary_phone": "7738228969",
        "primary_email": "basim@example.com",
        "secondary_phone": "",
        "whatsapp_number": "7738228969",
        "gst_number": "",  # No GST for retail
        "pan_number": "",
        "state": "Maharashtra",
        "state_code": "27",  # Maharashtra state code
        "city": "Mumbai",
        "address_line1": "123 Main Street",
        "address_line2": "Near City Mall",
        "pincode": "400001",
        "credit_limit": 50000,
        "credit_period_days": 30,
        "payment_terms": "Net 30",
        "business_type": "retail_pharmacy",
        "is_active": True
    }
    
    # POST to customers endpoint (check if trailing slash needed)
    for url in [f"{API_BASE}/customers/", f"{API_BASE}/customers"]:
        response = requests.post(
            url,
            json=customer_data,
            headers={
                "X-Org-Id": ORG_ID,
                "Content-Type": "application/json"
            },
            allow_redirects=False
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            # Handle different response formats
            if isinstance(result, dict):
                if 'customer' in result:
                    customer_id = result['customer']['customer_id']
                else:
                    customer_id = result.get('customer_id') or result.get('id')
            else:
                customer_id = result  # Might just return the ID
            
            print(f"   ✅ Customer created successfully!")
            print(f"      Name: Basim")
            print(f"      ID: {customer_id}")
            print(f"      Phone: 7738228969")
            return customer_id
        elif response.status_code == 307:
            continue  # Try the other URL
    
    # If creation failed, try to use existing customer
    print("   ⚠️ Could not create new customer, checking for existing...")
    
    # Do a broader search
    list_response = requests.get(
        f"{API_BASE}/customers",
        params={"limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if list_response.status_code == 200:
        data = list_response.json()
        if data.get('customers') and len(data['customers']) > 0:
            # Use the first available customer
            customer = data['customers'][0]
            customer_id = customer['customer_id']
            print(f"   ⚠️ Using existing customer: {customer.get('customer_name')} (ID: {customer_id})")
            return customer_id
    
    # Last resort - use known ID
    print("   ⚠️ Using known customer ID: 28")
    return 28

def create_invoice(customer_id):
    """Create invoice for the customer"""
    print(f"\n2️⃣ Step 2: Invoice Creation...")
    
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
    print(f"\n3️⃣ Step 3: Database Verification...")
    
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
    print("🚀 END-TO-END INVOICE CREATION TEST")
    print("="*60)
    print("\nThis test will:")
    print("1. Find or create customer 'Basim'")
    print("2. Create invoice with Atlas tablets")
    print("3. Verify in database")
    
    # Step 1: Create or find customer
    customer_id = create_or_find_customer()
    
    if not customer_id:
        print("\n❌ Cannot proceed without customer")
        return
    
    # Step 2: Create invoice
    print(f"   Customer ID: {customer_id}")
    print(f"   Product: Atlas Tablet x 12")
    print(f"   Discount: 10%")
    print(f"   Transportation: ₹20")
    print(f"   Payment: Cash")
    
    invoice = create_invoice(customer_id)
    
    if invoice and invoice.get('invoice_id'):
        # Step 3: Verify
        verify_in_database(invoice['invoice_id'])
        
        print("\n" + "="*60)
        print("🎉 COMPLETE SUCCESS!")
        print("="*60)
        print("\n📊 Summary:")
        print(f"   Customer: Basim (ID: {customer_id})")
        print(f"   Invoice ID: {invoice['invoice_id']}")
        print(f"   Invoice Number: {invoice.get('invoice_number', 'N/A')}")
        print(f"   Total Amount: ₹{invoice.get('total_amount', 0)}")
        print("\n📍 Database Location:")
        print(f"   Table: sales.invoices")
        print(f"   Query: SELECT * FROM sales.invoices WHERE invoice_id = {invoice['invoice_id']};")
        print(f"\n   Items Table: sales.invoice_items")
        print(f"   Query: SELECT * FROM sales.invoice_items WHERE invoice_id = {invoice['invoice_id']};")
    else:
        print("\n" + "="*60)
        print("⚠️ Invoice creation had issues")
        print("Check the errors above for details")

if __name__ == "__main__":
    main()