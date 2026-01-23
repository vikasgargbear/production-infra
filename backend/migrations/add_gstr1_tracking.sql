-- Migration: Add GSTR-1 Tracking for Invoice Cancellation Compliance
-- Purpose: Track when invoices are reported in GSTR-1 to enforce cancellation rules

-- Add gstr1_reported_date column to invoices
ALTER TABLE sales.invoices
ADD COLUMN IF NOT EXISTS gstr1_reported_date DATE DEFAULT NULL;

-- Add index for GSTR-1 compliance queries
CREATE INDEX IF NOT EXISTS idx_invoices_gstr1_reported 
ON sales.invoices (org_id, gstr1_reported_date) 
WHERE gstr1_reported_date IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN sales.invoices.gstr1_reported_date IS 
'Date when this invoice was reported in GSTR-1. After this date, invoice cannot be cancelled directly - must use Credit Note instead.';

-- Helper function to check if GSTR-1 deadline has passed for an invoice
-- GSTR-1 must be filed by 11th of the next month
CREATE OR REPLACE FUNCTION gst.is_gstr1_deadline_passed(p_invoice_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
    v_deadline DATE;
BEGIN
    -- Calculate deadline: 11th of (invoice_month + 1)
    IF EXTRACT(MONTH FROM p_invoice_date) = 12 THEN
        v_deadline := DATE_TRUNC('year', p_invoice_date) + INTERVAL '1 year' + INTERVAL '10 days';
    ELSE
        v_deadline := DATE_TRUNC('month', p_invoice_date) + INTERVAL '1 month' + INTERVAL '10 days';
    END IF;
    
    RETURN CURRENT_DATE > v_deadline;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to get cancellation eligibility for an invoice
CREATE OR REPLACE FUNCTION gst.get_invoice_cancel_eligibility(
    p_invoice_id INTEGER,
    p_org_id UUID
)
RETURNS TABLE (
    can_cancel BOOLEAN,
    reason TEXT,
    requires_credit_note BOOLEAN,
    invoice_status TEXT,
    gstr1_deadline_passed BOOLEAN
) AS $$
DECLARE
    v_invoice RECORD;
    v_paid_amount NUMERIC;
    v_deadline_passed BOOLEAN;
BEGIN
    -- Get invoice details
    SELECT 
        i.invoice_status,
        i.invoice_date,
        i.paid_amount,
        i.gstr1_reported_date
    INTO v_invoice
    FROM sales.invoices i
    WHERE i.invoice_id = p_invoice_id AND i.org_id = p_org_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Invoice not found'::TEXT, FALSE, NULL::TEXT, FALSE;
        RETURN;
    END IF;
    
    v_paid_amount := COALESCE(v_invoice.paid_amount, 0);
    v_deadline_passed := gst.is_gstr1_deadline_passed(v_invoice.invoice_date);
    
    -- Rule 1: Already cancelled
    IF v_invoice.invoice_status = 'cancelled' THEN
        RETURN QUERY SELECT FALSE, 'Invoice is already cancelled'::TEXT, FALSE, 
                            v_invoice.invoice_status::TEXT, v_deadline_passed;
        RETURN;
    END IF;
    
    -- Rule 2: Has payments
    IF v_paid_amount > 0 THEN
        RETURN QUERY SELECT FALSE, 
                            format('Cannot cancel invoice with payments. ₹%s has been paid. Reverse payments first.', v_paid_amount)::TEXT, 
                            FALSE, v_invoice.invoice_status::TEXT, v_deadline_passed;
        RETURN;
    END IF;
    
    -- Rule 3: Draft invoices can always be cancelled
    IF v_invoice.invoice_status = 'draft' THEN
        RETURN QUERY SELECT TRUE, 'Draft invoice can be cancelled'::TEXT, FALSE, 
                            v_invoice.invoice_status::TEXT, v_deadline_passed;
        RETURN;
    END IF;
    
    -- Rule 4: Posted invoices - check GSTR-1 deadline
    IF v_invoice.invoice_status = 'posted' THEN
        IF v_deadline_passed OR v_invoice.gstr1_reported_date IS NOT NULL THEN
            -- After GSTR-1 deadline or already reported - BLOCK
            RETURN QUERY SELECT FALSE, 
                                'Invoice has been reported in GSTR-1. Use Credit Note to reverse this invoice instead of cancelling.'::TEXT, 
                                TRUE, v_invoice.invoice_status::TEXT, v_deadline_passed;
        ELSE
            -- Before deadline - allow with warning
            RETURN QUERY SELECT TRUE, 
                                'Warning: This posted invoice can still be cancelled as GSTR-1 has not been filed yet.'::TEXT, 
                                FALSE, v_invoice.invoice_status::TEXT, v_deadline_passed;
        END IF;
        RETURN;
    END IF;
    
    -- Default: allow
    RETURN QUERY SELECT TRUE, 'Invoice can be cancelled'::TEXT, FALSE, 
                        v_invoice.invoice_status::TEXT, v_deadline_passed;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions
GRANT EXECUTE ON FUNCTION gst.is_gstr1_deadline_passed(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION gst.get_invoice_cancel_eligibility(INTEGER, UUID) TO PUBLIC;
