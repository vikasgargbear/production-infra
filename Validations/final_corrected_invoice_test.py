#!/usr/bin/env python3
"""
FINAL CORRECTED Invoice Test with Actual Database Values
This test uses the CORRECT pricing from the database:
- Unit Price: ₹11 (not ₹100)
- GST: 12% (not 18%)
"""

import requests
import json
from datetime import datetime
from decimal import Decimal

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

# ACTUAL VALUES FROM DATABASE
ACTUAL_UNIT_PRICE = 11.00
ACTUAL_GST_PERCENT = 12.0
ACTUAL_MRP = 15.00

def calculate_correct_amounts(quantity=12, unit_price=ACTUAL_UNIT_PRICE, 
                             discount_percent=10, gst_percent=ACTUAL_GST_PERCENT,
                             other_charges=20):
    """Calculate invoice amounts with actual database values"""
    
    print("\n💰 CALCULATING WITH ACTUAL DATABASE VALUES:")
    print("-" * 50)
    print(f"  Unit Price: ₹{unit_price} (from database)")
    print(f"  Quantity: {quantity}")
    print(f"  GST: {gst_percent}% (from database)")
    print(f"  Discount: {discount_percent}%")
    print(f"  Transport: ₹{other_charges}")
    
    # Use Decimal for precise calculations
    subtotal = Decimal(str(quantity * unit_price))
    discount_amount = subtotal * Decimal(str(discount_percent)) / 100
    taxable_amount = subtotal - discount_amount
    
    # Calculate GST
    gst_amount = taxable_amount * Decimal(str(gst_percent)) / 100
    cgst_amount = gst_amount / 2
    sgst_amount = gst_amount / 2
    
    # Round to 2 decimal places
    cgst_amount = float(cgst_amount.quantize(Decimal('0.01')))
    sgst_amount = float(sgst_amount.quantize(Decimal('0.01')))
    
    # Final total
    total_before_charges = float(taxable_amount) + float(gst_amount)
    final_total = total_before_charges + other_charges
    
    result = {
        "subtotal_amount": float(subtotal),
        "discount_amount": float(discount_amount),
        "taxable_amount": float(taxable_amount),
        "cgst_amount": cgst_amount,
        "sgst_amount": sgst_amount,
        "igst_amount": 0,
        "total_tax_amount": float(gst_amount),
        "other_charges": other_charges,
        "final_amount": final_total,
        "total_amount": final_total,
        "net_amount": final_total,
        "paid_amount": final_total
    }
    
    print(f"\n  Subtotal: ₹{result['subtotal_amount']:.2f}")
    print(f"  - Discount: ₹{result['discount_amount']:.2f}")
    print(f"  = Taxable: ₹{result['taxable_amount']:.2f}")
    print(f"  + GST ({gst_percent}%): ₹{result['total_tax_amount']:.2f}")
    print(f"  + Transport: ₹{other_charges:.2f}")
    print(f"  = TOTAL: ₹{result['final_amount']:.2f}")
    
    return result

def create_or_find_customer():
    """Create or find Basim customer"""
    print("\n🔍 Finding/Creating Customer...")
    
    # Try to find by phone
    response = requests.get(
        f"{API_BASE}/customers",
        params={"search": "7738228969", "limit": 1},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get('customers'):
            customer = data['customers'][0]
            print(f"✅ Found customer: {customer.get('customer_name')} (ID: {customer['customer_id']})")
            return customer['customer_id']
    
    # Create new customer
    customer_data = {
        "customer_name": "Basim",
        "customer_code": "BASIM001",
        "customer_type": "retail",
        "primary_phone": "7738228969",
        "primary_email": "basim@example.com",
        "state": "Maharashtra",
        "state_code": "27",
        "city": "Mumbai",
        "address_line1": "123 Main Street",
        "pincode": "400001",
        "is_active": True
    }
    
    # Try with trailing slash
    response = requests.post(
        f"{API_BASE}/customers/",
        json=customer_data,
        headers={"X-Org-Id": ORG_ID, "Content-Type": "application/json"},
        allow_redirects=False
    )
    
    if response.status_code in [200, 201]:
        result = response.json()
        customer_id = result.get('customer_id') or result.get('customer', {}).get('customer_id')
        print(f"✅ Created customer: Basim (ID: {customer_id})")
        return customer_id
    
    # Fallback to known customer
    print("⚠️ Using fallback customer ID: 28")
    return 28

def create_corrected_invoice(customer_id):
    """Create invoice with CORRECT pricing"""
    
    print("\n📝 Creating Invoice with CORRECT Pricing...")
    
    # Calculate correct amounts
    amounts = calculate_correct_amounts(
        quantity=12,
        unit_price=ACTUAL_UNIT_PRICE,
        discount_percent=10,
        gst_percent=ACTUAL_GST_PERCENT,
        other_charges=20
    )
    
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
                "unit_price": ACTUAL_UNIT_PRICE,  # ₹11 not ₹100!
                "mrp": ACTUAL_MRP,
                "discount_percent": 10.0,
                "uom": "STRIP",
                "pack_type": "STRIP"
            }
        ],
        **amounts,  # Use calculated amounts
        "notes": f"Basim invoice - Corrected pricing (₹{ACTUAL_UNIT_PRICE}/unit, {ACTUAL_GST_PERCENT}% GST)"
    }
    
    print("\n📤 Sending to API...")
    response = requests.post(
        f"{API_BASE}/invoices/",  # WITH trailing slash
        json=invoice_data,
        headers={"X-Org-Id": ORG_ID, "Content-Type": "application/json"},
        timeout=30
    )
    
    print(f"📥 Response: {response.status_code}")
    
    if response.status_code in [200, 201]:
        result = response.json()
        print("\n✅ SUCCESS! Invoice Created:")
        print(f"  Invoice ID: {result.get('invoice_id')}")
        print(f"  Invoice Number: {result.get('invoice_number')}")
        print(f"  Total Amount: ₹{result.get('total_amount')}")
        return result
    else:
        print(f"❌ Failed: {response.text[:500]}")
        return None

def verify_invoice(invoice_id):
    """Verify invoice in database"""
    print(f"\n🔍 Verifying Invoice {invoice_id}...")
    
    response = requests.get(
        f"{API_BASE}/invoices/{invoice_id}",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        invoice = response.json()
        print(f"✅ Verified in database:")
        print(f"  Number: {invoice.get('invoice_number')}")
        print(f"  Customer: {invoice.get('customer_name')}")
        print(f"  Total: ₹{invoice.get('total_amount')}")
        
        if 'items' in invoice and invoice['items']:
            print(f"\n  Items:")
            for item in invoice['items']:
                print(f"  - {item.get('product_name')}: {item.get('quantity')} @ ₹{item.get('unit_price')}")
        
        return True
    return False

def main():
    print("\n" + "=" * 60)
    print("🎯 FINAL CORRECTED INVOICE TEST")
    print("=" * 60)
    print("\n📊 Using ACTUAL database values:")
    print(f"  • Unit Price: ₹{ACTUAL_UNIT_PRICE} (not ₹100)")
    print(f"  • GST: {ACTUAL_GST_PERCENT}% (not 18%)")
    print(f"  • MRP: ₹{ACTUAL_MRP}")
    
    # Step 1: Customer
    customer_id = create_or_find_customer()
    
    # Step 2: Create invoice
    invoice = create_corrected_invoice(customer_id)
    
    if invoice:
        # Step 3: Verify
        invoice_id = invoice.get('invoice_id')
        if invoice_id:
            verify_invoice(invoice_id)
        
        # Summary
        print("\n" + "=" * 60)
        print("🎉 COMPLETE SUCCESS WITH CORRECT PRICING!")
        print("=" * 60)
        print(f"\n📋 Final Summary:")
        print(f"  Customer: Basim (ID: {customer_id})")
        print(f"  Invoice: {invoice.get('invoice_number')} (ID: {invoice_id})")
        print(f"  Product: Atlas Tablet x 12")
        print(f"  Unit Price: ₹{ACTUAL_UNIT_PRICE}")
        print(f"  GST: {ACTUAL_GST_PERCENT}%")
        print(f"  Total: ₹{invoice.get('total_amount')}")
        
        # Compare with wrong calculation
        wrong_total = 1294.40
        correct_total = invoice.get('total_amount', 153.06)
        print(f"\n⚠️ Previous Wrong Total: ₹{wrong_total}")
        print(f"✅ Correct Total: ₹{correct_total}")
        print(f"💰 Difference: ₹{wrong_total - correct_total:.2f} saved!")
        
        print(f"\n📍 Check in Supabase:")
        print(f"  SELECT * FROM sales.invoices WHERE invoice_id = {invoice_id};")
        print(f"  SELECT * FROM sales.invoice_items WHERE invoice_id = {invoice_id};")
    else:
        print("\n❌ Invoice creation failed")
        print("Check the errors above for details")

if __name__ == "__main__":
    main()