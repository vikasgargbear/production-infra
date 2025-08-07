-- Drop the problematic trigger that's causing order creation to fail
DROP TRIGGER IF EXISTS calculate_pack_quantities_trigger ON sales.order_items;

-- Drop the function too if it exists
DROP FUNCTION IF EXISTS calculate_pack_quantities() CASCADE;