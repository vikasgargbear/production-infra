-- =============================================
-- INVOICE TRIGGERS DEPLOYMENT SCRIPT
-- =============================================
-- Run this script to deploy all required invoice triggers
-- Date: August 4, 2024
-- =============================================

-- =============================================
-- CLEANUP EXISTING TRIGGERS
-- =============================================
-- Drop any existing triggers that might conflict

-- Drop existing GST calculation triggers
DROP TRIGGER IF EXISTS trigger_calculate_gst_on_invoice_item ON sales.invoice_items;
DROP TRIGGER IF EXISTS calculate_gst_on_invoice_item ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_on_invoice_item() CASCADE;

-- Drop existing inventory update triggers  
DROP TRIGGER IF EXISTS trigger_update_inventory_on_sale ON sales.invoice_items;
DROP TRIGGER IF EXISTS update_inventory_on_sale ON sales.invoice_items;
DROP FUNCTION IF EXISTS update_inventory_on_sale() CASCADE;

-- Drop any test/temporary triggers
DROP TRIGGER IF EXISTS trigger_calculate_gst_fixed ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_fixed() CASCADE;

-- =============================================
-- 1. INVOICE TOTALS CALCULATION TRIGGER
-- =============================================
-- This trigger aggregates invoice items to update invoice header totals

DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_invoice_totals() CASCADE;

CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
    -- For simple flow, we only handle INSERT
    -- When user clicks Save, items are inserted and totals calculated
    
    -- Calculate totals from invoice items
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(quantity * unit_price), 0) as subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(taxable_amount), 0) as taxable,
        COALESCE(SUM(igst_amount), 0) as igst,
        COALESCE(SUM(cgst_amount), 0) as cgst,
        COALESCE(SUM(sgst_amount), 0) as sgst,
        COALESCE(SUM(cess_amount), 0) as cess,
        COALESCE(SUM(total_tax_amount), 0) as total_tax,
        COALESCE(SUM(line_total), 0) as total
    INTO v_totals
    FROM sales.invoice_items
    WHERE invoice_id = NEW.invoice_id;
    
    -- Update invoice header with calculated totals
    UPDATE sales.invoices
    SET 
        items_count = v_totals.item_count,
        total_quantity = v_totals.total_quantity,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        tax_amount = v_totals.total_tax,
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        final_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_invoice_totals
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_invoice_totals();

-- =============================================
-- 2. GST CALCULATION TRIGGER
-- =============================================
-- Updated to use correct column names

DROP TRIGGER IF EXISTS trigger_calculate_gst_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_invoice_item() CASCADE;

CREATE OR REPLACE FUNCTION calculate_gst_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_gst_rate NUMERIC;
    v_customer_state TEXT;
    v_branch_state TEXT;
    v_is_interstate BOOLEAN;
BEGIN
    -- Get GST rate from product (fixed column name)
    SELECT COALESCE(gst_percentage, 18) INTO v_gst_rate
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Get states for interstate check
    SELECT 
        SUBSTRING(c.gst_number FROM 1 FOR 2),
        SUBSTRING(b.branch_gst_number FROM 1 FOR 2)
    INTO v_customer_state, v_branch_state
    FROM sales.invoices i
    LEFT JOIN parties.customers c ON i.customer_id = c.customer_id
    LEFT JOIN master.org_branches b ON i.branch_id = b.branch_id
    WHERE i.invoice_id = NEW.invoice_id;
    
    -- Default to intrastate if states not found
    v_is_interstate := COALESCE(v_customer_state != v_branch_state, FALSE);
    
    -- Calculate taxable amount if not provided
    IF NEW.taxable_amount IS NULL OR NEW.taxable_amount = 0 THEN
        NEW.taxable_amount := (NEW.quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);
    END IF;
    
    -- Calculate GST
    IF v_is_interstate THEN
        -- Interstate - IGST only
        NEW.igst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 100, 2);
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
    ELSE
        -- Intrastate - CGST + SGST
        NEW.igst_amount := 0;
        NEW.cgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
        NEW.sgst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 200, 2);
    END IF;
    
    -- Calculate total tax and line total
    NEW.total_tax_amount := NEW.igst_amount + NEW.cgst_amount + NEW.sgst_amount + COALESCE(NEW.cess_amount, 0);
    NEW.line_total := NEW.taxable_amount + NEW.total_tax_amount;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_gst_invoice
    BEFORE INSERT OR UPDATE ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_gst_invoice_item();

-- =============================================
-- 3. INVENTORY UPDATE TRIGGER
-- =============================================
-- Updates inventory when invoice items are created

DROP TRIGGER IF EXISTS trigger_update_inventory_on_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS update_inventory_on_invoice() CASCADE;

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
            last_movement_date = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
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

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- List all triggers on invoice tables
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'sales'
AND event_object_table IN ('invoices', 'invoice_items')
ORDER BY event_object_table, trigger_name;

-- Expected output should show:
-- trigger_calculate_invoice_totals
-- trigger_calculate_gst_invoice
-- trigger_update_inventory_on_invoice

-- Note: To test triggers after deployment, run manual test queries
-- Example test queries are provided below (commented out)

-- =============================================
-- SUCCESS MESSAGE
-- =============================================
SELECT 'Invoice triggers deployed successfully!' as status;

-- =============================================
-- MANUAL TEST QUERIES (Run these separately after deployment)
-- =============================================
/*
-- 1. First, find a valid org_id and customer_id:
SELECT org_id FROM master.organizations LIMIT 1;
SELECT customer_id FROM parties.customers WHERE is_active = true LIMIT 1;

-- 2. Create test invoice (replace UUIDs and IDs with actual values):
INSERT INTO sales.invoices (
    org_id, branch_id, invoice_date, customer_id, 
    invoice_status, payment_terms, created_by
) VALUES (
    'YOUR-ORG-UUID'::uuid, 1, CURRENT_DATE, YOUR_CUSTOMER_ID, 
    'draft', 'cash', 1
) RETURNING invoice_id;

-- 3. Add test item (replace INVOICE_ID with value from step 2):
INSERT INTO sales.invoice_items (
    invoice_id, product_id, product_name, quantity, 
    unit_price, discount_percent
) VALUES (
    INVOICE_ID, 1, 'Test Product', 2, 100.00, 10
);

-- 4. Check if triggers worked:
SELECT 
    invoice_id,
    items_count,
    subtotal_amount,
    tax_amount,
    final_amount
FROM sales.invoices 
WHERE invoice_id = INVOICE_ID;

SELECT 
    invoice_item_id,
    taxable_amount,
    cgst_amount + sgst_amount + igst_amount as total_gst,
    line_total
FROM sales.invoice_items
WHERE invoice_id = INVOICE_ID;

-- 5. Clean up test data:
DELETE FROM sales.invoice_items WHERE invoice_id = INVOICE_ID;
DELETE FROM sales.invoices WHERE invoice_id = INVOICE_ID;
*/