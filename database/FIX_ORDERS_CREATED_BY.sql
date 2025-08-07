-- Fix for orders table created_by constraint
-- Either make the column nullable or create a default user

-- Option 1: Make created_by nullable (preferred for now)
ALTER TABLE sales.orders 
ALTER COLUMN created_by DROP NOT NULL;

-- Also make updated_by nullable if it exists
ALTER TABLE sales.orders 
ALTER COLUMN updated_by DROP NOT NULL;

-- Do the same for order_items if needed
ALTER TABLE sales.order_items 
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE sales.order_items 
ALTER COLUMN updated_by DROP NOT NULL;

-- Fix any other tables that might have this issue
ALTER TABLE sales.invoices 
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE sales.invoices 
ALTER COLUMN updated_by DROP NOT NULL;

ALTER TABLE sales.invoice_items 
ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE sales.invoice_items 
ALTER COLUMN updated_by DROP NOT NULL;