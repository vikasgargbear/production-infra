#!/usr/bin/env python3
"""
Debug batch creation step by step
"""
import psycopg2
import requests
import json

DATABASE_URL = "postgresql://postgres:I5ejcC77brqe4EPY@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"
API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

def debug_batch_creation():
    print("🔍 DEBUGGING BATCH CREATION")
    print("="*60)
    
    # Step 1: Check current database state
    print("\n📊 STEP 1: Check Database State")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Check trigger status
        cur.execute("""
            SELECT tgname, tgenabled 
            FROM pg_trigger 
            WHERE tgname = 'prevent_mrp_decrease';
        """)
        trigger = cur.fetchone()
        if trigger:
            status = "ENABLED" if trigger[1] == 'O' else "DISABLED"
            print(f"  Trigger: {trigger[0]} ({status})")
        else:
            print(f"  Trigger: NOT FOUND")
        
        # Check current_mrp column
        cur.execute("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_schema = 'inventory' 
            AND table_name = 'products'
            AND column_name = 'current_mrp';
        """)
        if cur.fetchone():
            print(f"  current_mrp column: EXISTS")
        else:
            print(f"  current_mrp column: MISSING")
        
        # Check batch count
        cur.execute("SELECT COUNT(*) FROM inventory.batches;")
        batch_count = cur.fetchone()[0]
        print(f"  Total batches: {batch_count}")
        
        conn.close()
        
    except Exception as e:
        print(f"  ❌ Database check failed: {e}")
        return False
    
    # Step 2: Enable trigger manually
    print("\n🔧 STEP 2: Enable Trigger")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        cur.execute("ALTER TABLE inventory.batches ENABLE TRIGGER prevent_mrp_decrease;")
        conn.commit()
        print(f"  ✅ Trigger enabled")
        
        conn.close()
        
    except Exception as e:
        print(f"  ❌ Failed to enable trigger: {e}")
        return False
    
    # Step 3: Test manual batch creation
    print("\n🧪 STEP 3: Test Manual Batch Creation")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Set current_mrp for a test product (use product 11 if it exists)
        cur.execute("SELECT product_id FROM inventory.products WHERE product_id = 11;")
        if cur.fetchone():
            print(f"  Using product 11 for test")
            
            # Set current_mrp
            cur.execute("""
                UPDATE inventory.products 
                SET current_mrp = 100 
                WHERE product_id = 11;
            """)
            
            # Try to create a batch
            cur.execute("""
                INSERT INTO inventory.batches (
                    org_id, product_id, batch_number,
                    manufacturing_date, expiry_date,
                    initial_quantity, quantity_available,
                    cost_per_unit, sale_price_per_unit, mrp_per_unit,
                    source_type, created_at, updated_at
                ) VALUES (
                    'ad808530-1ddb-4377-ab20-67bef145d80d',
                    11, 'DEBUG_BATCH_001',
                    CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
                    100, 100, 60, 80, 120,
                    'manual_test', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                ) RETURNING batch_id;
            """)
            
            batch_id = cur.fetchone()[0]
            conn.commit()
            print(f"  ✅ Manual batch created: ID {batch_id}")
            
            # Check if current_mrp was updated by trigger
            cur.execute("SELECT current_mrp FROM inventory.products WHERE product_id = 11;")
            updated_mrp = cur.fetchone()[0]
            print(f"  Product current_mrp after batch: ₹{updated_mrp}")
            
        else:
            print(f"  ❌ No product 11 found to test with")
            return False
        
        conn.close()
        
    except Exception as e:
        print(f"  ❌ Manual batch creation failed: {e}")
        return False
    
    # Step 4: Test API product creation
    print("\n🌐 STEP 4: Test API Product Creation")
    try:
        product_data = {
            "product_name": f"Debug Test Product API",
            "manufacturer": "Debug Pharma",
            "product_type": "Medicine",
            "hsn_code": "3004",
            "mrp": 200.0,
            "sale_price": 160.0,
            "maintain_batch": True,
            "maintain_expiry": True
        }
        
        response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
        print(f"  API Response: {response.status_code}")
        print(f"  Response: {response.text}")
        
        if response.status_code == 201:
            product = response.json()
            product_id = product['product_id']
            print(f"  ✅ Product created via API: ID {product_id}")
            
            # Check if batch was created
            conn = psycopg2.connect(DATABASE_URL)
            cur = conn.cursor()
            
            cur.execute("SELECT COUNT(*) FROM inventory.batches WHERE product_id = %s;", (product_id,))
            batch_count = cur.fetchone()[0]
            print(f"  Batches created for product {product_id}: {batch_count}")
            
            cur.execute("SELECT current_mrp FROM inventory.products WHERE product_id = %s;", (product_id,))
            current_mrp = cur.fetchone()[0]
            print(f"  Product current_mrp: ₹{current_mrp}")
            
            conn.close()
            
            if batch_count > 0:
                print(f"  ✅ API batch creation WORKS!")
                return True
            else:
                print(f"  ❌ API batch creation FAILED")
                return False
        else:
            print(f"  ❌ API product creation failed")
            return False
        
    except Exception as e:
        print(f"  ❌ API test failed: {e}")
        return False

if __name__ == "__main__":
    success = debug_batch_creation()
    if success:
        print(f"\n🎉 BATCH CREATION DEBUGGING SUCCESSFUL!")
    else:
        print(f"\n❌ BATCH CREATION DEBUGGING FAILED")