#!/usr/bin/env python3
"""
Minimal database fixes - Add missing columns to make triggers work
This script asks for permission before each change
"""
import os
import psycopg2
from psycopg2 import sql
import sys

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL environment variable not set")
    print("Please set it to your Supabase/PostgreSQL connection string")
    exit(1)

class DatabaseFixer:
    def __init__(self):
        self.conn = psycopg2.connect(DATABASE_URL)
        self.cur = self.conn.cursor()
        self.changes_made = []
        
    def __del__(self):
        if hasattr(self, 'cur'):
            self.cur.close()
        if hasattr(self, 'conn'):
            self.conn.close()
    
    def ask_permission(self, change_description, sql_preview):
        """Ask user permission before making a change"""
        print("\n" + "="*60)
        print(f"PROPOSED CHANGE: {change_description}")
        print("-"*60)
        print("SQL to execute:")
        print(sql_preview)
        print("-"*60)
        
        while True:
            response = input("Apply this change? (y/n/quit): ").lower().strip()
            if response == 'y':
                return True
            elif response == 'n':
                print("Skipping this change...")
                return False
            elif response == 'quit':
                print("Exiting...")
                sys.exit(0)
            else:
                print("Please enter 'y' for yes, 'n' for no, or 'quit' to exit")
    
    def check_column_exists(self, schema, table, column):
        """Check if a column exists in a table"""
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_schema = %s 
                AND table_name = %s 
                AND column_name = %s
            )
        """, (schema, table, column))
        return self.cur.fetchone()[0]
    
    def check_table_exists(self, schema, table):
        """Check if a table exists"""
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 
                FROM information_schema.tables 
                WHERE table_schema = %s 
                AND table_name = %s
            )
        """, (schema, table))
        return self.cur.fetchone()[0]
    
    def check_trigger_exists(self, trigger_name, table_name):
        """Check if a trigger exists"""
        self.cur.execute("""
            SELECT EXISTS (
                SELECT 1 
                FROM pg_trigger 
                WHERE tgname = %s
                AND tgrelid = %s::regclass
            )
        """, (trigger_name, table_name))
        return self.cur.fetchone()[0]
    
    def fix_batch_trigger_columns(self):
        """Fix missing columns for prevent_mrp_decrease trigger"""
        print("\n" + "🔧 CHECKING BATCH TRIGGER REQUIREMENTS " + "="*30)
        
        # Check if trigger exists
        if self.check_trigger_exists('prevent_mrp_decrease', 'inventory.batches'):
            print("✓ Trigger 'prevent_mrp_decrease' exists on inventory.batches")
            
            # Check what the trigger is looking for
            self.cur.execute("""
                SELECT pg_get_triggerdef(oid) 
                FROM pg_trigger 
                WHERE tgname = 'prevent_mrp_decrease'
            """)
            trigger_def = self.cur.fetchone()[0]
            print(f"Current trigger definition: {trigger_def[:100]}...")
            
            # Check if current_mrp column exists
            if not self.check_column_exists('inventory', 'batches', 'current_mrp'):
                print("✗ Column 'current_mrp' is missing")
                
                sql_change = """
-- Add current_mrp column to inventory.batches
-- This column will track the current MRP to prevent decreases
ALTER TABLE inventory.batches 
ADD COLUMN current_mrp NUMERIC(10,2);

-- Initialize it with mrp_per_unit values
UPDATE inventory.batches 
SET current_mrp = COALESCE(mrp_per_unit, 0)
WHERE current_mrp IS NULL;

-- Add NOT NULL constraint after populating
ALTER TABLE inventory.batches 
ALTER COLUMN current_mrp SET NOT NULL;

-- Add default value for future inserts
ALTER TABLE inventory.batches 
ALTER COLUMN current_mrp SET DEFAULT 0;
"""
                
                if self.ask_permission(
                    "Add 'current_mrp' column to make prevent_mrp_decrease trigger work",
                    sql_change
                ):
                    try:
                        for statement in sql_change.split(';'):
                            if statement.strip():
                                self.cur.execute(statement)
                        self.conn.commit()
                        print("✅ Added current_mrp column successfully")
                        self.changes_made.append("Added current_mrp column to inventory.batches")
                    except Exception as e:
                        self.conn.rollback()
                        print(f"❌ Error adding column: {e}")
            else:
                print("✓ Column 'current_mrp' already exists")
        else:
            print("ℹ️  Trigger 'prevent_mrp_decrease' does not exist")
    
    def fix_invoice_trigger_table(self):
        """Fix missing table for refresh_dashboard_cache trigger"""
        print("\n" + "🔧 CHECKING INVOICE TRIGGER REQUIREMENTS " + "="*30)
        
        # Check if trigger exists
        if self.check_trigger_exists('refresh_dashboard_cache', 'sales.invoices'):
            print("✓ Trigger 'refresh_dashboard_cache' exists on sales.invoices")
            
            # Check if analytics schema exists
            self.cur.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.schemata 
                    WHERE schema_name = 'analytics'
                )
            """)
            schema_exists = self.cur.fetchone()[0]
            
            if not schema_exists:
                sql_change = "CREATE SCHEMA IF NOT EXISTS analytics;"
                if self.ask_permission("Create 'analytics' schema", sql_change):
                    try:
                        self.cur.execute(sql_change)
                        self.conn.commit()
                        print("✅ Created analytics schema")
                        self.changes_made.append("Created analytics schema")
                    except Exception as e:
                        self.conn.rollback()
                        print(f"❌ Error creating schema: {e}")
            
            # Check if dashboard_cache table exists
            if not self.check_table_exists('analytics', 'dashboard_cache'):
                print("✗ Table 'analytics.dashboard_cache' is missing")
                
                sql_change = """
-- Create the dashboard_cache table that the trigger expects
CREATE TABLE analytics.dashboard_cache (
    cache_id SERIAL PRIMARY KEY,
    org_id UUID,
    metric_type VARCHAR(50),
    metric_name VARCHAR(100),
    metric_value NUMERIC,
    metric_date DATE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_dashboard_cache_org_id ON analytics.dashboard_cache(org_id);
CREATE INDEX idx_dashboard_cache_metric_type ON analytics.dashboard_cache(metric_type);
CREATE INDEX idx_dashboard_cache_metric_date ON analytics.dashboard_cache(metric_date);

-- Create the function that the trigger calls (if it doesn't exist)
CREATE OR REPLACE FUNCTION refresh_dashboard_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert sales metrics when invoice is created/updated
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
$$ LANGUAGE plpgsql;

-- Add unique constraint for upsert to work
ALTER TABLE analytics.dashboard_cache 
ADD CONSTRAINT unique_dashboard_metric 
UNIQUE (org_id, metric_type, metric_name, metric_date);
"""
                
                if self.ask_permission(
                    "Create 'analytics.dashboard_cache' table to make invoice trigger work",
                    sql_change
                ):
                    try:
                        for statement in sql_change.split('-- '):
                            if statement.strip() and not statement.startswith('Create'):
                                self.cur.execute(statement)
                        self.conn.commit()
                        print("✅ Created dashboard_cache table successfully")
                        self.changes_made.append("Created analytics.dashboard_cache table")
                    except Exception as e:
                        self.conn.rollback()
                        print(f"❌ Error creating table: {e}")
            else:
                print("✓ Table 'analytics.dashboard_cache' already exists")
        else:
            print("ℹ️  Trigger 'refresh_dashboard_cache' does not exist")
    
    def fix_batch_is_active_column(self):
        """Add is_active column to batches if missing"""
        print("\n" + "🔧 CHECKING BATCH TABLE COLUMNS " + "="*30)
        
        if not self.check_column_exists('inventory', 'batches', 'is_active'):
            print("✗ Column 'is_active' is missing from inventory.batches")
            
            sql_change = """
-- Add is_active column to track active/inactive batches
ALTER TABLE inventory.batches 
ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Set all existing batches as active
UPDATE inventory.batches 
SET is_active = true 
WHERE is_active IS NULL;
"""
            
            if self.ask_permission(
                "Add 'is_active' column to inventory.batches (used in many queries)",
                sql_change
            ):
                try:
                    for statement in sql_change.split(';'):
                        if statement.strip():
                            self.cur.execute(statement)
                    self.conn.commit()
                    print("✅ Added is_active column successfully")
                    self.changes_made.append("Added is_active column to inventory.batches")
                except Exception as e:
                    self.conn.rollback()
                    print(f"❌ Error adding column: {e}")
        else:
            print("✓ Column 'is_active' already exists")
    
    def test_batch_creation(self):
        """Test if batch creation works after fixes"""
        print("\n" + "🧪 TESTING BATCH CREATION " + "="*30)
        
        sql_test = """
INSERT INTO inventory.batches (
    org_id, product_id, batch_number,
    manufacturing_date, expiry_date,
    initial_quantity, quantity_available,
    cost_per_unit, sale_price_per_unit, mrp_per_unit,
    current_mrp, is_active,
    created_at, updated_at
) VALUES (
    'ad808530-1ddb-4377-ab20-67bef145d80d',
    1, 'TEST_BATCH_CREATION',
    CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
    100, 100,
    60, 80, 100,
    100, true,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) RETURNING batch_id;
"""
        
        if self.ask_permission("Test batch creation with all fixes", sql_test):
            try:
                self.cur.execute(sql_test)
                batch_id = self.cur.fetchone()[0]
                print(f"✅ Batch creation successful! (ID: {batch_id})")
                
                # Clean up test
                self.cur.execute("DELETE FROM inventory.batches WHERE batch_number = 'TEST_BATCH_CREATION'")
                self.conn.commit()
                print("✅ Test batch cleaned up")
                return True
            except Exception as e:
                self.conn.rollback()
                print(f"❌ Batch creation failed: {e}")
                return False
        return False
    
    def test_invoice_creation(self):
        """Test if invoice creation works after fixes"""
        print("\n" + "🧪 TESTING INVOICE CREATION " + "="*30)
        
        sql_test = """
INSERT INTO sales.invoices (
    org_id, invoice_number, invoice_date,
    customer_id, customer_name,
    subtotal_amount, total_tax_amount, final_amount,
    invoice_status, payment_status,
    created_at, updated_at
) VALUES (
    'ad808530-1ddb-4377-ab20-67bef145d80d',
    'TEST_INV_001', CURRENT_DATE,
    1, 'Test Customer',
    100, 12, 112,
    'posted', 'unpaid',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) RETURNING invoice_id;
"""
        
        if self.ask_permission("Test invoice creation with all fixes", sql_test):
            try:
                self.cur.execute(sql_test)
                invoice_id = self.cur.fetchone()[0]
                print(f"✅ Invoice creation successful! (ID: {invoice_id})")
                
                # Clean up test
                self.cur.execute("DELETE FROM sales.invoices WHERE invoice_number = 'TEST_INV_001'")
                self.conn.commit()
                print("✅ Test invoice cleaned up")
                return True
            except Exception as e:
                self.conn.rollback()
                print(f"❌ Invoice creation failed: {e}")
                return False
        return False
    
    def run_fixes(self):
        """Run all fixes in sequence"""
        print("\n" + "="*60)
        print("DATABASE MINIMAL FIX SCRIPT")
        print("This script will add missing columns/tables to make triggers work")
        print("You will be asked for permission before each change")
        print("="*60)
        
        try:
            # Fix batch-related issues
            self.fix_batch_trigger_columns()
            self.fix_batch_is_active_column()
            
            # Fix invoice-related issues
            self.fix_invoice_trigger_table()
            
            # Test the fixes
            print("\n" + "="*60)
            print("TESTING FIXES")
            print("="*60)
            
            batch_works = self.test_batch_creation()
            invoice_works = self.test_invoice_creation()
            
            # Summary
            print("\n" + "="*60)
            print("SUMMARY")
            print("="*60)
            
            if self.changes_made:
                print("✅ Changes applied:")
                for change in self.changes_made:
                    print(f"   - {change}")
            else:
                print("ℹ️  No changes were made")
            
            print("\nTest Results:")
            print(f"   - Batch creation: {'✅ Working' if batch_works else '❌ Not working'}")
            print(f"   - Invoice creation: {'✅ Working' if invoice_works else '❌ Not working'}")
            
            if batch_works and invoice_works:
                print("\n🎉 SUCCESS! All core functionality should now work!")
            else:
                print("\n⚠️  Some issues remain. Please check the error messages above.")
            
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
            self.conn.rollback()

if __name__ == "__main__":
    fixer = DatabaseFixer()
    fixer.run_fixes()