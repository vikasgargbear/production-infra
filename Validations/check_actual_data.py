#!/usr/bin/env python3
"""
Check actual data from test endpoints
"""

import requests
import json

API_BASE = "https://pharma-backend-production-0c09.up.railway.app"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def check_test_endpoints():
    """Use test endpoints to check actual database values"""
    
    print("\n🔍 CHECKING ACTUAL DATABASE VALUES")
    print("="*60)
    
    # Check products table structure
    print("\n1. Checking Products Table Columns:")
    response = requests.get(f"{API_BASE}/test/check-products-columns")
    if response.status_code == 200:
        data = response.json()
        columns = data.get('columns', [])
        print(f"   Found {len(columns)} columns")
        
        # Look for price and GST columns
        for col in columns:
            name = col['name']
            if 'price' in name.lower() or 'gst' in name.lower() or 'mrp' in name.lower():
                print(f"   - {name}: {col['type']}")
    
    # Check batches table
    print("\n2. Checking Batches Table Columns:")
    response = requests.get(f"{API_BASE}/test/check-batches-columns")
    if response.status_code == 200:
        data = response.json()
        columns = data.get('columns', [])
        print(f"   Found {len(columns)} columns")
        
        # Look for price columns
        for col in columns:
            name = col['name']
            if 'price' in name.lower() or 'mrp' in name.lower():
                print(f"   - {name}: {col['type']}")
    
    # Try to get some sample data
    print("\n3. Sample Invoice Items:")
    response = requests.get(f"{API_BASE}/test/check-invoice-items-columns")
    if response.status_code == 200:
        data = response.json()
        columns = data.get('columns', [])
        
        # Look for price and tax columns
        for col in columns:
            name = col['name']
            if any(x in name.lower() for x in ['price', 'gst', 'cgst', 'sgst', 'tax', 'amount']):
                print(f"   - {name}: {col['type']}")

def check_with_sql():
    """Try SQL query approach"""
    print("\n4. Checking with direct SQL (if available):")
    
    # These are the queries we need to run on Supabase
    queries = [
        "-- Get Atlas product details:",
        "SELECT product_id, product_name, selling_price, mrp, gst_percentage",
        "FROM inventory.products",
        "WHERE LOWER(product_name) LIKE '%atlas%';",
        "",
        "-- Get batch prices for Atlas:",
        "SELECT b.batch_number, b.selling_price, b.mrp, b.quantity_available",
        "FROM inventory.batches b",
        "JOIN inventory.products p ON b.product_id = p.product_id",
        "WHERE LOWER(p.product_name) LIKE '%atlas%';",
        "",
        "-- Check actual invoice items:",
        "SELECT invoice_id, product_name, quantity, unit_price, ",
        "       discount_percent, cgst_rate, sgst_rate, line_total",
        "FROM sales.invoice_items",
        "WHERE invoice_id IN (40, 41);"
    ]
    
    print("\n📝 Run these queries in Supabase SQL Editor:")
    print("-" * 50)
    for query in queries:
        print(query)

def calculate_correct_amount():
    """Calculate with the values you mentioned"""
    print("\n💰 CALCULATION WITH YOUR OBSERVED VALUES:")
    print("="*60)
    
    # Your observed values
    unit_price = 11  # You said selling price is 11
    quantity = 12
    discount_percent = 10
    gst_percent = 12  # You said GST is 12%
    transport = 20
    
    print(f"Given:")
    print(f"  Unit Price: ₹{unit_price}")
    print(f"  Quantity: {quantity}")
    print(f"  Discount: {discount_percent}%")
    print(f"  GST: {gst_percent}%")
    print(f"  Transport: ₹{transport}")
    print()
    
    # Calculate
    subtotal = quantity * unit_price
    print(f"1. Subtotal: {quantity} × ₹{unit_price} = ₹{subtotal}")
    
    discount = subtotal * discount_percent / 100
    print(f"2. Discount: {discount_percent}% of ₹{subtotal} = ₹{discount}")
    
    taxable = subtotal - discount
    print(f"3. Taxable: ₹{subtotal} - ₹{discount} = ₹{taxable}")
    
    gst = taxable * gst_percent / 100
    print(f"4. GST: {gst_percent}% of ₹{taxable} = ₹{gst:.2f}")
    
    total_before_transport = taxable + gst
    print(f"5. Total (before transport): ₹{taxable} + ₹{gst:.2f} = ₹{total_before_transport:.2f}")
    
    final_total = total_before_transport + transport
    print(f"6. Final Total: ₹{total_before_transport:.2f} + ₹{transport} = ₹{final_total:.2f}")
    
    print("\n✅ CORRECT TOTAL SHOULD BE: ₹{:.2f}".format(final_total))
    print(f"❌ We're getting: ₹1344.00")
    print(f"🔴 DIFFERENCE: ₹{1344.00 - final_total:.2f}")
    
    return final_total

if __name__ == "__main__":
    # Check test endpoints
    check_test_endpoints()
    
    # Show SQL queries to run
    check_with_sql()
    
    # Calculate with observed values
    print("\n" + "="*60)
    correct_total = calculate_correct_amount()
    
    print("\n" + "="*60)
    print("🔍 INVESTIGATION SUMMARY:")
    print("="*60)
    print("1. Products endpoint returns 500 error")
    print("2. We're using wrong values in our test:")
    print("   - Using price: ₹100 (should be ₹11)")
    print("   - Using GST: 18% (should be 12%)")
    print(f"3. Correct total should be: ₹{correct_total:.2f}")
    print("4. We need to fix the test data!")