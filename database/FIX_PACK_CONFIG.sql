-- Fix for pack configuration error
-- Add default pack configurations for products that don't have them

-- First, check if pack_configurations table exists
-- If not, the trigger might need to be disabled or modified

-- Option 1: Add default pack configuration for product 8
INSERT INTO master.pack_configurations (product_id, pack_type, pack_size, is_default)
VALUES (8, 'piece', 1, true)
ON CONFLICT (product_id, pack_type) DO NOTHING;

-- Option 2: Add default pack configurations for all products without one
INSERT INTO master.pack_configurations (product_id, pack_type, pack_size, is_default)
SELECT DISTINCT p.product_id, 'piece', 1, true
FROM inventory.products p
WHERE NOT EXISTS (
    SELECT 1 FROM master.pack_configurations pc 
    WHERE pc.product_id = p.product_id AND pc.is_default = true
)
ON CONFLICT (product_id, pack_type) DO NOTHING;

-- Option 3: If the table doesn't exist, disable the trigger temporarily
-- This is a workaround if pack management is not needed
DO $$
BEGIN
    -- Check if the trigger exists and disable it
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'calculate_pack_quantities_trigger'
    ) THEN
        ALTER TABLE sales.order_items DISABLE TRIGGER calculate_pack_quantities_trigger;
    END IF;
END $$;