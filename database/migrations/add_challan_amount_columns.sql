-- Migration: Add taxable_amount and gst_amount to delivery_challans
-- These columns are needed for consistent invoice-to-challan data flow
-- Date: 2026-01-12

-- Add columns if they don't exist
DO $$
BEGIN
    -- Add taxable_amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'delivery_challans' 
        AND column_name = 'taxable_amount'
    ) THEN
        ALTER TABLE sales.delivery_challans ADD COLUMN taxable_amount NUMERIC(15,2) DEFAULT 0;
        RAISE NOTICE 'Added taxable_amount column';
    ELSE
        RAISE NOTICE 'taxable_amount column already exists';
    END IF;

    -- Add gst_amount (total tax)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'sales' 
        AND table_name = 'delivery_challans' 
        AND column_name = 'gst_amount'
    ) THEN
        ALTER TABLE sales.delivery_challans ADD COLUMN gst_amount NUMERIC(15,2) DEFAULT 0;
        RAISE NOTICE 'Added gst_amount column';
    ELSE
        RAISE NOTICE 'gst_amount column already exists';
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN sales.delivery_challans.taxable_amount IS 'Taxable amount (from linked invoice)';
COMMENT ON COLUMN sales.delivery_challans.gst_amount IS 'Total GST amount (from linked invoice)';
