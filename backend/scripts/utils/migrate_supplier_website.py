#!/usr/bin/env python3
"""
Temporary migration script to add website column to suppliers table
Run this once on production database
"""
import os
import sys
from sqlalchemy import create_engine, text

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/pharma")

def run_migration():
    """Run the supplier website migration"""
    print("🔄 Running supplier website migration...")
    
    # Create database engine
    engine = create_engine(DATABASE_URL)
    
    migration_sql = """
    -- Add website column to suppliers table
    DO $$
    BEGIN
        -- Add website column if not exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'parties' 
            AND table_name = 'suppliers' 
            AND column_name = 'website'
        ) THEN
            ALTER TABLE parties.suppliers 
            ADD COLUMN website TEXT;
            
            RAISE NOTICE '✅ Added website column to suppliers table';
        ELSE
            RAISE NOTICE '✓ Website column already exists in suppliers table';
        END IF;
    END $$;
    
    -- Add comment to document the website column
    COMMENT ON COLUMN parties.suppliers.website IS 'Supplier website URL for reference and communication';
    """
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text(migration_sql))
            conn.commit()
            print("✅ Migration completed successfully!")
            return True
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)