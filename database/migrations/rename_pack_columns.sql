-- Migration: Rename pack configuration columns for clarity
-- Date: 2025-08-23
-- Purpose: Rename strips_per_box to packages_per_box for generic pack support

-- Step 1: Rename the column in batches table
ALTER TABLE inventory.batches 
RENAME COLUMN strips_per_box TO packages_per_box;

-- Step 2: Add comment to clarify the column purpose
COMMENT ON COLUMN inventory.batches.packages_per_box IS 'Number of packages (strips/bottles/vials/boxes) per box';
COMMENT ON COLUMN inventory.batches.units_per_pack IS 'Number of units (tablets/capsules/ml) per package';
COMMENT ON COLUMN inventory.batches.tablets_per_strip IS 'DEPRECATED: Use units_per_pack instead. Kept for backward compatibility';

-- Step 3: Update any views that reference the old column name
-- Check if any views need updating
DO $$
BEGIN
    -- Update inventory_summary view if it exists
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'inventory' AND table_name = 'inventory_summary') THEN
        -- Views will need to be recreated with new column names
        RAISE NOTICE 'View inventory_summary exists and may need updating';
    END IF;
END $$;

-- Step 4: Grant permissions (if needed)
-- Permissions should be inherited from table

-- Note: After running this migration, update the application code to use packages_per_box instead of strips_per_box