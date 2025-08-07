-- Migration: Add quantity tracking fields to invoice_items table
-- Purpose: Track base quantity, free quantity, and total quantity separately for better inventory and analytics

-- Add new columns to sales.invoice_items table
ALTER TABLE sales.invoice_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- Add comment explanations for clarity
COMMENT ON COLUMN sales.invoice_items.quantity IS 'Total quantity delivered (base + free) - used for inventory deduction';
COMMENT ON COLUMN sales.invoice_items.base_quantity IS 'Billable/paid quantity - used for revenue calculation';
COMMENT ON COLUMN sales.invoice_items.free_quantity IS 'Free/promotional quantity given - used for tracking and analytics';

-- Update existing records to set base_quantity = quantity (assuming no free items in historical data)
UPDATE sales.invoice_items 
SET base_quantity = quantity,
    free_quantity = 0
WHERE base_quantity IS NULL;

-- Make base_quantity NOT NULL after backfilling
ALTER TABLE sales.invoice_items 
ALTER COLUMN base_quantity SET NOT NULL;

-- Create indexes for reporting queries
CREATE INDEX IF NOT EXISTS idx_invoice_items_free_quantity 
ON sales.invoice_items(free_quantity) 
WHERE free_quantity > 0;

-- Add check constraint to ensure data integrity
ALTER TABLE sales.invoice_items 
ADD CONSTRAINT chk_quantity_integrity 
CHECK (quantity = base_quantity + free_quantity);

-- Create a view for easy reporting
CREATE OR REPLACE VIEW sales.v_invoice_items_with_quantities AS
SELECT 
    ii.*,
    ii.base_quantity * ii.unit_price as billable_amount,
    ii.free_quantity * ii.unit_price as free_value,
    CASE 
        WHEN ii.base_quantity > 0 
        THEN (ii.free_quantity::NUMERIC / ii.base_quantity::NUMERIC * 100)::NUMERIC(5,2)
        ELSE 0 
    END as free_percentage
FROM sales.invoice_items ii;

-- Add similar fields to other relevant tables
-- For purchase tables (for consistency)
ALTER TABLE inventory.grn_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- For sales orders
ALTER TABLE sales.order_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- For quotations
ALTER TABLE sales.quotation_items 
ADD COLUMN IF NOT EXISTS base_quantity NUMERIC(15,3),
ADD COLUMN IF NOT EXISTS free_quantity NUMERIC(15,3) DEFAULT 0;

-- Create a function to validate quantity integrity
CREATE OR REPLACE FUNCTION sales.validate_quantity_integrity()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure total quantity equals base + free
    IF NEW.quantity != (COALESCE(NEW.base_quantity, 0) + COALESCE(NEW.free_quantity, 0)) THEN
        RAISE EXCEPTION 'Quantity mismatch: total quantity (%) must equal base_quantity (%) + free_quantity (%)',
            NEW.quantity, NEW.base_quantity, NEW.free_quantity;
    END IF;
    
    -- Ensure line_total is calculated on base_quantity only
    NEW.line_total := NEW.base_quantity * NEW.unit_price * (1 - COALESCE(NEW.discount_percent, 0)/100);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce integrity
CREATE TRIGGER trg_validate_invoice_items_quantity
BEFORE INSERT OR UPDATE ON sales.invoice_items
FOR EACH ROW
EXECUTE FUNCTION sales.validate_quantity_integrity();

-- Sample queries for reporting

-- 1. Total free items given by product
-- SELECT 
--     product_id, 
--     product_name,
--     SUM(free_quantity) as total_free_given,
--     SUM(free_quantity * unit_price) as total_free_value
-- FROM sales.invoice_items
-- WHERE free_quantity > 0
-- GROUP BY product_id, product_name
-- ORDER BY total_free_value DESC;

-- 2. Customer-wise free items analysis
-- SELECT 
--     i.customer_id,
--     c.customer_name,
--     SUM(ii.base_quantity) as total_paid_qty,
--     SUM(ii.free_quantity) as total_free_qty,
--     SUM(ii.free_quantity * ii.unit_price) as total_free_value
-- FROM sales.invoices i
-- JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
-- JOIN sales.customers c ON i.customer_id = c.customer_id
-- WHERE ii.free_quantity > 0
-- GROUP BY i.customer_id, c.customer_name
-- ORDER BY total_free_value DESC;

-- Rollback script (if needed)
-- ALTER TABLE sales.invoice_items DROP COLUMN IF EXISTS base_quantity;
-- ALTER TABLE sales.invoice_items DROP COLUMN IF EXISTS free_quantity;
-- DROP TRIGGER IF EXISTS trg_validate_invoice_items_quantity ON sales.invoice_items;
-- DROP FUNCTION IF EXISTS sales.validate_quantity_integrity();
-- DROP VIEW IF EXISTS sales.v_invoice_items_with_quantities;