-- Minimal Database Fixes - Add Missing Columns/Tables Only
-- This script adds the minimum required changes to make triggers work
-- Review each section before running

-- ============================================================
-- PART 1: Fix prevent_mrp_decrease trigger 
-- The trigger looks for 'current_mrp' column which doesn't exist
-- ============================================================

-- Check if current_mrp column exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'current_mrp'
    ) THEN
        -- Add the missing column
        ALTER TABLE inventory.batches 
        ADD COLUMN current_mrp NUMERIC(10,2);
        
        -- Initialize with existing MRP values
        UPDATE inventory.batches 
        SET current_mrp = COALESCE(mrp_per_unit, 0);
        
        -- Make it NOT NULL with default
        ALTER TABLE inventory.batches 
        ALTER COLUMN current_mrp SET NOT NULL,
        ALTER COLUMN current_mrp SET DEFAULT 0;
        
        RAISE NOTICE 'Added current_mrp column to inventory.batches';
    ELSE
        RAISE NOTICE 'current_mrp column already exists';
    END IF;
END $$;

-- ============================================================
-- PART 2: Fix refresh_dashboard_cache trigger
-- The trigger references analytics.dashboard_cache table which doesn't exist
-- ============================================================

-- Create analytics schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS analytics;

-- Check if dashboard_cache table exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'analytics' 
        AND table_name = 'dashboard_cache'
    ) THEN
        -- Create the missing table
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
        
        -- Add unique constraint for upserts
        ALTER TABLE analytics.dashboard_cache 
        ADD CONSTRAINT unique_dashboard_metric 
        UNIQUE (org_id, metric_type, metric_name, metric_date);
        
        RAISE NOTICE 'Created analytics.dashboard_cache table';
    ELSE
        RAISE NOTICE 'analytics.dashboard_cache table already exists';
    END IF;
END $$;

-- Create or replace the function that the trigger calls
CREATE OR REPLACE FUNCTION refresh_dashboard_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Update sales metrics when invoice is created/updated
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
    
    -- You can add more metrics here in the future
    -- For example: customer count, product sales, etc.
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 3: Add is_active column to batches
-- Many queries reference this column but it doesn't exist
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'is_active'
    ) THEN
        -- Add the column
        ALTER TABLE inventory.batches 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        -- Set all existing batches as active
        UPDATE inventory.batches 
        SET is_active = true 
        WHERE is_active IS NULL;
        
        RAISE NOTICE 'Added is_active column to inventory.batches';
    ELSE
        RAISE NOTICE 'is_active column already exists';
    END IF;
END $$;

-- ============================================================
-- PART 4: Test that everything works
-- ============================================================

-- Test 1: Try to create a batch
DO $$ 
DECLARE
    test_batch_id INTEGER;
BEGIN
    INSERT INTO inventory.batches (
        org_id, product_id, batch_number,
        manufacturing_date, expiry_date,
        initial_quantity, quantity_available,
        cost_per_unit, sale_price_per_unit, mrp_per_unit,
        current_mrp, is_active,
        created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        1, 'TEST_BATCH_' || NOW()::TEXT,
        CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year',
        100, 100,
        60, 80, 100,
        100, true,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING batch_id INTO test_batch_id;
    
    -- Clean up test
    DELETE FROM inventory.batches WHERE batch_id = test_batch_id;
    
    RAISE NOTICE '✅ Batch creation test PASSED';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Batch creation test FAILED: %', SQLERRM;
END $$;

-- Test 2: Try to create an invoice
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
    
    -- Clean up test
    DELETE FROM sales.invoices WHERE invoice_id = test_invoice_id;
    -- Also clean up any dashboard cache entries
    DELETE FROM analytics.dashboard_cache 
    WHERE metric_date = CURRENT_DATE 
    AND metric_name = 'daily_revenue';
    
    RAISE NOTICE '✅ Invoice creation test PASSED';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Invoice creation test FAILED: %', SQLERRM;
END $$;

-- ============================================================
-- Show summary of what was done
-- ============================================================

SELECT 'Database fixes completed. Please check the notices above for results.' AS status;

-- Verify the columns exist
SELECT 
    'inventory.batches.current_mrp' as item,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'current_mrp'
    ) THEN '✅ Exists' ELSE '❌ Missing' END as status
UNION ALL
SELECT 
    'inventory.batches.is_active',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'batches' 
        AND column_name = 'is_active'
    ) THEN '✅ Exists' ELSE '❌ Missing' END
UNION ALL
SELECT 
    'analytics.dashboard_cache table',
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'analytics' 
        AND table_name = 'dashboard_cache'
    ) THEN '✅ Exists' ELSE '❌ Missing' END;