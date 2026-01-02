-- ============================================================================
-- Trigger: Auto-update products.updated_at when batch changes
-- ============================================================================
-- Purpose: When a batch quantity, price, or any field changes,
--          automatically update the parent product's updated_at timestamp
--          so delta sync picks up the change.

-- Function to update product's updated_at
CREATE OR REPLACE FUNCTION inventory.update_product_timestamp_on_batch_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Update parent product's updated_at when batch changes
    UPDATE inventory.products 
    SET updated_at = CURRENT_TIMESTAMP
    WHERE product_id = COALESCE(NEW.product_id, OLD.product_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_batch_update_product_timestamp ON inventory.batches;

-- Create trigger for INSERT, UPDATE, DELETE on batches
CREATE TRIGGER trg_batch_update_product_timestamp
AFTER INSERT OR UPDATE OR DELETE ON inventory.batches
FOR EACH ROW
EXECUTE FUNCTION inventory.update_product_timestamp_on_batch_change();

-- ============================================================================
-- Verify: Test the trigger
-- ============================================================================
-- After running this migration:
-- 1. Update a batch quantity: UPDATE inventory.batches SET quantity_available = 50 WHERE batch_id = 1;
-- 2. Check product: SELECT updated_at FROM inventory.products WHERE product_id = (batch's product_id);
-- The product's updated_at should now be current timestamp

COMMENT ON FUNCTION inventory.update_product_timestamp_on_batch_change() IS 
'Automatically updates product.updated_at when any of its batches change, enabling proper delta sync of stock changes';
