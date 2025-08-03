#!/usr/bin/env python3
"""
Test direct database insert for invoice items
"""

import psycopg2
import os
from datetime import date

DATABASE_URL = os.getenv('SUPABASE_DB_URL')
if not DATABASE_URL:
    print("Set SUPABASE_DB_URL environment variable")
    exit(1)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("🧪 Testing direct invoice item insert")
    
    # Get latest invoice
    cur.execute("""
        SELECT invoice_id, invoice_number 
        FROM sales.invoices 
        ORDER BY invoice_id DESC 
        LIMIT 1
    """)
    
    invoice = cur.fetchone()
    if invoice:
        invoice_id = invoice[0]
        print(f"Using invoice {invoice[1]} (ID: {invoice_id})")
        
        # Try to insert an invoice item
        print("\nInserting invoice item...")
        cur.execute("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name,
                hsn_code, batch_id, batch_number,
                quantity, unit_price, mrp,
                discount_percent, discount_amount,
                taxable_amount, cgst_rate, cgst_amount,
                sgst_rate, sgst_amount, igst_rate, igst_amount,
                total_tax_amount, line_total,
                uom, pack_type, created_at
            ) VALUES (
                %s, 47, 'Atlas Test',
                '3004', 1, 'BATCH001',
                5, 11, 15,
                0, 0,
                55, 6, 3.3,
                6, 3.3, 0, 0,
                6.6, 61.6,
                'STRIP', 'STRIP', CURRENT_TIMESTAMP
            )
        """, (invoice_id,))
        
        conn.commit()
        print("✅ Invoice item inserted successfully!")
        
        # Check if it was saved
        cur.execute("""
            SELECT COUNT(*) FROM sales.invoice_items WHERE invoice_id = %s
        """, (invoice_id,))
        
        count = cur.fetchone()[0]
        print(f"Invoice items for this invoice: {count}")
        
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")