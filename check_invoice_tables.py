#!/usr/bin/env python3
"""
Check invoice and order tables structure
"""

import psycopg2
import os

DATABASE_URL = os.getenv('SUPABASE_DB_URL')
if not DATABASE_URL:
    print("Set SUPABASE_DB_URL environment variable")
    print("Export it like: export SUPABASE_DB_URL='postgresql://...'")
    exit(1)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Check if order_id exists in invoices table
    print("🔍 Checking sales.invoices columns:")
    cur.execute("""
        SELECT column_name, is_nullable, data_type
        FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'invoices'
        AND column_name = 'order_id'
    """)
    
    order_col = cur.fetchone()
    if order_col:
        print(f"  ✅ order_id column exists: {order_col}")
    else:
        print("  ❌ order_id column NOT found in sales.invoices")
    
    # Check sales.order_items columns
    print("\n🔍 Checking sales.order_items required columns:")
    required_cols = ['order_id', 'product_id', 'product_name', 'batch_id', 'quantity', 
                     'unit_price', 'discount_percent', 'cgst_rate', 'sgst_rate', 'line_total']
    
    for col in required_cols:
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'sales' 
            AND table_name = 'order_items'
            AND column_name = %s
        """, (col,))
        
        result = cur.fetchone()
        if result:
            print(f"  ✅ {col}: {result[1]}")
        else:
            print(f"  ❌ {col}: NOT FOUND")
    
    # Check sales.invoice_items columns
    print("\n🔍 Checking sales.invoice_items required columns:")
    required_cols = ['invoice_id', 'product_id', 'product_name', 'batch_id', 'quantity', 
                     'unit_price', 'discount_percent', 'cgst_rate', 'sgst_rate', 
                     'line_total', 'uom', 'pack_type', 'taxable_amount', 'total_tax_amount']
    
    for col in required_cols:
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'sales' 
            AND table_name = 'invoice_items'
            AND column_name = %s
        """, (col,))
        
        result = cur.fetchone()
        if result:
            print(f"  ✅ {col}: {result[1]}")
        else:
            print(f"  ❌ {col}: NOT FOUND")
    
    conn.close()
    
except Exception as e:
    print(f"❌ Database error: {e}")