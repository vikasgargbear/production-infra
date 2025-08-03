#!/usr/bin/env python3
"""
Check latest product and batches in database
"""
import psycopg2

DATABASE_URL = "postgresql://postgres:I5ejcC77brqe4EPY@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("🔍 Latest products:")
    cur.execute("""
        SELECT product_id, product_code, product_name, current_mrp, created_at
        FROM inventory.products 
        ORDER BY product_id DESC 
        LIMIT 3;
    """)
    
    for row in cur.fetchall():
        product_id, code, name, mrp, created = row
        print(f"  Product {product_id}: {code} | {name} | MRP: ₹{mrp} | Created: {created}")
    
    print(f"\n📊 Total batches in database:")
    cur.execute("SELECT COUNT(*) FROM inventory.batches;")
    total = cur.fetchone()[0]
    print(f"  Total batches: {total}")
    
    if total > 0:
        print(f"\n📋 All batches:")
        cur.execute("""
            SELECT 
                b.batch_id, b.batch_number, b.product_id, p.product_name,
                b.mrp_per_unit, b.source_type, b.created_at
            FROM inventory.batches b
            JOIN inventory.products p ON b.product_id = p.product_id
            ORDER BY b.created_at DESC;
        """)
        
        for batch in cur.fetchall():
            batch_id, batch_num, prod_id, prod_name, mrp, source_type, created = batch
            print(f"  Batch {batch_id}: {batch_num} | Product {prod_id} ({prod_name}) | MRP: ₹{mrp} | Source: {source_type} | Created: {created}")
    
    print(f"\n🔧 Trigger status:")
    cur.execute("""
        SELECT tgname, tgenabled 
        FROM pg_trigger 
        WHERE tgname = 'prevent_mrp_decrease';
    """)
    
    trigger = cur.fetchone()
    if trigger:
        tg_name, tg_enabled = trigger
        status = "ENABLED" if tg_enabled == 'O' else "DISABLED"
        print(f"  Trigger: {tg_name} ({status})")
    else:
        print(f"  Trigger: NOT FOUND")
        
except Exception as e:
    print(f"❌ Error: {e}")
    
finally:
    if 'conn' in locals():
        conn.close()