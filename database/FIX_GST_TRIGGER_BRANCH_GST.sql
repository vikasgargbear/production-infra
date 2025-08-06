-- =============================================
-- QUICK FIX: GST Trigger Branch GST Column
-- =============================================
-- Fixes the column name from b.gst_number to b.branch_gst_number
-- =============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_calculate_gst_invoice ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_gst_invoice_item() CASCADE;

-- Create fixed version
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
    
    -- Get states for interstate check (FIXED: branch_gst_number)
    SELECT 
        SUBSTRING(c.gst_number FROM 1 FOR 2),
        SUBSTRING(b.branch_gst_number FROM 1 FOR 2)  -- Fixed column name
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

CREATE TRIGGER trigger_calculate_gst_invoice
    BEFORE INSERT OR UPDATE ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_gst_invoice_item();

-- Verify fix
SELECT 'GST trigger fixed - branch_gst_number column issue resolved' as status;