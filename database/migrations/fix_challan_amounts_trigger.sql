-- Migration: Fix challan amounts calculation trigger
-- Issue: The trigger recalculates taxable_amount and gst_amount from challan_items,
--        but for auto-created challans from invoices, no items exist during INSERT.
--        This overwrites correctly passed values with wrong calculations.
-- 
-- Solution: Don't recalculate if values are already provided
-- Date: 2026-01-12

-- Drop the problematic trigger
DROP TRIGGER IF EXISTS calculate_challan_amounts_trigger ON sales.delivery_challans;

-- Recreate with smarter logic - only calculate if values are 0 or NULL
CREATE OR REPLACE FUNCTION sales.calculate_challan_amounts()
RETURNS TRIGGER AS $func$
DECLARE
    v_taxable_amount NUMERIC(15,2);
    v_gst_amount NUMERIC(15,2);
BEGIN
    -- Only recalculate if values aren't already provided
    -- This allows auto-created challans from invoices to keep their correct values
    IF NEW.taxable_amount IS NULL OR NEW.taxable_amount = 0 THEN
        -- Calculate taxable amount from items using dispatched_quantity
        SELECT COALESCE(SUM(dispatched_quantity * unit_price), 0)
        INTO v_taxable_amount
        FROM sales.delivery_challan_items
        WHERE challan_id = NEW.challan_id;
        
        NEW.taxable_amount := v_taxable_amount;
    END IF;
    
    IF NEW.gst_amount IS NULL OR NEW.gst_amount = 0 THEN
        -- Only calculate GST if items exist and taxable is known
        -- Calculate GST amount (total - taxable - freight)
        v_gst_amount := NEW.total_amount - NEW.taxable_amount - COALESCE(NEW.freight_charges, 0);
        NEW.gst_amount := v_gst_amount;
    END IF;
    
    RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

-- Recreate trigger with the fixed function
CREATE TRIGGER calculate_challan_amounts_trigger
    BEFORE INSERT OR UPDATE OF total_amount, freight_charges
    ON sales.delivery_challans
    FOR EACH ROW
    EXECUTE FUNCTION sales.calculate_challan_amounts();

-- Add comment explaining the behavior
COMMENT ON FUNCTION sales.calculate_challan_amounts() IS 
'Calculates taxable_amount and gst_amount for challans. 
Only recalculates if values are 0 or NULL to preserve values from auto-created challan (from invoice).';
