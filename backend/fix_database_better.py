#!/usr/bin/env python3
"""
Better database fix - Add current_mrp to products table
This approach is cleaner: MRP is a product-level attribute
"""
import os
import psycopg2
from psycopg2 import sql
import sys

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    exit(1)

class BetterDatabaseFixer:
    def __init__(self):
        self.conn = psycopg2.connect(DATABASE_URL)
        self.cur = self.conn.cursor()
        self.changes_made = []
        
    def ask_permission(self, change_description):
        """Ask user permission before making a change"""
        print("\n" + "="*60)
        print(f"PROPOSED CHANGE: {change_description}")
        print("-"*60)
        
        while True:
            response = input("Apply this change? (y/n/quit): ").lower().strip()
            if response == 'y':
                return True
            elif response == 'n':
                print("Skipping...")
                return False
            elif response == 'quit':
                print("Exiting...")
                sys.exit(0)
    
    def step1_add_current_mrp_to_products(self):
        """Add current_mrp column to products table"""
        print("\n🔧 STEP 1: Add current_mrp to products table")
        print("This is better than adding it to batches - MRP is a product attribute")
        
        # Check if column exists
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'inventory' 
                AND table_name = 'products' 
                AND column_name = 'current_mrp'
            )
        """)
        
        if not self.cur.fetchone()[0]:
            if self.ask_permission("Add current_mrp column to inventory.products"):
                try:
                    # Add column
                    self.cur.execute("""
                        ALTER TABLE inventory.products 
                        ADD COLUMN current_mrp NUMERIC(10,2)
                    """)
                    
                    # Initialize with existing MRP values
                    self.cur.execute("""
                        UPDATE inventory.products 
                        SET current_mrp = COALESCE(mrp, 0)
                    """)
                    
                    # Make it NOT NULL with default
                    self.cur.execute("""
                        ALTER TABLE inventory.products 
                        ALTER COLUMN current_mrp SET NOT NULL,
                        ALTER COLUMN current_mrp SET DEFAULT 0
                    """)
                    
                    self.conn.commit()
                    print("✅ Added current_mrp to products table")
                    self.changes_made.append("Added current_mrp to products")
                    return True
                except Exception as e:
                    self.conn.rollback()
                    print(f"❌ Error: {e}")
                    return False
        else:
            print("✓ current_mrp column already exists in products")
            return True
    
    def step2_fix_prevent_mrp_trigger(self):
        """Update the trigger to use product's current_mrp"""
        print("\n🔧 STEP 2: Fix prevent_mrp_decrease trigger")
        print("The trigger will now check product's current_mrp instead of batch's")
        
        if self.ask_permission("Update prevent_mrp_decrease trigger to use product's current_mrp"):
            try:
                # Drop old trigger
                self.cur.execute("DROP TRIGGER IF EXISTS prevent_mrp_decrease ON inventory.batches")
                
                # Create improved function
                self.cur.execute("""
                    CREATE OR REPLACE FUNCTION prevent_mrp_decrease_func()
                    RETURNS TRIGGER AS $$
                    DECLARE
                        product_current_mrp NUMERIC;
                    BEGIN
                        -- Get the product's current MRP
                        SELECT current_mrp INTO product_current_mrp
                        FROM inventory.products
                        WHERE product_id = NEW.product_id;
                        
                        -- For INSERT: ensure batch MRP is not less than product's current MRP
                        IF TG_OP = 'INSERT' THEN
                            IF NEW.mrp_per_unit < product_current_mrp THEN
                                RAISE EXCEPTION 'Cannot create batch with MRP (%%) less than product current MRP (%%)', 
                                    NEW.mrp_per_unit, product_current_mrp;
                            END IF;
                            
                            -- Update product's current MRP if this batch has higher MRP
                            IF NEW.mrp_per_unit > product_current_mrp THEN
                                UPDATE inventory.products 
                                SET current_mrp = NEW.mrp_per_unit
                                WHERE product_id = NEW.product_id;
                            END IF;
                        END IF;
                        
                        -- For UPDATE: prevent decreasing below product's current MRP
                        IF TG_OP = 'UPDATE' THEN
                            IF NEW.mrp_per_unit < product_current_mrp THEN
                                RAISE EXCEPTION 'Cannot decrease batch MRP (%%) below product current MRP (%%)', 
                                    NEW.mrp_per_unit, product_current_mrp;
                            END IF;
                            
                            -- Update product MRP if batch MRP increased
                            IF NEW.mrp_per_unit > product_current_mrp THEN
                                UPDATE inventory.products 
                                SET current_mrp = NEW.mrp_per_unit
                                WHERE product_id = NEW.product_id;
                            END IF;
                        END IF;
                        
                        RETURN NEW;
                    END;
                    $$ LANGUAGE plpgsql
                """)
                
                # Create new trigger
                self.cur.execute("""
                    CREATE TRIGGER prevent_mrp_decrease
                        BEFORE INSERT OR UPDATE ON inventory.batches
                        FOR EACH ROW
                        EXECUTE FUNCTION prevent_mrp_decrease_func()
                """)
                
                self.conn.commit()
                print("✅ Updated trigger to use product's current_mrp")
                self.changes_made.append("Fixed prevent_mrp_decrease trigger")
                return True
            except Exception as e:
                self.conn.rollback()
                print(f"❌ Error: {e}")
                return False
        return False
    
    def step3_create_dashboard_cache(self):
        """Create analytics.dashboard_cache table"""
        print("\n🔧 STEP 3: Create analytics.dashboard_cache table")
        print("This table is needed for the invoice trigger to work")
        
        # Check if schema exists
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.schemata 
                WHERE schema_name = 'analytics'
            )
        """)
        
        if not self.cur.fetchone()[0]:
            if self.ask_permission("Create analytics schema"):
                try:
                    self.cur.execute("CREATE SCHEMA analytics")
                    self.conn.commit()
                    print("✅ Created analytics schema")
                except Exception as e:
                    self.conn.rollback()
                    print(f"❌ Error: {e}")
        
        # Check if table exists
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'analytics' 
                AND table_name = 'dashboard_cache'
            )
        """)
        
        if not self.cur.fetchone()[0]:
            if self.ask_permission("Create analytics.dashboard_cache table for invoice trigger"):
                try:
                    self.cur.execute("""
                        CREATE TABLE analytics.dashboard_cache (
                            cache_id SERIAL PRIMARY KEY,
                            org_id UUID,
                            metric_type VARCHAR(50),
                            metric_name VARCHAR(100),
                            metric_value NUMERIC,
                            metric_date DATE,
                            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    
                    # Create indexes
                    self.cur.execute("CREATE INDEX idx_dashboard_cache_org_id ON analytics.dashboard_cache(org_id)")
                    self.cur.execute("CREATE INDEX idx_dashboard_cache_metric_type ON analytics.dashboard_cache(metric_type)")
                    
                    # Add unique constraint
                    self.cur.execute("""
                        ALTER TABLE analytics.dashboard_cache 
                        ADD CONSTRAINT unique_dashboard_metric 
                        UNIQUE (org_id, metric_type, metric_name, metric_date)
                    """)
                    
                    # Create function
                    self.cur.execute("""
                        CREATE OR REPLACE FUNCTION refresh_dashboard_cache()
                        RETURNS TRIGGER AS $$
                        BEGIN
                            INSERT INTO analytics.dashboard_cache (
                                org_id, metric_type, metric_name, 
                                metric_value, metric_date, last_updated
                            ) VALUES (
                                NEW.org_id, 'sales', 'daily_revenue',
                                NEW.final_amount, NEW.invoice_date::date, NOW()
                            )
                            ON CONFLICT (org_id, metric_type, metric_name, metric_date) 
                            DO UPDATE SET 
                                metric_value = analytics.dashboard_cache.metric_value + EXCLUDED.metric_value,
                                last_updated = NOW();
                            
                            RETURN NEW;
                        END;
                        $$ LANGUAGE plpgsql
                    """)
                    
                    self.conn.commit()
                    print("✅ Created dashboard_cache table and function")
                    self.changes_made.append("Created analytics.dashboard_cache")
                    return True
                except Exception as e:
                    self.conn.rollback()
                    print(f"❌ Error: {e}")
                    return False
        else:
            print("✓ analytics.dashboard_cache already exists")
            return True
    
    def step4_add_is_active_column(self):
        """Add is_active column to batches"""
        print("\n🔧 STEP 4: Add is_active column to batches")
        print("This column is used in many queries to filter active batches")
        
        # Check if column exists
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'inventory' 
                AND table_name = 'batches' 
                AND column_name = 'is_active'
            )
        """)
        
        if not self.cur.fetchone()[0]:
            if self.ask_permission("Add is_active column to inventory.batches"):
                try:
                    self.cur.execute("""
                        ALTER TABLE inventory.batches 
                        ADD COLUMN is_active BOOLEAN DEFAULT true
                    """)
                    
                    self.cur.execute("""
                        UPDATE inventory.batches 
                        SET is_active = true 
                        WHERE is_active IS NULL
                    """)
                    
                    self.conn.commit()
                    print("✅ Added is_active column")
                    self.changes_made.append("Added is_active to batches")
                    return True
                except Exception as e:
                    self.conn.rollback()
                    print(f"❌ Error: {e}")
                    return False
        else:
            print("✓ is_active column already exists")
            return True
    
    def test_everything(self):
        """Test that batch and invoice creation work"""
        print("\n🧪 TESTING")
        print("-"*60)
        
        # Test batch creation
        if self.ask_permission("Test batch creation"):
            try:
                # First ensure we have a product with current_mrp
                self.cur.execute("""
                    UPDATE inventory.products 
                    SET current_mrp = COALESCE(current_mrp, mrp, 100)
                    WHERE product_id = 1
                """)
                
                self.cur.execute("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        initial_quantity, quantity_available,
                        cost_per_unit, sale_price_per_unit, mrp_per_unit,
                        is_active, created_at, updated_at
                    ) VALUES (
                        'ad808530-1ddb-4377-ab20-67bef145d80d',
                        1, 'TEST_FINAL',
                        CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
                        100, 100, 60, 80, 100,
                        true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    ) RETURNING batch_id
                """)
                
                batch_id = self.cur.fetchone()[0]
                self.cur.execute("DELETE FROM inventory.batches WHERE batch_id = %s", (batch_id,))
                self.conn.commit()
                print("✅ Batch creation works!")
            except Exception as e:
                self.conn.rollback()
                print(f"❌ Batch creation failed: {e}")
        
        # Test invoice creation
        if self.ask_permission("Test invoice creation"):
            try:
                self.cur.execute("""
                    INSERT INTO sales.invoices (
                        org_id, invoice_number, invoice_date,
                        customer_id, customer_name,
                        subtotal_amount, total_tax_amount, final_amount,
                        invoice_status, payment_status,
                        created_at, updated_at
                    ) VALUES (
                        'ad808530-1ddb-4377-ab20-67bef145d80d',
                        'TEST_FINAL', CURRENT_DATE,
                        1, 'Test', 100, 12, 112,
                        'posted', 'unpaid',
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    ) RETURNING invoice_id
                """)
                
                invoice_id = self.cur.fetchone()[0]
                self.cur.execute("DELETE FROM sales.invoices WHERE invoice_id = %s", (invoice_id,))
                self.conn.commit()
                print("✅ Invoice creation works!")
            except Exception as e:
                self.conn.rollback()
                print(f"❌ Invoice creation failed: {e}")
    
    def run(self):
        """Run all fixes"""
        print("\n" + "="*60)
        print("BETTER DATABASE FIX - Product-level current_mrp")
        print("="*60)
        
        # Run steps
        self.step1_add_current_mrp_to_products()
        self.step2_fix_prevent_mrp_trigger()
        self.step3_create_dashboard_cache()
        self.step4_add_is_active_column()
        
        # Test
        self.test_everything()
        
        # Summary
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        
        if self.changes_made:
            print("✅ Changes applied:")
            for change in self.changes_made:
                print(f"   - {change}")
        else:
            print("ℹ️ No changes were made")
        
        print("\n🎉 Done! Your database should now be working properly.")
        print("The MRP trigger now correctly checks the product's current_mrp.")

if __name__ == "__main__":
    fixer = BetterDatabaseFixer()
    fixer.run()