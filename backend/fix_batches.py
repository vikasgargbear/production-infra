#!/usr/bin/env python3
"""
Fix batch creation issues
"""
import psycopg2

DATABASE_URL = "postgresql://postgres:I5ejcC77brqe4EPY@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"

print("\n🔧 BATCH CREATION FIX")
print("="*50)

try:
    print("🔄 Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print("✅ Connected successfully!")
    
    # First check products table structure
    print("🔍 Checking products table structure...")
    cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'products'
        ORDER BY ordinal_position;
    """)
    columns = cur.fetchall()
    print("📋 Products table columns:")
    for col in columns:
        print(f"   - {col[0]} ({col[1]})")
    
    # Read and execute the batch fix
    print("📄 Reading batch fix SQL...")
    with open('../database/fix_batch_creation.sql', 'r') as f:
        sql_content = f.read()
    
    print("🔧 Applying batch creation fixes...")
    cur.execute(sql_content)
    conn.commit()
    
    print("✅ Batch creation fixes applied successfully!")
    print("🎉 Real batches should now be created when adding products!")
    
except Exception as e:
    print(f"❌ Error: {str(e)[:200]}")
    
finally:
    if 'conn' in locals():
        conn.close()