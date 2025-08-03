-- Fix Batch Creation Issues
-- This fixes the prevent_mrp_decrease trigger that blocks batch creation

-- ============================================================
-- STEP 1: Add current_mrp to products table
-- The trigger needs this column to track MRP changes
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'current_mrp'
    ) THEN
        -- Add current_mrp column to products table
        ALTER TABLE inventory.products 
        ADD COLUMN current_mrp NUMERIC(10,2);
        
        -- Initialize with default MRP value (will be updated when batches are created)
        UPDATE inventory.products 
        SET current_mrp = 0;
        
        -- Make it NOT NULL with default
        ALTER TABLE inventory.products 
        ALTER COLUMN current_mrp SET NOT NULL,
        ALTER COLUMN current_mrp SET DEFAULT 0;
        
        RAISE NOTICE '✅ Added current_mrp column to products table';
    ELSE
        RAISE NOTICE 'ℹ️ current_mrp column already exists';
    END IF;
END $$;

-- ============================================================
-- STEP 2: Fix the prevent_mrp_decrease trigger
-- Make it work with product's current_mrp instead of batch column
-- ============================================================

-- Drop the existing problematic trigger
DROP TRIGGER IF EXISTS prevent_mrp_decrease ON inventory.batches;

-- Create improved trigger function that checks product's MRP
CREATE OR REPLACE FUNCTION prevent_mrp_decrease_func()
RETURNS TRIGGER AS $$
DECLARE
    product_current_mrp NUMERIC;
BEGIN
    -- Only check on UPDATE or INSERT of batches
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Get the product's current MRP
        SELECT current_mrp INTO product_current_mrp
        FROM inventory.products
        WHERE product_id = NEW.product_id;
        
        -- For INSERT: ensure batch MRP is not less than product's current MRP
        IF TG_OP = 'INSERT' THEN
            IF NEW.mrp_per_unit < product_current_mrp THEN
                RAISE EXCEPTION 'Cannot create batch with MRP (%) less than product current MRP (%)', 
                    NEW.mrp_per_unit, product_current_mrp;
            END IF;
            
            -- Update product's current MRP if this batch has higher MRP
            IF NEW.mrp_per_unit > product_current_mrp THEN
                UPDATE inventory.products 
                SET current_mrp = NEW.mrp_per_unit
                WHERE product_id = NEW.product_id;
            END IF;
        END IF;
        
        -- For UPDATE: prevent decreasing batch MRP below product's current MRP
        IF TG_OP = 'UPDATE' THEN
            IF NEW.mrp_per_unit < product_current_mrp THEN
                RAISE EXCEPTION 'Cannot decrease batch MRP (%) below product current MRP (%)', 
                    NEW.mrp_per_unit, product_current_mrp;
            END IF;
            
            -- If increasing batch MRP, update product's current MRP
            IF NEW.mrp_per_unit > product_current_mrp THEN
                UPDATE inventory.products 
                SET current_mrp = NEW.mrp_per_unit
                WHERE product_id = NEW.product_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the improved trigger
CREATE TRIGGER prevent_mrp_decrease
    BEFORE INSERT OR UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION prevent_mrp_decrease_func();

-- Fixed prevent_mrp_decrease trigger

-- ============================================================
-- STEP 3: Test batch creation
-- ============================================================

DO $$ 
DECLARE
    test_product_id INTEGER;
    test_batch_id INTEGER;
BEGIN
    -- Test creating a batch for existing product
    -- Use product_id = 1 if it exists
    SELECT product_id INTO test_product_id 
    FROM inventory.products 
    WHERE product_id = 1 
    LIMIT 1;
    
    IF test_product_id IS NOT NULL THEN
        -- Ensure the product has current_mrp set
        UPDATE inventory.products 
        SET current_mrp = COALESCE(current_mrp, 100)
        WHERE product_id = test_product_id;
        
        -- Try to create a test batch
        INSERT INTO inventory.batches (
            org_id, product_id, batch_number,
            manufacturing_date, expiry_date,
            initial_quantity, quantity_available,
            cost_per_unit, sale_price_per_unit, mrp_per_unit,
            created_at, updated_at
        ) VALUES (
            'ad808530-1ddb-4377-ab20-67bef145d80d',
            test_product_id, 'TEST_BATCH_' || EXTRACT(EPOCH FROM NOW())::TEXT,
            CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
            100, 100, 60, 80, 100,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING batch_id INTO test_batch_id;
        
        -- Clean up test batch
        DELETE FROM inventory.batches WHERE batch_id = test_batch_id;
        
        RAISE NOTICE '✅ Batch creation test PASSED for product %', test_product_id;
    ELSE
        RAISE NOTICE 'ℹ️ No products found to test with';
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Batch creation test FAILED: %', SQLERRM;
END $$;

-- ============================================================
-- Summary
-- ============================================================

SELECT 'Batch Creation Fix Status' as report;

SELECT 
    component,
    status
FROM (
    SELECT 'inventory.products.current_mrp' as component,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'inventory' 
            AND table_name = 'products' 
            AND column_name = 'current_mrp'
        ) THEN '✅ Ready' ELSE '❌ Missing' END as status
    UNION ALL
    SELECT 'prevent_mrp_decrease trigger',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_trigger 
            WHERE tgname = 'prevent_mrp_decrease'
        ) THEN '✅ Active' ELSE '❌ Missing' END
) status_check
ORDER BY 
    CASE 
        WHEN status LIKE '%Missing%' THEN 0
        ELSE 1
    END;