-- The trigger calculate_gst_on_invoice_item() is failing because it references master.branches
-- which doesn't exist. The correct table is master.org_branches

-- Option 1: Drop the trigger (simplest fix)
DROP TRIGGER IF EXISTS calculate_gst_on_invoice_item_trigger ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item();

-- Option 2: Create a view to redirect (if we can't modify the trigger)
-- CREATE VIEW master.branches AS SELECT * FROM master.org_branches;

-- Option 3: Fix the trigger to use correct table name
-- But we can't modify it without seeing the full trigger code

-- For now, the best approach is to drop the trigger since we're calculating GST in the API