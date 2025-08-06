-- =============================================
-- QUICK FIX: Invoice Totals Trigger - Column Names
-- =============================================
-- Fixes column names to match actual invoices table structure
-- =============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items;
DROP FUNCTION IF EXISTS calculate_invoice_totals() CASCADE;

-- Create fixed version
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
    -- Calculate totals from invoice items
    SELECT 
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
    -- Only update columns that exist in the invoices table
    UPDATE sales.invoices
    SET 
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        igst_amount = v_totals.igst,
        cgst_amount = v_totals.cgst,
        sgst_amount = v_totals.sgst,
        cess_amount = v_totals.cess,
        total_tax_amount = v_totals.total_tax,  -- This column exists
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

-- Verify fix
SELECT 'Invoice totals trigger fixed - column names corrected' as status;