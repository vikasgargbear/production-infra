-- Database Maintenance Script: Fix Invoice Calculation Trigger
-- Use: Connect to database and run this script manually
-- Security: Admin-only access required

-- Drop the problematic trigger first
DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items CASCADE;
DROP FUNCTION IF EXISTS calculate_invoice_totals() CASCADE;

-- Create the corrected function
CREATE OR REPLACE FUNCTION calculate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
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

-- Create the trigger
CREATE TRIGGER trigger_calculate_invoice_totals
    AFTER INSERT ON sales.invoice_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_invoice_totals();

-- Success message
SELECT 'Invoice trigger fixed successfully' as status;