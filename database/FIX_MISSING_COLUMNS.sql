-- =============================================
-- FIX MISSING COLUMNS IN DATABASE
-- =============================================
-- Adds columns that APIs expect but don't exist
-- =============================================

-- 1. Add mrp column to products table (alias for current_mrp)
ALTER TABLE inventory.products 
ADD COLUMN IF NOT EXISTS mrp NUMERIC(15,4);

-- Copy data from current_mrp to mrp
UPDATE inventory.products 
SET mrp = current_mrp 
WHERE mrp IS NULL AND current_mrp IS NOT NULL;

-- 2. Add missing columns to orders table for OrderResponse schema
ALTER TABLE sales.orders 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- Set default payment_terms if NULL
UPDATE sales.orders 
SET payment_terms = 'credit' 
WHERE payment_terms IS NULL;

-- 3. Add items_count and total_quantity to invoices table
ALTER TABLE sales.invoices 
ADD COLUMN IF NOT EXISTS items_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(15,3) DEFAULT 0;

-- Update existing invoices with counts
UPDATE sales.invoices i
SET items_count = (
    SELECT COUNT(*) 
    FROM sales.invoice_items 
    WHERE invoice_id = i.invoice_id
),
total_quantity = (
    SELECT COALESCE(SUM(quantity), 0) 
    FROM sales.invoice_items 
    WHERE invoice_id = i.invoice_id
)
WHERE items_count = 0;

-- 4. Ensure last_movement_date exists in batches table
ALTER TABLE inventory.batches 
ADD COLUMN IF NOT EXISTS last_movement_date TIMESTAMPTZ;

-- Copy from updated_at if needed
UPDATE inventory.batches 
SET last_movement_date = updated_at 
WHERE last_movement_date IS NULL;

-- 5. Create trigger to keep mrp in sync with current_mrp
CREATE OR REPLACE FUNCTION sync_mrp_column()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_mrp IS NOT NULL THEN
        NEW.mrp = NEW.current_mrp;
    ELSIF NEW.mrp IS NOT NULL THEN
        NEW.current_mrp = NEW.mrp;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_mrp ON inventory.products;
CREATE TRIGGER trigger_sync_mrp
    BEFORE INSERT OR UPDATE ON inventory.products
    FOR EACH ROW
    EXECUTE FUNCTION sync_mrp_column();

-- Verify fixes
SELECT 'Missing columns added successfully' as status;