#!/usr/bin/env python3
"""
Price and Tax Validation Script
Gets actual prices and GST rates from database
"""

import requests
import json
from decimal import Decimal

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def get_product_details(product_name="Atlas"):
    """Get actual product price and GST from database"""
    print(f"\n🔍 Getting Product Details for: {product_name}")
    print("-" * 50)
    
    # Search for product
    response = requests.get(
        f"{API_BASE}/products",
        params={"search": product_name, "limit": 5},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        if 'products' in data and data['products']:
            for product in data['products']:
                if product_name.lower() in product.get('product_name', '').lower():
                    print(f"✅ Found Product: {product['product_name']}")
                    print(f"   Product ID: {product.get('product_id')}")
                    print(f"   Selling Price: ₹{product.get('selling_price', 'N/A')}")
                    print(f"   MRP: ₹{product.get('mrp', 'N/A')}")
                    print(f"   GST Rate: {product.get('gst_percentage', 'N/A')}%")
                    print(f"   HSN Code: {product.get('hsn_code', 'N/A')}")
                    return product
        else:
            print("❌ Product not found")
    else:
        print(f"❌ Failed to get products: {response.status_code}")
    
    return None

def get_batch_prices(product_id):
    """Get batch-specific prices"""
    print(f"\n🔍 Getting Batch Prices for Product ID: {product_id}")
    print("-" * 50)
    
    # Get batches for product
    response = requests.get(
        f"{API_BASE}/inventory/product/{product_id}/batches",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        batches = response.json()
        if batches:
            print(f"Found {len(batches)} batch(es):")
            for batch in batches[:3]:  # Show first 3 batches
                print(f"\n   Batch: {batch.get('batch_number', 'N/A')}")
                print(f"   Selling Price: ₹{batch.get('selling_price', 'N/A')}")
                print(f"   MRP: ₹{batch.get('mrp', 'N/A')}")
                print(f"   Available Qty: {batch.get('quantity_available', 'N/A')}")
                print(f"   Expiry: {batch.get('expiry_date', 'N/A')}")
            return batches[0] if batches else None
    else:
        print(f"❌ Failed to get batches: {response.status_code}")
    
    return None

def calculate_invoice_amount(quantity=12, unit_price=None, discount_percent=10, gst_percent=None, transport=20):
    """Calculate correct invoice amount"""
    print("\n💰 Invoice Calculation:")
    print("-" * 50)
    
    # Subtotal
    subtotal = Decimal(str(quantity)) * Decimal(str(unit_price))
    print(f"Subtotal: {quantity} x ₹{unit_price} = ₹{subtotal}")
    
    # Discount
    discount_amount = subtotal * Decimal(str(discount_percent)) / 100
    print(f"Discount: {discount_percent}% of ₹{subtotal} = ₹{discount_amount}")
    
    # Taxable amount
    taxable = subtotal - discount_amount
    print(f"Taxable Amount: ₹{subtotal} - ₹{discount_amount} = ₹{taxable}")
    
    # GST
    gst_amount = taxable * Decimal(str(gst_percent)) / 100
    cgst = gst_amount / 2
    sgst = gst_amount / 2
    print(f"GST: {gst_percent}% of ₹{taxable} = ₹{gst_amount}")
    print(f"   CGST: ₹{cgst}")
    print(f"   SGST: ₹{sgst}")
    
    # Total before transport
    total_before_transport = taxable + gst_amount
    print(f"Total (before transport): ₹{total_before_transport}")
    
    # Final total
    final_total = total_before_transport + Decimal(str(transport))
    print(f"Transportation: ₹{transport}")
    print(f"FINAL TOTAL: ₹{final_total}")
    
    return {
        "subtotal": float(subtotal),
        "discount_amount": float(discount_amount),
        "taxable_amount": float(taxable),
        "cgst_amount": float(cgst),
        "sgst_amount": float(sgst),
        "gst_amount": float(gst_amount),
        "transport": transport,
        "final_total": float(final_total)
    }

def validate_atlas_pricing():
    """Main validation for Atlas tablet pricing"""
    print("\n" + "="*60)
    print("🧪 ATLAS TABLET PRICING VALIDATION")
    print("="*60)
    
    # Step 1: Get product details
    product = get_product_details("Atlas")
    
    if not product:
        print("\n⚠️ Could not find Atlas product")
        return
    
    product_id = product.get('product_id')
    
    # Step 2: Get batch prices (might be different from product)
    batch = get_batch_prices(product_id)
    
    # Step 3: Determine actual selling price
    # Priority: batch selling_price > product selling_price > fallback
    if batch and batch.get('selling_price'):
        actual_price = batch['selling_price']
        print(f"\n✅ Using batch selling price: ₹{actual_price}")
    elif product.get('selling_price'):
        actual_price = product['selling_price']
        print(f"\n✅ Using product selling price: ₹{actual_price}")
    else:
        actual_price = 11  # Your observation from database
        print(f"\n⚠️ Using observed price from database: ₹{actual_price}")
    
    # Step 4: Get actual GST rate
    actual_gst = product.get('gst_percentage', 12)  # Default to 12% as you mentioned
    print(f"✅ Using GST rate: {actual_gst}%")
    
    # Step 5: Calculate correct amounts
    print("\n" + "="*60)
    print("CORRECT CALCULATION FOR BASIM INVOICE:")
    print("="*60)
    
    amounts = calculate_invoice_amount(
        quantity=12,
        unit_price=actual_price,
        discount_percent=10,
        gst_percent=actual_gst,
        transport=20
    )
    
    print("\n" + "="*60)
    print("📊 SUMMARY:")
    print("="*60)
    print(f"Product: Atlas Tablet")
    print(f"Quantity: 12 units")
    print(f"Unit Price: ₹{actual_price}")
    print(f"GST Rate: {actual_gst}%")
    print(f"Discount: 10%")
    print(f"Transportation: ₹20")
    print(f"\n✅ CORRECT TOTAL: ₹{amounts['final_total']}")
    
    # Compare with what we've been using
    wrong_total = 1344.00
    print(f"\n⚠️ We've been using: ₹{wrong_total}")
    print(f"❌ Difference: ₹{wrong_total - amounts['final_total']}")
    
    return amounts

def check_invoice_in_database(invoice_id):
    """Check what's actually saved in database"""
    print(f"\n🔍 Checking Invoice {invoice_id} in Database...")
    
    response = requests.get(
        f"{API_BASE}/invoices/{invoice_id}",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        invoice = response.json()
        print(f"✅ Invoice Found:")
        print(f"   Number: {invoice.get('invoice_number')}")
        print(f"   Total Amount: ₹{invoice.get('total_amount')}")
        print(f"   Customer: {invoice.get('customer_name')}")
        
        # Check if we can get items
        if 'items' in invoice:
            print("\n   Items:")
            for item in invoice['items']:
                print(f"   - {item.get('product_name')}: {item.get('quantity')} @ ₹{item.get('unit_price')}")
    else:
        print(f"❌ Could not get invoice: {response.status_code}")

if __name__ == "__main__":
    # Run validation
    amounts = validate_atlas_pricing()
    
    # Check recent invoices
    print("\n" + "="*60)
    print("🔍 CHECKING RECENT INVOICES:")
    print("="*60)
    
    # Check the invoices we created
    for invoice_id in [40, 41]:
        check_invoice_in_database(invoice_id)
    
    print("\n" + "="*60)
    print("✅ VALIDATION COMPLETE")
    print("="*60)