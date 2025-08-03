-- Fix ONLY Invoice Creation Issues
-- Minimal changes to make invoice creation work properly

-- ============================================================
-- STEP 1: Create analytics schema and dashboard_cache table
-- This is required for the refresh_dashboard_cache trigger
-- ============================================================

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.dashboard_cache (
    cache_id SERIAL PRIMARY KEY,
    org_id UUID,
    metric_type VARCHAR(50),
    metric_name VARCHAR(100),
    metric_value NUMERIC DEFAULT 0,
    metric_date DATE,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add unique constraint for upserts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_dashboard_metric'
    ) THEN
        ALTER TABLE analytics.dashboard_cache 
        ADD CONSTRAINT unique_dashboard_metric 
        UNIQUE (org_id, metric_type, metric_name, metric_date);
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_org_id ON analytics.dashboard_cache(org_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_metric_date ON analytics.dashboard_cache(metric_date);

-- Create or replace the function that the trigger calls
CREATE OR REPLACE FUNCTION refresh_dashboard_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Record daily revenue
    INSERT INTO analytics.dashboard_cache (
        org_id, metric_type, metric_name, 
        metric_value, metric_date
    ) VALUES (
        NEW.org_id, 'sales', 'daily_revenue',
        NEW.final_amount, NEW.invoice_date::date
    )
    ON CONFLICT (org_id, metric_type, metric_name, metric_date) 
    DO UPDATE SET 
        metric_value = analytics.dashboard_cache.metric_value + EXCLUDED.metric_value,
        last_updated = NOW();
    
    -- Record invoice count
    INSERT INTO analytics.dashboard_cache (
        org_id, metric_type, metric_name, 
        metric_value, metric_date
    ) VALUES (
        NEW.org_id, 'sales', 'daily_invoices',
        1, NEW.invoice_date::date
    )
    ON CONFLICT (org_id, metric_type, metric_name, metric_date) 
    DO UPDATE SET 
        metric_value = analytics.dashboard_cache.metric_value + 1,
        last_updated = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 2: Create financial.customer_outstanding table
-- This is referenced in invoice creation code
-- ============================================================

CREATE SCHEMA IF NOT EXISTS financial;

CREATE TABLE IF NOT EXISTS financial.customer_outstanding (
    outstanding_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    customer_id INTEGER NOT NULL,
    document_type VARCHAR(20) NOT NULL, -- 'invoice'
    document_id INTEGER NOT NULL,
    document_number VARCHAR(50),
    document_date DATE NOT NULL,
    due_date DATE,
    original_amount NUMERIC(12,2) NOT NULL,
    outstanding_amount NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customer_outstanding_customer ON financial.customer_outstanding(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_outstanding_status ON financial.customer_outstanding(status);

-- Add unique constraint to prevent duplicates
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_outstanding_document'
    ) THEN
        ALTER TABLE financial.customer_outstanding 
        ADD CONSTRAINT unique_outstanding_document 
        UNIQUE (org_id, document_type, document_id);
    END IF;
END $$;

-- ============================================================
-- STEP 3: Add missing columns to invoices table
-- ============================================================

-- Add paid_amount column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'invoices' 
        AND column_name = 'paid_amount'
    ) THEN
        ALTER TABLE sales.invoices 
        ADD COLUMN paid_amount NUMERIC(12,2) DEFAULT 0;
        
        RAISE NOTICE '✅ Added paid_amount to invoices';
    END IF;
END $$;

-- ============================================================
-- STEP 4: Test invoice creation
-- ============================================================

DO $$ 
DECLARE
    test_invoice_id INTEGER;
BEGIN
    -- Try to create a test invoice
    INSERT INTO sales.invoices (
        org_id, invoice_number, invoice_date,
        customer_id, customer_name,
        subtotal_amount, total_tax_amount, final_amount,
        invoice_status, payment_status,
        created_at, updated_at
    ) VALUES (
        'ad808530-1ddb-4377-ab20-67bef145d80d',
        'TEST_FIX_' || EXTRACT(EPOCH FROM NOW())::TEXT,
        CURRENT_DATE,
        1, 'Test Customer',
        100, 12, 112,
        'posted', 'unpaid',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) RETURNING invoice_id INTO test_invoice_id;
    
    -- Check if dashboard cache was updated
    IF EXISTS (
        SELECT 1 FROM analytics.dashboard_cache 
        WHERE metric_date = CURRENT_DATE 
        AND metric_name = 'daily_revenue'
    ) THEN
        RAISE NOTICE '✅ Invoice creation successful! Dashboard metrics updated.';
    ELSE
        RAISE NOTICE '⚠️ Invoice created but dashboard metrics not updated';
    END IF;
    
    -- Clean up test
    DELETE FROM sales.invoices WHERE invoice_id = test_invoice_id;
    DELETE FROM analytics.dashboard_cache 
    WHERE metric_date = CURRENT_DATE 
    AND metric_name IN ('daily_revenue', 'daily_invoices');
    
    RAISE NOTICE '✅ Invoice creation is now working!';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Invoice test failed: %', SQLERRM;
END $$;

-- ============================================================
-- Summary
-- ============================================================

SELECT 'Invoice Components Status' as report;
SELECT '=========================' as divider;

SELECT 
    component,
    status
FROM (
    SELECT 'analytics.dashboard_cache table' as component,
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'analytics' 
            AND table_name = 'dashboard_cache'
        ) THEN '✅ Ready' ELSE '❌ Missing' END as status
    UNION ALL
    SELECT 'refresh_dashboard_cache function',
        CASE WHEN EXISTS (
            SELECT 1 FROM pg_proc 
            WHERE proname = 'refresh_dashboard_cache'
        ) THEN '✅ Ready' ELSE '❌ Missing' END
    UNION ALL
    SELECT 'financial.customer_outstanding table',
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'financial' 
            AND table_name = 'customer_outstanding'
        ) THEN '✅ Ready' ELSE '❌ Missing' END
    UNION ALL
    SELECT 'sales.invoices.paid_amount column',
        CASE WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'sales' 
            AND table_name = 'invoices' 
            AND column_name = 'paid_amount'
        ) THEN '✅ Ready' ELSE '❌ Missing' END
) status_check
ORDER BY 
    CASE 
        WHEN status LIKE '%Missing%' THEN 0
        ELSE 1
    END;