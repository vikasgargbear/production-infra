#!/usr/bin/env python3
"""
Create end-to-end invoice for customer Basim
- Customer: Basim, phone 7738228969
- Product: Atlas, quantity 12
- 10% discount, ₹20 transportation
- Cash payment method
"""

import requests
import json
from datetime import datetime
from decimal import Decimal

# Configuration
API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def create_basim_invoice():
    """Create complete invoice for Basim"""
    
    print("=" * 60)
    print("Creating End-to-End Invoice for Customer Basim")
    print("=" * 60)
    
    # Step 1: Find or create customer Basim
    print("\n1. Finding customer Basim...")
    
    # Search for customer
    response = requests.get(
        f"{API_BASE}/customers",
        params={"search": "Basim", "limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        result = response.json()
        # Handle different response formats
        if isinstance(result, dict) and 'customers' in result:
            customers = result['customers']
        elif isinstance(result, list):
            customers = result
        else:
            customers = []
            
        if customers and len(customers) > 0:
            customer = customers[0]
            print(f"✅ Found customer: {customer['customer_name']} (ID: {customer['customer_id']})")
        else:
            # Create customer
            print("Customer not found. Creating new customer...")
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
                f"{API_BASE}/customers",
                json=customer_data,
                headers={
                    "X-Org-Id": ORG_ID,
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code in [200, 201]:
                customer = response.json()
                # Handle different response formats
                if 'customer' in customer:
                    customer = customer['customer']
                print(f"✅ Created customer: {customer.get('customer_name', 'Basim')} (ID: {customer.get('customer_id', 'N/A')})")
            else:
                print(f"❌ Failed to create customer: Status {response.status_code}")
                print(f"Response: {response.text}")
                return
    else:
        print(f"❌ Failed to search customers: {response.text}")
        return
    
    # Step 2: Find Atlas product
    print("\n2. Finding Atlas product...")
    
    response = requests.get(
        f"{API_BASE}/products",
        params={"search": "Atlas", "limit": 10},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        result = response.json()
        # Handle different response formats
        if isinstance(result, dict) and 'products' in result:
            products = result['products']
        elif isinstance(result, list):
            products = result
        else:
            products = []
            
        atlas_product = None
        for product in products:
            if "atlas" in product.get('product_name', '').lower():
                atlas_product = product
                break
        
        if atlas_product:
            print(f"✅ Found product: {atlas_product['product_name']} (ID: {atlas_product['product_id']})")
            print(f"   Price: ₹{atlas_product.get('selling_price', 100)}")
        else:
            print("❌ Atlas product not found")
            return
    else:
        print(f"❌ Failed to search products: {response.text}")
        return
    
    # Step 3: Get available batches for Atlas
    print("\n3. Checking inventory for Atlas...")
    
    response = requests.get(
        f"{API_BASE}/inventory/product/{atlas_product['product_id']}/batches",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        batches = response.json()
        available_batches = [b for b in batches if b.get('quantity_available', 0) >= 12]
        
        if available_batches:
            batch = available_batches[0]
            print(f"✅ Found batch: {batch.get('batch_number', 'N/A')} with {batch.get('quantity_available', 0)} units")
        else:
            # Use product without specific batch
            batch = None
            print("⚠️ No specific batch found, will use product inventory")
    else:
        batch = None
        print("⚠️ Could not fetch batches, proceeding without batch info")
    
    # Step 4: Create invoice
    print("\n4. Creating invoice...")
    
    # Prepare invoice data
    unit_price = float(atlas_product.get('selling_price', 100))
    quantity = 12
    discount_percentage = 10.0
    transportation_charge = 20.0
    
    # Calculate amounts
    subtotal = quantity * unit_price
    discount_amount = subtotal * discount_percentage / 100
    taxable_amount = subtotal - discount_amount
    gst_percentage = float(atlas_product.get('gst_percentage', 18))
    gst_amount = taxable_amount * gst_percentage / 100
    
    invoice_data = {
        "customer_id": customer['customer_id'],
        "invoice_date": datetime.now().isoformat(),
        "payment_method": "cash",
        "items": [
            {
                "product_id": atlas_product['product_id'],
                "product_name": atlas_product['product_name'],
                "product_code": atlas_product.get('product_code', ''),
                "hsn_code": atlas_product.get('hsn_code', ''),
                "batch_id": batch['batch_id'] if batch else None,
                "batch_number": batch.get('batch_number', '') if batch else '',
                "quantity": quantity,
                "unit_price": unit_price,
                "mrp": atlas_product.get('mrp', unit_price),
                "discount_percentage": discount_percentage,
                "discount_amount": discount_amount,
                "gst_percentage": gst_percentage,
                "cgst_amount": gst_amount / 2,  # Assuming intra-state
                "sgst_amount": gst_amount / 2,
                "igst_amount": 0,
                "line_total": taxable_amount,
                "line_total_with_tax": taxable_amount + gst_amount
            }
        ],
        "subtotal_amount": subtotal,
        "discount_amount": discount_amount,
        "discount_percentage": discount_percentage,
        "other_charges": transportation_charge,
        "other_charges_description": "Transportation",
        "net_amount": taxable_amount + gst_amount + transportation_charge,
        "paid_amount": taxable_amount + gst_amount + transportation_charge,  # Full cash payment
        "notes": "Cash sale to Basim - Atlas product"
    }
    
    print(f"\nInvoice Summary:")
    print(f"  Subtotal: ₹{subtotal:.2f} ({quantity} x ₹{unit_price:.2f})")
    print(f"  Discount: -₹{discount_amount:.2f} ({discount_percentage}%)")
    print(f"  Taxable: ₹{taxable_amount:.2f}")
    print(f"  GST: ₹{gst_amount:.2f} ({gst_percentage}%)")
    print(f"  Transportation: ₹{transportation_charge:.2f}")
    print(f"  Total: ₹{taxable_amount + gst_amount + transportation_charge:.2f}")
    
    # Create invoice
    response = requests.post(
        f"{API_BASE}/invoices",
        json=invoice_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        }
    )
    
    if response.status_code in [200, 201]:
        invoice = response.json()
        print(f"\n✅ Invoice created successfully!")
        print(f"   Invoice Number: {invoice.get('invoice_number', 'N/A')}")
        print(f"   Invoice ID: {invoice.get('invoice_id', 'N/A')}")
        print(f"   Customer: {customer['customer_name']}")
        print(f"   Total Amount: ₹{invoice.get('total_amount', invoice_data['net_amount']):.2f}")
        print(f"   Payment Status: Paid (Cash)")
        
        # Step 5: Verify invoice was saved
        print("\n5. Verifying invoice in database...")
        
        if invoice.get('invoice_id'):
            verify_response = requests.get(
                f"{API_BASE}/invoices/{invoice['invoice_id']}",
                headers={"X-Org-Id": ORG_ID}
            )
            
            if verify_response.status_code == 200:
                print("✅ Invoice verified in database")
            else:
                print("⚠️ Could not verify invoice")
        
        return invoice
    else:
        print(f"❌ Failed to create invoice: {response.status_code}")
        print(f"Response: {response.text}")
        return None

if __name__ == "__main__":
    try:
        invoice = create_basim_invoice()
        if invoice:
            print("\n" + "=" * 60)
            print("✅ END-TO-END INVOICE CREATION SUCCESSFUL!")
            print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()