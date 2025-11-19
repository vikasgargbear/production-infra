-- Migration: Rename gst_percentage to gst_percent for consistency
-- This eliminates the confusion between frontend and backend field names

-- 1. Rename column in products table
ALTER TABLE inventory.products 
RENAME COLUMN gst_percentage TO gst_percent;

-- 2. Update any views that reference the old column name
-- (Add any view updates here if needed)

-- 3. Update any functions or stored procedures that reference the old column
-- (Add any function updates here if needed)

-- Note: After running this migration, update all backend code to use gst_percent