#!/usr/bin/env python3
"""
Debug product query issue
"""

import psycopg2
import os

DATABASE_URL = os.getenv('SUPABASE_DB_URL')
if not DATABASE_URL:
    print("Set SUPABASE_DB_URL environment variable")
    exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# Check if products table has GST field
print("🔍 Checking inventory.products columns:")
cur.execute("""
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'inventory' 
    AND table_name = 'products'
    AND column_name LIKE '%gst%' OR column_name LIKE '%tax%'
""")

columns = cur.fetchall()
print(f"GST/Tax columns: {columns}")

# Check sample product
print("\n🔍 Checking products with batches:")
cur.execute("""
    SELECT p.product_id, p.product_name, 
           b.batch_id, b.batch_number, b.sale_price_per_unit, b.quantity_available
    FROM inventory.products p
    LEFT JOIN inventory.batches b ON p.product_id = b.product_id
    WHERE b.quantity_available > 0
    LIMIT 5
""")

products = cur.fetchall()
for prod in products:
    print(f"Product {prod[0]}: {prod[1]} - Batch: {prod[3]}, Price: {prod[4]}, Stock: {prod[5]}")

# Check product ID 47 specifically (Atlas)
print("\n🔍 Checking Atlas product (ID 47):")
cur.execute("""
    SELECT p.product_id, p.product_name,
           b.batch_id, b.batch_number, b.sale_price_per_unit, b.quantity_available
    FROM inventory.products p
    LEFT JOIN inventory.batches b ON p.product_id = b.product_id
    WHERE p.product_id = 47
    AND b.quantity_available > 0
""")

atlas = cur.fetchall()
if atlas:
    for a in atlas:
        print(f"  Product: {a[1]}, Batch: {a[3]}, Price: {a[4]}, Stock: {a[5]}")
else:
    print("  ❌ No batches with stock for Atlas")

conn.close()