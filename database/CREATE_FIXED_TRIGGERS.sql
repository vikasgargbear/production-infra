-- =====================================================
-- FIXED TRIGGERS FOR INVOICE MODULE
-- All triggers recreated with correct schema and column names
-- =====================================================

-- First, ensure we have clean slate
DROP TRIGGER IF EXISTS calculate_gst_on_invoice_item_trigger ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS sync_order_invoice_status_trigger ON sales.orders CASCADE;
DROP TRIGGER IF EXISTS inventory_update_on_sale_trigger ON sales.invoice_items CASCADE;
DROP TRIGGER IF EXISTS update_invoice_totals_trigger ON sales.invoice_items CASCADE;

DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item() CASCADE;
DROP FUNCTION IF EXISTS sync_order_invoice_status() CASCADE;
DROP FUNCTION IF EXISTS update_inventory_on_sale() CASCADE;
DROP FUNCTION IF EXISTS update_invoice_totals() CASCADE;

-- =====================================================
-- 1. FIXED GST CALCULATION TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_gst_on_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_gst_rate NUMERIC;
    v_customer_state VARCHAR(100);
    v_supplier_state VARCHAR(100);
    v_taxable_amount NUMERIC;
BEGIN
    -- Get GST rate from product (using correct column names)
    SELECT COALESCE(gst_percent, 12) INTO v_gst_rate
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Get customer state from invoice and customer tables
    SELECT c.state INTO v_customer_state
    FROM sales.invoices i
    JOIN parties.customers c ON i.customer_id = c.customer_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Get supplier state (using org_branches instead of branches)
    SELECT state INTO v_supplier_state
    FROM master.org_branches
    WHERE branch_id = (
        SELECT branch_id FROM sales.invoices WHERE invoice_id = NEW.invoice_id
    );
    
    -- Calculate taxable amount (using correct column names)
    v_taxable_amount := NEW.quantity * NEW.unit_price - COALESCE(NEW.discount_amount, 0);
    NEW.taxable_amount := v_taxable_amount;
    
    -- Apply GST based on interstate/intrastate
    IF v_customer_state = v_supplier_state OR v_customer_state IS NULL OR v_supplier_state IS NULL THEN
        -- Intrastate: CGST + SGST
        NEW.cgst_rate := v_gst_rate / 2;
        NEW.sgst_rate := v_gst_rate / 2;
        NEW.igst_rate := 0;
        NEW.cgst_amount := v_taxable_amount * (v_gst_rate / 200);
        NEW.sgst_amount := v_taxable_amount * (v_gst_rate / 200);
        NEW.igst_amount := 0;
    ELSE
        -- Interstate: IGST only
        NEW.cgst_rate := 0;
        NEW.sgst_rate := 0;
        NEW.igst_rate := v_gst_rate;
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
        NEW.igst_amount := v_taxable_amount * (v_gst_rate / 100);
    END IF;
    
    -- Calculate total tax and line total
    NEW.total_tax_amount := COALESCE(NEW.cgst_amount, 0) + COALESCE(NEW.sgst_amount, 0) + COALESCE(NEW.igst_amount, 0);
    NEW.line_total := v_taxable_amount + NEW.total_tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER calculate_gst_on_invoice_item_trigger
BEFORE INSERT OR UPDATE ON sales.invoice_items
FOR EACH ROW
EXECUTE FUNCTION calculate_gst_on_invoice_item();

-- =====================================================
-- 2. FIXED ORDER-INVOICE STATUS SYNC TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION sync_order_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update order status when invoice status changes
    -- Using correct column names and relationships
    IF NEW.invoice_status = 'posted' THEN
        UPDATE sales.orders
        SET order_status = 'invoiced',
            updated_at = CURRENT_TIMESTAMP
        WHERE order_id = NEW.order_id;
    ELSIF NEW.invoice_status = 'cancelled' THEN
        UPDATE sales.orders
        SET order_status = 'confirmed',  -- Revert to confirmed
            updated_at = CURRENT_TIMESTAMP
        WHERE order_id = NEW.order_id;
    END IF;
    
    -- Update payment status in order
    UPDATE sales.orders
    SET payment_status = NEW.payment_status,
        updated_at = CURRENT_TIMESTAMP
    WHERE order_id = NEW.order_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on invoices table (not orders)
CREATE TRIGGER sync_order_invoice_status_trigger
AFTER UPDATE OF invoice_status, payment_status ON sales.invoices
FOR EACH ROW
EXECUTE FUNCTION sync_order_invoice_status();

-- =====================================================
-- 3. FIXED INVENTORY UPDATE ON SALE TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_inventory_on_sale()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_id INTEGER;
    v_available_qty NUMERIC;
BEGIN
    -- For INSERT: Deduct inventory
    IF TG_OP = 'INSERT' THEN
        -- Get batch_id from invoice_items (already set by application)
        v_batch_id := NEW.batch_id;
        
        -- If no batch_id specified, get FIFO batch
        IF v_batch_id IS NULL THEN
            SELECT batch_id INTO v_batch_id
            FROM inventory.batches
            WHERE product_id = NEW.product_id
            AND quantity_available > 0
            AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            ORDER BY expiry_date NULLS LAST, batch_id
            LIMIT 1;
            
            -- Update invoice_item with selected batch
            NEW.batch_id := v_batch_id;
        END IF;
        
        -- Check available quantity
        SELECT quantity_available INTO v_available_qty
        FROM inventory.batches
        WHERE batch_id = v_batch_id;
        
        IF v_available_qty < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient stock. Available: %, Required: %', v_available_qty, NEW.quantity;
        END IF;
        
        -- Deduct from batch
        UPDATE inventory.batches
        SET quantity_available = quantity_available - NEW.quantity,
            quantity_sold = COALESCE(quantity_sold, 0) + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = v_batch_id;
        
        -- Create inventory movement record
        INSERT INTO inventory.inventory_movements (
            org_id, product_id, batch_id, movement_type,
            reference_type, reference_id, quantity,
            from_location, to_location, movement_date,
            created_by, created_at
        ) VALUES (
            (SELECT org_id FROM sales.invoices WHERE invoice_id = NEW.invoice_id),
            NEW.product_id, v_batch_id, 'sale',
            'invoice_item', NEW.invoice_item_id, -NEW.quantity,
            'warehouse', 'customer', CURRENT_DATE,
            (SELECT created_by FROM sales.invoices WHERE invoice_id = NEW.invoice_id),
            CURRENT_TIMESTAMP
        );
        
    -- For DELETE: Restore inventory
    ELSIF TG_OP = 'DELETE' THEN
        -- Restore to batch
        UPDATE inventory.batches
        SET quantity_available = quantity_available + OLD.quantity,
            quantity_sold = GREATEST(0, COALESCE(quantity_sold, 0) - OLD.quantity),
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = OLD.batch_id;
        
        -- Create reversal movement
        INSERT INTO inventory.inventory_movements (
            org_id, product_id, batch_id, movement_type,
            reference_type, reference_id, quantity,
            from_location, to_location, movement_date,
            created_by, created_at
        ) VALUES (
            (SELECT org_id FROM sales.invoices WHERE invoice_id = OLD.invoice_id),
            OLD.product_id, OLD.batch_id, 'sale_return',
            'invoice_item', OLD.invoice_item_id, OLD.quantity,
            'customer', 'warehouse', CURRENT_DATE,
            (SELECT created_by FROM sales.invoices WHERE invoice_id = OLD.invoice_id),
            CURRENT_TIMESTAMP
        );
        
    -- For UPDATE: Adjust inventory
    ELSIF TG_OP = 'UPDATE' AND OLD.quantity != NEW.quantity THEN
        DECLARE
            v_qty_diff NUMERIC;
        BEGIN
            v_qty_diff := NEW.quantity - OLD.quantity;
            
            -- Check if increasing quantity
            IF v_qty_diff > 0 THEN
                -- Check available stock
                SELECT quantity_available INTO v_available_qty
                FROM inventory.batches
                WHERE batch_id = NEW.batch_id;
                
                IF v_available_qty < v_qty_diff THEN
                    RAISE EXCEPTION 'Insufficient stock for update. Available: %, Required: %', v_available_qty, v_qty_diff;
                END IF;
            END IF;
            
            -- Update batch quantity
            UPDATE inventory.batches
            SET quantity_available = quantity_available - v_qty_diff,
                quantity_sold = COALESCE(quantity_sold, 0) + v_qty_diff,
                updated_at = CURRENT_TIMESTAMP
            WHERE batch_id = NEW.batch_id;
            
            -- Record adjustment
            INSERT INTO inventory.inventory_movements (
                org_id, product_id, batch_id, movement_type,
                reference_type, reference_id, quantity,
                from_location, to_location, movement_date,
                notes, created_by, created_at
            ) VALUES (
                (SELECT org_id FROM sales.invoices WHERE invoice_id = NEW.invoice_id),
                NEW.product_id, NEW.batch_id, 'adjustment',
                'invoice_item', NEW.invoice_item_id, -v_qty_diff,
                'warehouse', 'warehouse', CURRENT_DATE,
                'Invoice item quantity updated',
                (SELECT created_by FROM sales.invoices WHERE invoice_id = NEW.invoice_id),
                CURRENT_TIMESTAMP
            );
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER inventory_update_on_sale_trigger
AFTER INSERT OR UPDATE OR DELETE ON sales.invoice_items
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_sale();

-- =====================================================
-- 4. FIXED UPDATE INVOICE TOTALS TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_subtotal NUMERIC;
    v_total_cgst NUMERIC;
    v_total_sgst NUMERIC;
    v_total_igst NUMERIC;
    v_total_tax NUMERIC;
    v_total_discount NUMERIC;
    v_final_amount NUMERIC;
    v_invoice_id INTEGER;
BEGIN
    -- Determine invoice_id based on operation
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;
    
    -- Calculate totals from all invoice items (using correct column names)
    SELECT 
        COALESCE(SUM(taxable_amount), 0),
        COALESCE(SUM(cgst_amount), 0),
        COALESCE(SUM(sgst_amount), 0),
        COALESCE(SUM(igst_amount), 0),
        COALESCE(SUM(total_tax_amount), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(line_total), 0)
    INTO 
        v_subtotal,
        v_total_cgst,
        v_total_sgst,
        v_total_igst,
        v_total_tax,
        v_total_discount,
        v_final_amount
    FROM sales.invoice_items
    WHERE invoice_id = v_invoice_id;
    
    -- Update invoice totals with correct column names
    UPDATE sales.invoices
    SET 
        subtotal_amount = v_subtotal,
        discount_amount = v_total_discount,
        taxable_amount = v_subtotal,
        cgst_amount = v_total_cgst,
        sgst_amount = v_total_sgst,
        igst_amount = v_total_igst,
        total_tax_amount = v_total_tax,
        final_amount = v_final_amount,
        round_off_amount = ROUND(v_final_amount) - v_final_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = v_invoice_id;
    
    -- Also update order totals
    UPDATE sales.orders o
    SET 
        subtotal_amount = v_subtotal,
        discount_amount = v_total_discount,
        taxable_amount = v_subtotal,
        cgst_amount = v_total_cgst,
        sgst_amount = v_total_sgst,
        igst_amount = v_total_igst,
        total_tax_amount = v_total_tax,
        final_amount = v_final_amount,
        updated_at = CURRENT_TIMESTAMP
    FROM sales.invoices i
    WHERE i.order_id = o.order_id
    AND i.invoice_id = v_invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_invoice_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON sales.invoice_items
FOR EACH ROW
EXECUTE FUNCTION update_invoice_totals();

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 
    'Fixed triggers created:' as status,
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers 
WHERE trigger_name IN (
    'calculate_gst_on_invoice_item_trigger',
    'sync_order_invoice_status_trigger', 
    'inventory_update_on_sale_trigger',
    'update_invoice_totals_trigger'
)
ORDER BY trigger_name;