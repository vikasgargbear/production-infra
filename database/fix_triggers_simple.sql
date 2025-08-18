-- Simple trigger fix for base_quantity calculations
CREATE OR REPLACE FUNCTION calculate_gst_invoice_item()
RETURNS TRIGGER AS $$
DECLARE
    v_gst_rate NUMERIC;
    v_customer_state TEXT;
    v_branch_state TEXT;
    v_is_interstate BOOLEAN;
BEGIN
    -- Get GST rate from product
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

    -- CRITICAL FIX: Always use base_quantity for billing calculations
    NEW.taxable_amount := (NEW.base_quantity * NEW.unit_price) - COALESCE(NEW.discount_amount, 0);

    -- Calculate GST
    IF v_is_interstate THEN
        NEW.igst_amount := ROUND(NEW.taxable_amount * v_gst_rate / 100, 2);
        NEW.cgst_amount := 0;
        NEW.sgst_amount := 0;
    ELSE
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

-- Fix invoice totals calculation trigger
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
    -- Calculate totals from invoice items using CORRECTED base_quantity logic
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        -- CRITICAL FIX: Use base_quantity for subtotal calculation instead of quantity
        COALESCE(SUM(base_quantity * unit_price), 0) as subtotal,
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
    
    -- Update invoice header with correct column names
    UPDATE sales.invoices
    SET 
        items_count = v_totals.item_count,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        total_tax_amount = v_totals.total_tax,
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        final_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;