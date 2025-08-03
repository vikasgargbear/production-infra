#!/usr/bin/env python3
"""
Check if invoice items are being saved to database
"""

import requests

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def check_invoice_details(invoice_id):
    """Check invoice and its items"""
    
    print(f"\n🔍 Checking Invoice {invoice_id} Details")
    print("=" * 60)
    
    # Get invoice details
    response = requests.get(
        f"{API_BASE}/invoices/{invoice_id}",
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        invoice = response.json()
        
        print(f"✅ Invoice Found:")
        print(f"   Number: {invoice.get('invoice_number')}")
        print(f"   Customer: {invoice.get('customer_name')}")
        print(f"   Total: ₹{invoice.get('total_amount')}")
        print(f"   Status: {invoice.get('invoice_status')}")
        
        # Check if items are in response
        if 'items' in invoice:
            items = invoice['items']
            print(f"\n📦 Invoice Items: {len(items)} items")
            for i, item in enumerate(items, 1):
                print(f"\n   Item {i}:")
                print(f"   - Product: {item.get('product_name')}")
                print(f"   - Quantity: {item.get('quantity')}")
                print(f"   - Unit Price: ₹{item.get('unit_price')}")
                print(f"   - Discount: {item.get('discount_percent')}%")
                print(f"   - Line Total: ₹{item.get('line_total')}")
        else:
            print("\n⚠️ No items found in invoice response")
            print("   Items might not be fetched by the GET endpoint")
    else:
        print(f"❌ Failed to get invoice: {response.status_code}")

def check_recent_invoices():
    """Check recent invoices"""
    
    print("\n📋 CHECKING RECENT INVOICES")
    print("=" * 60)
    
    # Get recent invoices
    response = requests.get(
        f"{API_BASE}/invoices",
        params={"limit": 5, "order": "desc"},
        headers={"X-Org-Id": ORG_ID}
    )
    
    if response.status_code == 200:
        data = response.json()
        invoices = data.get('invoices', [])
        
        print(f"Found {len(invoices)} recent invoices:")
        for invoice in invoices:
            print(f"\n• Invoice #{invoice.get('invoice_id')}: {invoice.get('invoice_number')}")
            print(f"  Customer: {invoice.get('customer_name')}")
            print(f"  Total: ₹{invoice.get('total_amount')}")
            print(f"  Date: {invoice.get('invoice_date')}")
            
            # Check each invoice's details
            if invoice.get('invoice_id'):
                check_invoice_details(invoice['invoice_id'])

def generate_sql_queries():
    """Generate SQL to check database directly"""
    
    print("\n" + "=" * 60)
    print("📝 SQL QUERIES TO CHECK IN SUPABASE")
    print("=" * 60)
    
    queries = [
        "-- 1. Check recent invoices:",
        "SELECT invoice_id, invoice_number, customer_name, total_amount",
        "FROM sales.invoices",
        "ORDER BY invoice_id DESC",
        "LIMIT 5;",
        "",
        "-- 2. Check invoice items for recent invoices:",
        "SELECT ii.invoice_item_id, ii.invoice_id, ii.product_name,",
        "       ii.quantity, ii.unit_price, ii.line_total",
        "FROM sales.invoice_items ii",
        "WHERE ii.invoice_id IN (",
        "    SELECT invoice_id FROM sales.invoices",
        "    ORDER BY invoice_id DESC LIMIT 5",
        ");",
        "",
        "-- 3. Count items per invoice:",
        "SELECT i.invoice_id, i.invoice_number, COUNT(ii.invoice_item_id) as item_count",
        "FROM sales.invoices i",
        "LEFT JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id",
        "GROUP BY i.invoice_id, i.invoice_number",
        "ORDER BY i.invoice_id DESC",
        "LIMIT 10;",
        "",
        "-- 4. Check specific invoice (e.g., ID 46):",
        "SELECT * FROM sales.invoice_items WHERE invoice_id = 46;"
    ]
    
    print("\nRun these queries in Supabase SQL Editor:")
    print("-" * 50)
    for query in queries:
        print(query)

if __name__ == "__main__":
    # Check recent invoices
    check_recent_invoices()
    
    # Show SQL queries
    generate_sql_queries()
    
    print("\n" + "=" * 60)
    print("✅ CHECK COMPLETE")
    print("=" * 60)
    print("\nIf invoice_items table is empty, possible reasons:")
    print("1. The items insertion might be failing silently")
    print("2. The product lookup might be failing (product_id not found)")
    print("3. There might be a transaction rollback")
    print("4. The GET endpoint might not be joining with invoice_items")