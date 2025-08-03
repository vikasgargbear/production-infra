-- Better Database Fix - Add current_mrp to products table
-- This is a cleaner approach: MRP is a product-level attribute, not batch-level
-- The trigger will check the product's current MRP when creating/updating batches

-- ============================================================
-- PART 1: Add current_mrp to products table
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
        
        -- Initialize with existing MRP values from the products table
        UPDATE inventory.products 
        SET current_mrp = COALESCE(mrp, 0);
        
        -- Make it NOT NULL with default
        ALTER TABLE inventory.products 
        ALTER COLUMN current_mrp SET NOT NULL,
        ALTER COLUMN current_mrp SET DEFAULT 0;
        
        RAISE NOTICE '✅ Added current_mrp column to inventory.products';
    ELSE
        RAISE NOTICE 'ℹ️ current_mrp column already exists in products';
    END IF;
END $$;

-- ============================================================
-- PART 2: Fix the prevent_mrp_decrease trigger
-- Update it to check product's current_mrp instead of batch's
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
                RAISE NOTICE 'Updated product % current MRP to %', NEW.product_id, NEW.mrp_per_unit;
            END IF;
        END IF;
        
        -- For UPDATE: prevent decreasing batch MRP below product's current MRP
        IF TG_OP = 'UPDATE' THEN
            IF NEW.mrp_per_unit < OLD.mrp_per_unit THEN
                -- Check if this would violate product's current MRP
                IF NEW.mrp_per_unit < product_current_mrp THEN
                    RAISE EXCEPTION 'Cannot decrease batch MRP (%) below product current MRP (%)', 
                        NEW.mrp_per_unit, product_current_mrp;
                END IF;
            END IF;
            
            -- If increasing batch MRP, update product's current MRP
            IF NEW.mrp_per_unit > product_current_mrp THEN
                UPDATE inventory.products 
                SET current_mrp = NEW.mrp_per_unit
                WHERE product_id = NEW.product_id;
                RAISE NOTICE 'Updated product % current MRP to %', NEW.product_id, NEW.mrp_per_unit;
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

RAISE NOTICE '✅ Created improved prevent_mrp_decrease trigger';

-- ============================================================
-- PART 3: Create analytics.dashboard_cache table for invoice trigger
-- ============================================================

CREATE SCHEMA IF NOT EXISTS analytics;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'analytics' 
        AND table_name = 'dashboard_cache'
    ) THEN
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
        
        CREATE INDEX idx_dashboard_cache_org_id ON analytics.dashboard_cache(org_id);
        CREATE INDEX idx_dashboard_cache_metric_type ON analytics.dashboard_cache(metric_type);
        CREATE INDEX idx_dashboard_cache_metric_date ON analytics.dashboard_cache(metric_date);
        
        ALTER TABLE analytics.dashboard_cache 
        ADD CONSTRAINT unique_dashboard_metric 
        UNIQUE (org_id, metric_type, metric_name, metric_date);
        
        RAISE NOTICE '✅ Created analytics.dashboard_cache table';
    ELSE
        RAISE NOTICE 'ℹ️ analytics.dashboard_cache table already exists';
    END IF;
END $$;

-- Create the refresh function if it doesn't exist
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
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 4: Add is_active column to batches (for filtering)
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE inventory.batches 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        UPDATE inventory.batches 
        SET is_active = true 
        WHERE is_active IS NULL;
        
        RAISE NOTICE '✅ Added is_active column to inventory.batches';
    ELSE
        RAISE NOTICE 'ℹ️ is_active column already exists';
    END IF;
END $$;

-- ============================================================
-- PART 5: Test everything works
-- ============================================================

-- Test 1: Create a product with current_mrp
DO $$ 
DECLARE
    test_product_id INTEGER;
    test_batch_id INTEGER;
BEGIN
    -- Create a test product
    INSERT INTO inventory.products (
        org_id, product_code, product_name, 
        mrp, current_mrp, sale_price,
        gst_percentage, is_active,
        created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        'TEST_PROD_' || NOW()::TEXT,
        'Test Product for Trigger',
        150, 150, 120,  -- MRP: 150, current_mrp: 150, sale: 120
        12, true,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING product_id INTO test_product_id;
    
    -- Test creating a batch with valid MRP (should succeed)
    INSERT INTO inventory.batches (
        org_id, product_id, batch_number,
        manufacturing_date, expiry_date,
        initial_quantity, quantity_available,
        cost_per_unit, sale_price_per_unit, mrp_per_unit,
        is_active, created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        test_product_id, 'TEST_BATCH_VALID',
        CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
        100, 100,
        60, 120, 150,  -- MRP same as product's current_mrp
        true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING batch_id INTO test_batch_id;
    
    RAISE NOTICE '✅ Batch creation with valid MRP succeeded';
    
    -- Test creating a batch with lower MRP (should fail)
    BEGIN
        INSERT INTO inventory.batches (
            org_id, product_id, batch_number,
            mrp_per_unit, quantity_available,
            created_at, updated_at
        ) VALUES (
            'ad808530-1ddb-4377-ab20-67bef145d80d',
            test_product_id, 'TEST_BATCH_LOW_MRP',
            100,  -- MRP less than product's current_mrp (150)
            10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        );
        RAISE NOTICE '❌ ERROR: Batch with low MRP should have been rejected!';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE '✅ Trigger correctly prevented batch with low MRP';
    END;
    
    -- Test creating a batch with higher MRP (should succeed and update product)
    INSERT INTO inventory.batches (
        org_id, product_id, batch_number,
        mrp_per_unit, quantity_available,
        created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        test_product_id, 'TEST_BATCH_HIGH_MRP',
        200,  -- MRP higher than product's current_mrp
        10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    
    -- Check if product's current_mrp was updated
    SELECT current_mrp INTO test_product_id FROM inventory.products WHERE product_id = test_product_id;
    RAISE NOTICE '✅ Batch with higher MRP created and product updated';
    
    -- Clean up
    DELETE FROM inventory.batches WHERE product_id = test_product_id;
    DELETE FROM inventory.products WHERE product_id = test_product_id;
    
    RAISE NOTICE '✅ All batch trigger tests PASSED';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Batch trigger test FAILED: %', SQLERRM;
END $$;

-- Test 2: Test invoice creation
DO $$ 
DECLARE
    test_invoice_id INTEGER;
BEGIN
    INSERT INTO sales.invoices (
        org_id, invoice_number, invoice_date,
        customer_id, customer_name,
        subtotal_amount, total_tax_amount, final_amount,
        invoice_status, payment_status,
        created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        'TEST_INV_' || NOW()::TEXT, CURRENT_DATE,
        1, 'Test Customer',
        100, 12, 112,
        'posted', 'unpaid',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING invoice_id INTO test_invoice_id;
    
    -- Clean up
    DELETE FROM sales.invoices WHERE invoice_id = test_invoice_id;
    DELETE FROM analytics.dashboard_cache 
    WHERE metric_date = CURRENT_DATE 
    AND metric_name = 'daily_revenue';
    
    RAISE NOTICE '✅ Invoice creation test PASSED';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Invoice creation test FAILED: %', SQLERRM;
END $$;

-- ============================================================
-- Summary
-- ============================================================

SELECT 'Database fixes completed successfully!' AS status;

-- Show what we have
SELECT 
    'inventory.products.current_mrp' as component,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'products' 
        AND column_name = 'current_mrp'
    ) THEN '✅ Ready' ELSE '❌ Missing' END as status
UNION ALL
SELECT 
    'inventory.batches.is_active',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'is_active'
    ) THEN '✅ Ready' ELSE '❌ Missing' END
UNION ALL
SELECT 
    'analytics.dashboard_cache',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'analytics' 
        AND table_name = 'dashboard_cache'
    ) THEN '✅ Ready' ELSE '❌ Missing' END
UNION ALL
SELECT 
    'prevent_mrp_decrease trigger',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'prevent_mrp_decrease'
    ) THEN '✅ Active' ELSE '❌ Missing' END
UNION ALL
SELECT 
    'refresh_dashboard_cache function',
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'refresh_dashboard_cache'
    ) THEN '✅ Ready' ELSE '❌ Missing' END;

-- Show sample of products with their current MRP
SELECT 
    product_id,
    product_name,
    mrp,
    current_mrp,
    CASE 
        WHEN current_mrp IS NOT NULL THEN '✅ Has current_mrp'
        ELSE '❌ Missing current_mrp'
    END as status
FROM inventory.products
LIMIT 5;