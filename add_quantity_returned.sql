-- Add quantity_returned column to inventory.batches if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches'
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        RAISE NOTICE '✅ Added quantity_returned column to inventory.batches';
    ELSE
        RAISE NOTICE '⏭️ Column quantity_returned already exists in inventory.batches';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'inventory' 
AND table_name = 'batches'
AND column_name IN ('quantity_returned', 'quantity_quarantine', 'quantity_available')
ORDER BY column_name;