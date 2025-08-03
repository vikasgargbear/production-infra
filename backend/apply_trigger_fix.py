#!/usr/bin/env python3
"""
Apply database trigger fixes
Run this with your database admin credentials
"""
import os
import psycopg2
from psycopg2 import sql

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    print("Please set it to your Supabase/PostgreSQL connection string")
    exit(1)

def apply_fixes():
    """Apply the trigger fixes to the database"""
    
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    try:
        print("Starting database fixes...")
        
        # 1. Fix prevent_mrp_decrease trigger
        print("\n1. Fixing prevent_mrp_decrease trigger...")
        
        # Drop existing trigger
        cur.execute("DROP TRIGGER IF EXISTS prevent_mrp_decrease ON inventory.batches")
        print("   - Dropped old trigger")
        
        # Create new function
        cur.execute("""
            CREATE OR REPLACE FUNCTION prevent_mrp_decrease_func()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Only check on UPDATE, not on INSERT
                IF TG_OP = 'UPDATE' THEN
                    -- Check if MRP is being decreased
                    IF NEW.mrp_per_unit < OLD.mrp_per_unit THEN
                        RAISE EXCEPTION 'Cannot decrease MRP. Current MRP: %%, Attempted MRP: %%', 
                            OLD.mrp_per_unit, NEW.mrp_per_unit;
                    END IF;
                END IF;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
        """)
        print("   - Created new trigger function")
        
        # Create trigger only for UPDATE
        cur.execute("""
            CREATE TRIGGER prevent_mrp_decrease
                BEFORE UPDATE ON inventory.batches
                FOR EACH ROW
                EXECUTE FUNCTION prevent_mrp_decrease_func()
        """)
        print("   - Created new trigger (UPDATE only)")
        
        # 2. Remove problematic invoice trigger
        print("\n2. Removing refresh_dashboard_cache trigger...")
        cur.execute("DROP TRIGGER IF EXISTS refresh_dashboard_cache ON sales.invoices")
        print("   - Removed trigger")
        
        # 3. Add is_active column if missing
        print("\n3. Adding is_active column to batches...")
        cur.execute("""
            ALTER TABLE inventory.batches 
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
        """)
        cur.execute("""
            UPDATE inventory.batches 
            SET is_active = true 
            WHERE is_active IS NULL
        """)
        print("   - Added is_active column")
        
        # 4. Test batch creation
        print("\n4. Testing batch creation...")
        cur.execute("""
            INSERT INTO inventory.batches (
                org_id, product_id, batch_number,
                manufacturing_date, expiry_date,
                initial_quantity, quantity_available,
                cost_per_unit, sale_price_per_unit, mrp_per_unit,
                is_active, created_at, updated_at
            ) VALUES (
                %s, %s, %s,
                CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
                100, 100, 60, 80, 100,
                true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING batch_id
        """, ('ad808530-1ddb-4377-ab20-67bef145d80d', 1, 'TEST_FIX'))
        
        batch_id = cur.fetchone()[0]
        print(f"   - Successfully created test batch (ID: {batch_id})")
        
        # Clean up test
        cur.execute("DELETE FROM inventory.batches WHERE batch_number = 'TEST_FIX'")
        print("   - Cleaned up test batch")
        
        # Commit all changes
        conn.commit()
        print("\n✅ All fixes applied successfully!")
        print("Batch creation should now work properly.")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error applying fixes: {e}")
        print("\nYou may need to run the SQL script manually with admin privileges")
        return False
    
    finally:
        cur.close()
        conn.close()
    
    return True

if __name__ == "__main__":
    print("Database Trigger Fix Script")
    print("=" * 40)
    
    if apply_fixes():
        print("\n🎉 Success! Your database triggers are now fixed.")
        print("Batch creation and invoice creation should work properly.")
    else:
        print("\n⚠️  Some fixes could not be applied automatically.")
        print("Please run fix_database_triggers.sql manually in your database admin tool.")