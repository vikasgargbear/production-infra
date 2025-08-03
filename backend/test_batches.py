#!/usr/bin/env python3
"""
Test batch data in database
"""
import psycopg2

DATABASE_URL = "postgresql://postgres:I5ejcC77brqe4EPY@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"

print("\n🔍 CHECKING BATCH DATA")
print("="*50)

try:
    print("🔄 Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("✅ Connected successfully!")
    
    # Check how many products exist
    print("\n📦 Checking products...")
    cur.execute("SELECT COUNT(*) FROM inventory.products;")
    product_count = cur.fetchone()[0]
    print(f"Total products: {product_count}")
    
    # Check how many batches exist
    print("\n📋 Checking batches...")
    cur.execute("SELECT COUNT(*) FROM inventory.batches;")
    batch_count = cur.fetchone()[0]
    print(f"Total batches: {batch_count}")
    
    # Check batches for specific products
    print("\n🔍 Checking batches per product...")
    cur.execute("""
        SELECT 
            p.product_id,
            p.product_name,
            COUNT(b.batch_id) as batch_count,
            STRING_AGG(b.batch_number, ', ') as batch_numbers
        FROM inventory.products p
        LEFT JOIN inventory.batches b ON p.product_id = b.product_id
        WHERE p.product_id IN (1, 2, 3, 4, 5)
        GROUP BY p.product_id, p.product_name
        ORDER BY p.product_id;
    """)
    
    results = cur.fetchall()
    for row in results:
        product_id, product_name, batch_count, batch_numbers = row
        print(f"Product {product_id} ({product_name}): {batch_count} batches")
        if batch_numbers:
            print(f"  Batches: {batch_numbers}")
    
    # Try to create a test batch for product 1 if no batches exist
    print("\n🧪 Testing batch creation for product 1...")
    cur.execute("SELECT product_id, product_name FROM inventory.products WHERE product_id = 1;")
    product = cur.fetchone()
    
    if product:
        product_id, product_name = product
        print(f"Found product: {product_name}")
        
        # Check if batch already exists
        cur.execute("SELECT COUNT(*) FROM inventory.batches WHERE product_id = %s;", (product_id,))
        existing_batches = cur.fetchone()[0]
        
        if existing_batches == 0:
            print("No batches found, creating test batch...")
            
            try:
                cur.execute("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        initial_quantity, quantity_available,
                        cost_per_unit, sale_price_per_unit, mrp_per_unit,
                        created_at, updated_at
                    ) VALUES (
                        'ad808530-1ddb-4377-ab20-67bef145d80d',
                        %s, 'TEST_BATCH_001',
                        CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
                        100, 100, 60, 80, 100,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    ) RETURNING batch_id;
                """, (product_id,))
                
                batch_id = cur.fetchone()[0]
                conn.commit()
                print(f"✅ Created test batch {batch_id} for product {product_id}")
                
            except Exception as e:
                print(f"❌ Failed to create batch: {e}")
                conn.rollback()
        else:
            print(f"Product already has {existing_batches} batch(es)")
    
    print("\n✅ Batch check completed!")
    
except Exception as e:
    print(f"❌ Error: {str(e)[:200]}")
    
finally:
    if 'conn' in locals():
        conn.close()