-- Add website column to suppliers table
-- Extract from MASTER_DATABASE_FIXES.sql Section 12

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