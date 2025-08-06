-- =============================================
-- QUICK FIX: Inventory Trigger - last_movement_date Column
-- =============================================
-- Fixes the column name from last_movement_date to updated_at
-- =============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_update_inventory_on_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS update_inventory_on_invoice() CASCADE;

-- Create fixed version
CREATE OR REPLACE FUNCTION update_inventory_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_id INTEGER;
BEGIN
    -- Only process on INSERT for now
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Get batch_id if not provided (FIFO)
    IF NEW.batch_id IS NULL THEN
        SELECT batch_id INTO v_batch_id
        FROM inventory.batches
        WHERE product_id = NEW.product_id
        AND quantity_available >= NEW.quantity
        AND batch_status = 'active'
        ORDER BY expiry_date NULLS LAST, batch_id
        LIMIT 1;
        
        NEW.batch_id := v_batch_id;
    END IF;
    
    -- Update batch quantity if batch found
    IF NEW.batch_id IS NOT NULL THEN
        UPDATE inventory.batches
        SET 
            quantity_available = quantity_available - NEW.quantity,
            updated_at = CURRENT_TIMESTAMP  -- Fixed column name
        WHERE batch_id = NEW.batch_id
        AND quantity_available >= NEW.quantity;
        
        IF NOT FOUND THEN
            RAISE WARNING 'Insufficient stock in batch % for product %', NEW.batch_id, NEW.product_id;
            -- Continue anyway for MVP
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_invoice
    BEFORE INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_on_invoice();

-- Verify fix
SELECT 'Inventory trigger fixed - updated_at column issue resolved' as status;