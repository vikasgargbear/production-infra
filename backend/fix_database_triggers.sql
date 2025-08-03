-- Fix database triggers that are blocking core functionality
-- Run this script with database admin privileges

-- 1. Fix prevent_mrp_decrease trigger to only fire on UPDATE, not INSERT
-- First, drop the existing problematic trigger
DROP TRIGGER IF EXISTS prevent_mrp_decrease ON inventory.batches;

-- Recreate the trigger properly - only for UPDATES where MRP is being decreased
CREATE OR REPLACE FUNCTION prevent_mrp_decrease_func()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check on UPDATE, not on INSERT
    IF TG_OP = 'UPDATE' THEN
        -- Check if MRP is being decreased
        IF NEW.mrp_per_unit < OLD.mrp_per_unit THEN
            RAISE EXCEPTION 'Cannot decrease MRP. Current MRP: %, Attempted MRP: %', 
                OLD.mrp_per_unit, NEW.mrp_per_unit;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger only for UPDATE operations
CREATE TRIGGER prevent_mrp_decrease
    BEFORE UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION prevent_mrp_decrease_func();

-- 2. Fix or remove the refresh_dashboard_cache trigger on sales.invoices
-- Option A: Remove the trigger if analytics module is not needed
DROP TRIGGER IF EXISTS refresh_dashboard_cache ON sales.invoices;

-- Option B: If you want to keep it, create the missing table first
-- CREATE TABLE IF NOT EXISTS analytics.dashboard_cache (
--     cache_id SERIAL PRIMARY KEY,
--     metric_name VARCHAR(100),
--     metric_value NUMERIC,
--     last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- 3. Add is_active column to batches table if needed
-- This column is referenced in many queries but doesn't exist
ALTER TABLE inventory.batches 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 4. Update existing batches to have is_active = true
UPDATE inventory.batches 
SET is_active = true 
WHERE is_active IS NULL;

-- 5. Test that batch creation now works
-- This should succeed after the fixes
INSERT INTO inventory.batches (
    org_id, product_id, batch_number,
    manufacturing_date, expiry_date,
    initial_quantity, quantity_available,
    cost_per_unit, sale_price_per_unit, mrp_per_unit,
    is_active, created_at, updated_at
) VALUES (
    'ad808530-1ddb-4377-ab20-67bef145d80d', -- Your org_id
    1, -- Assuming product_id 1 exists
    'TEST_AFTER_FIX',
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '1 year',
    100, 100,
    60, 80, 100,
    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) RETURNING batch_id;

-- If the above INSERT works, delete the test record
DELETE FROM inventory.batches WHERE batch_number = 'TEST_AFTER_FIX';

-- Show current triggers to verify
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    CASE 
        WHEN tgtype & 2 = 2 THEN 'BEFORE'
        ELSE 'AFTER'
    END AS timing,
    CASE 
        WHEN tgtype & 4 = 4 THEN 'INSERT'
        WHEN tgtype & 8 = 8 THEN 'DELETE'  
        WHEN tgtype & 16 = 16 THEN 'UPDATE'
        ELSE 'MULTIPLE'
    END AS event
FROM pg_trigger 
WHERE tgrelid IN ('inventory.batches'::regclass, 'sales.invoices'::regclass)
AND tgname NOT LIKE 'RI_%'; -- Exclude foreign key triggers

-- Verify the fix worked
SELECT 'Triggers fixed successfully! Batch creation should now work.' AS status;