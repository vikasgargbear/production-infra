-- Database Triggers for Automatic Validation
-- Migration: Add triggers to maintain data integrity

-- =============================================================================
-- Trigger 1: Auto-update batch updated_at on stock changes
-- =============================================================================

CREATE OR REPLACE FUNCTION update_batch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update timestamp if quantity changed
    IF (NEW.quantity_available != OLD.quantity_available 
        OR NEW.quantity_reserved != OLD.quantity_reserved) THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_batch_timestamp_on_quantity_change
    BEFORE UPDATE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_timestamp();

COMMENT ON TRIGGER trigger_batch_timestamp_on_quantity_change ON inventory.batches IS 
'Auto-updates updated_at when stock changes (critical for delta sync)';

-- =============================================================================
-- Trigger 2: Validate invoice totals match item sums
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
    calculated_subtotal NUMERIC;
    calculated_tax NUMERIC;
BEGIN
    -- Calculate sum of line totals
    SELECT 
        COALESCE(SUM(line_total), 0),
        COALESCE(SUM(cgst_amount + sgst_amount + igst_amount), 0)
    INTO calculated_subtotal, calculated_tax
    FROM sales.invoice_items
    WHERE invoice_id = NEW.invoice_id;
    
    -- Validate (with small tolerance for rounding)
    IF ABS(NEW.subtotal_amount - calculated_subtotal) > 0.10 THEN
        RAISE EXCEPTION 'Invoice subtotal (%) does not match sum of line totals (%)', 
            NEW.subtotal_amount, calculated_subtotal;
    END IF;
    
    IF ABS(NEW.total_tax_amount - calculated_tax) > 0.10 THEN
        RAISE EXCEPTION 'Invoice tax (%) does not match sum of item taxes (%)', 
            NEW.total_tax_amount, calculated_tax;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_invoice_totals
    BEFORE INSERT OR UPDATE ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION validate_invoice_totals();

COMMENT ON TRIGGER trigger_validate_invoice_totals ON sales.invoices IS 
'Validates invoice totals match sum of items (prevents calculation errors)';

-- =============================================================================
-- Trigger 3: Auto-calculate credit_amount
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_credit_amount()
RETURNS TRIGGER AS $$
BEGIN
    NEW.credit_amount = NEW.final_amount - NEW.paid_amount;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_calculate_credit
    BEFORE INSERT OR UPDATE ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION auto_calculate_credit_amount();

COMMENT ON TRIGGER trigger_auto_calculate_credit ON sales.invoices IS 
'Auto-calculates credit_amount = final_amount - paid_amount';
