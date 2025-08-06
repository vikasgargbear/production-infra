-- =============================================
-- FIX MISSING COLUMNS IN ORDERS TABLE
-- =============================================
-- Adds columns that Order API expects
-- =============================================

-- Add missing columns to orders table
ALTER TABLE sales.orders 
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS customer_phone TEXT,
ADD COLUMN IF NOT EXISTS round_off_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'credit';

-- Update order_type values that don't match the pattern
UPDATE sales.orders 
SET order_type = 'sales' 
WHERE order_type NOT IN ('sales', 'return', 'replacement');

-- Set default values for existing orders
UPDATE sales.orders 
SET customer_name = (
    SELECT customer_name 
    FROM parties.customers 
    WHERE customer_id = orders.customer_id
    LIMIT 1
)
WHERE customer_name IS NULL;

UPDATE sales.orders 
SET customer_phone = (
    SELECT primary_phone 
    FROM parties.customers 
    WHERE customer_id = orders.customer_id
    LIMIT 1
)
WHERE customer_phone IS NULL;

UPDATE sales.orders 
SET balance_amount = COALESCE(final_amount, 0) - COALESCE(paid_amount, 0)
WHERE balance_amount IS NULL;

-- Ensure payment_terms is not NULL
UPDATE sales.orders 
SET payment_terms = 'credit' 
WHERE payment_terms IS NULL;

-- Verify fixes
SELECT 'Orders table columns fixed successfully' as status;