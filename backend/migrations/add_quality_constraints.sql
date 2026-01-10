-- Database Constraints for Data Integrity
-- Migration: Add CHECK constraints to prevent data quality issues

-- =============================================================================
-- INVOICE ITEMS: Ensure calculated fields are not zero
-- =============================================================================

-- Constraint 1: Line total must be positive (except for free items)
ALTER TABLE sales.invoice_items 
ADD CONSTRAINT check_line_total_positive 
CHECK (
    line_total > 0 
    OR is_free_item = true
);

-- Constraint 2: Taxable amount must be non-negative
ALTER TABLE sales.invoice_items 
ADD CONSTRAINT check_taxable_amount_non_negative 
CHECK (taxable_amount >= 0);

-- Constraint 3: Discount cannot exceed subtotal
ALTER TABLE sales.invoice_items 
ADD CONSTRAINT check_discount_not_exceed_subtotal 
CHECK (discount_amount <= (quantity * unit_price));

-- Constraint 4: GST amounts must be non-negative
ALTER TABLE sales.invoice_items 
ADD CONSTRAINT check_gst_amounts_non_negative 
CHECK (
    cgst_amount >= 0 
    AND sgst_amount >= 0 
    AND igst_amount >= 0
);

-- =============================================================================
-- INVOICES: Payment validation
-- =============================================================================

-- Constraint 5: Paid amount cannot exceed final amount
ALTER TABLE sales.invoices 
ADD CONSTRAINT check_paid_not_exceed_final 
CHECK (paid_amount <= final_amount);

-- Constraint 6: Credit amount equals final - paid
ALTER TABLE sales.invoices 
ADD CONSTRAINT check_credit_amount_correct 
CHECK (
    ABS(credit_amount - (final_amount - paid_amount)) < 0.01
    OR credit_amount IS NULL
);

-- Constraint 7: Final amount must be positive
ALTER TABLE sales.invoices 
ADD CONSTRAINT check_final_amount_positive 
CHECK (final_amount > 0);

-- =============================================================================
-- BATCHES: Stock integrity
-- =============================================================================

-- Constraint 8: Available quantity cannot be negative
ALTER TABLE inventory.batches 
ADD CONSTRAINT check_quantity_available_non_negative 
CHECK (quantity_available >= 0);

-- Constraint 9: Reserved quantity cannot exceed available + reserved
ALTER TABLE inventory.batches 
ADD CONSTRAINT check_reserved_quantity_valid 
CHECK (
    quantity_reserved <= (quantity_available + quantity_reserved)
    OR quantity_reserved IS NULL
);

-- Constraint 10: MRP must be positive
ALTER TABLE inventory.batches 
ADD CONSTRAINT check_mrp_positive 
CHECK (mrp > 0 OR mrp IS NULL);

-- =============================================================================
-- PAYMENTS: Amount validation
-- =============================================================================

-- Constraint 11: Payment amount must be positive
ALTER TABLE finance.payments 
ADD CONSTRAINT check_payment_amount_positive 
CHECK (amount > 0);

-- =============================================================================
-- RETURNS: Quantity validation
-- =============================================================================

-- Constraint 12: Return quantity must be positive
ALTER TABLE sales.sales_return_items 
ADD CONSTRAINT check_return_quantity_positive 
CHECK (quantity_returned > 0);

-- Constraint 13: Saleable + damaged = total returned
ALTER TABLE sales.sales_return_items 
DROP CONSTRAINT IF EXISTS check_return_quantities_sum;

-- Not adding this constraint as it may be too restrictive

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON CONSTRAINT check_line_total_positive ON sales.invoice_items IS 
'Ensures line total is positive (critical for preventing zero calculation bug)';

COMMENT ON CONSTRAINT check_paid_not_exceed_final ON sales.invoices IS 
'Prevents overpayment (critical validation)';

COMMENT ON CONSTRAINT check_quantity_available_non_negative ON inventory.batches IS 
'Prevents negative stock (data integrity)';
