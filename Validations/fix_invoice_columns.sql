-- Fix missing columns in invoice_items table
-- Run this on your Supabase database to fix invoice creation

-- Add missing columns to sales.invoice_items if they don't exist
ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS gst_percentage NUMERIC(5,2) DEFAULT 0;

ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;

ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS line_total NUMERIC(15,2) DEFAULT 0;

ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS line_total_with_tax NUMERIC(15,2) DEFAULT 0;

-- Also ensure these columns exist (they might already be there)
ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(15,2) DEFAULT 0;

ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(15,2) DEFAULT 0;

ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(15,2) DEFAULT 0;

-- Check if columns were added successfully
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'sales' 
    AND table_name = 'invoice_items'
    AND column_name IN (
        'gst_percentage', 
        'discount_percentage', 
        'line_total', 
        'line_total_with_tax',
        'cgst_amount',
        'sgst_amount',
        'igst_amount'
    )
ORDER BY column_name;