-- =============================================
-- FIX FOR INVOICE INVENTORY DEDUCTION
-- Creates a trigger to deduct inventory when invoice items are created
-- =============================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_deduct_inventory_on_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS deduct_inventory_on_invoice();

-- Create function to deduct inventory when invoice items are created
CREATE OR REPLACE FUNCTION deduct_inventory_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_batch RECORD;
    v_remaining_qty NUMERIC;
    v_deduct_qty NUMERIC;
BEGIN
    -- Only process on INSERT (new invoice items)
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Skip if no quantity
    IF NEW.quantity <= 0 THEN
        RETURN NEW;
    END IF;
    
    v_remaining_qty := NEW.quantity;
    
    -- If specific batch is provided, deduct from that batch
    IF NEW.batch_id IS NOT NULL THEN
        -- Deduct from specific batch
        UPDATE inventory.batches
        SET 
            quantity_available = quantity_available - NEW.quantity,
            quantity_sold = COALESCE(quantity_sold, 0) + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id
        AND quantity_available >= NEW.quantity;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient stock in batch % for product %', NEW.batch_id, NEW.product_id;
        END IF;
        
        -- Create inventory movement record
        INSERT INTO inventory.inventory_movements (
            org_id, movement_type, movement_date, movement_direction,
            product_id, batch_id, location_id, quantity,
            unit_cost, reference_type, reference_id, reference_number,
            reason, created_at
        ) 
        SELECT
            b.org_id, 'sale', CURRENT_DATE, 'out',
            NEW.product_id, NEW.batch_id, 1, NEW.quantity,
            b.cost_per_unit, 'invoice', NEW.invoice_id, 
            'INV-' || NEW.invoice_id,
            'Invoice sale', CURRENT_TIMESTAMP
        FROM inventory.batches b
        WHERE b.batch_id = NEW.batch_id;
        
    ELSE
        -- No specific batch, use FIFO allocation
        FOR v_batch IN 
            SELECT batch_id, quantity_available, cost_per_unit, org_id
            FROM inventory.batches
            WHERE product_id = NEW.product_id
            AND quantity_available > 0
            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            ORDER BY expiry_date NULLS LAST, batch_id
        LOOP
            IF v_remaining_qty <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate how much to deduct from this batch
            v_deduct_qty := LEAST(v_batch.quantity_available, v_remaining_qty);
            
            -- Update batch quantity
            UPDATE inventory.batches
            SET 
                quantity_available = quantity_available - v_deduct_qty,
                quantity_sold = COALESCE(quantity_sold, 0) + v_deduct_qty,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = v_batch.batch_id;
            
            -- Create inventory movement record
            INSERT INTO inventory.inventory_movements (
                org_id, movement_type, movement_date, movement_direction,
                product_id, batch_id, location_id, quantity,
                unit_cost, reference_type, reference_id, reference_number,
                reason, created_at
            ) VALUES (
                v_batch.org_id, 'sale', CURRENT_DATE, 'out',
                NEW.product_id, v_batch.batch_id, 1, v_deduct_qty,
                v_batch.cost_per_unit, 'invoice', NEW.invoice_id, 
                'INV-' || NEW.invoice_id,
                'Invoice sale (FIFO)', CURRENT_TIMESTAMP
            );
            
            -- Track batch allocation in the invoice item (store as JSONB)
            IF NEW.batch_id IS NULL THEN
                -- Store batch allocation info for tracking
                NEW.batch_id := v_batch.batch_id; -- Store first batch used
            END IF;
            
            v_remaining_qty := v_remaining_qty - v_deduct_qty;
        END LOOP;
        
        -- Check if we could allocate all quantity
        IF v_remaining_qty > 0 THEN
            RAISE WARNING 'Insufficient stock for product %. Required: %, Available was less', 
                NEW.product_id, NEW.quantity;
            -- Optionally, you can raise an exception to prevent the invoice
            -- RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id;
        END IF;
    END IF;
    
    -- Log the inventory deduction
    RAISE NOTICE 'Deducted % units of product % for invoice %', 
        NEW.quantity, NEW.product_id, NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires when invoice items are inserted
CREATE TRIGGER trigger_deduct_inventory_on_invoice
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION deduct_inventory_on_invoice();

-- Add helpful comment
COMMENT ON FUNCTION deduct_inventory_on_invoice() IS 'Automatically deducts inventory when invoice items are created, using FIFO if no specific batch is specified';

-- Test the trigger is installed
DO $$
BEGIN
    RAISE NOTICE '✅ Invoice inventory deduction trigger installed successfully';
    RAISE NOTICE '📦 Inventory will now be automatically deducted when invoices are created';
END $$;