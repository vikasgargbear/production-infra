-- Drop all broken triggers that reference non-existent columns

-- 1. Drop trigger that references master.branches
DROP TRIGGER IF EXISTS calculate_gst_on_invoice_item_trigger ON sales.invoice_items CASCADE;
DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item() CASCADE;

-- 2. Drop trigger that references invoice_id in orders table
DROP TRIGGER IF EXISTS trigger_sync_order_invoice_status ON sales.invoices CASCADE;
DROP FUNCTION IF EXISTS sync_order_invoice_status() CASCADE;

-- 3. Create a simplified sync function that works with actual columns
-- (Only if you want to keep some sync functionality)
-- CREATE OR REPLACE FUNCTION simple_sync_order_status()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     -- Just update the order's final_amount from invoice
--     UPDATE sales.orders
--     SET final_amount = NEW.final_amount,
--         updated_at = CURRENT_TIMESTAMP
--     WHERE order_id = NEW.order_id;
--     
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Don't create new trigger for now, let the application handle it

COMMIT;