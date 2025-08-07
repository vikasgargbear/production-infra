-- Fix for order_items table - add missing tax columns
-- Based on schema documentation at database/schema-docs/04_sales_schema.md

-- Add missing tax rate columns if they don't exist
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS igst_rate NUMERIC(5,2);

-- Add missing tax amount columns if they don't exist
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(15,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(15,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(15,2);

-- Add cess columns too
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cess_rate NUMERIC(5,2);

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS cess_amount NUMERIC(15,2);

-- Also ensure we have delivery_status and notes columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'pending';

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add any missing product snapshot columns
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS product_name TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS product_code TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS batch_number TEXT;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS delivered_quantity NUMERIC(15,3) DEFAULT 0;

-- Add timestamps if missing
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;