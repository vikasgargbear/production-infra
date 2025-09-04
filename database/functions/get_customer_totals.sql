-- Simple functions to get customer totals

-- 1. Get total payments made by a customer
CREATE OR REPLACE FUNCTION financial.get_customer_total_payments(p_customer_id INTEGER)
RETURNS NUMERIC(15,2) AS $$
BEGIN
    RETURN (
        SELECT COALESCE(SUM(payment_amount), 0)
        FROM financial.payments
        WHERE party_id = p_customer_id
        AND party_type = 'customer'
        AND payment_status = 'cleared'
    );
END;
$$ LANGUAGE plpgsql;

-- 2. Get total invoices for a customer
CREATE OR REPLACE FUNCTION financial.get_customer_total_invoices(p_customer_id INTEGER)
RETURNS NUMERIC(15,2) AS $$
BEGIN
    RETURN (
        SELECT COALESCE(SUM(final_amount), 0)
        FROM sales.invoices
        WHERE customer_id = p_customer_id
        AND invoice_status != 'cancelled'
    );
END;
$$ LANGUAGE plpgsql;

-- 3. Get customer's current position (what they owe or what we owe them)
CREATE OR REPLACE FUNCTION financial.get_customer_net_position(p_customer_id INTEGER)
RETURNS NUMERIC(15,2) AS $$
DECLARE
    v_total_invoices NUMERIC(15,2);
    v_total_payments NUMERIC(15,2);
    v_total_credit_notes NUMERIC(15,2);
    v_total_debit_notes NUMERIC(15,2);
BEGIN
    -- Get total invoices
    SELECT COALESCE(SUM(final_amount), 0) INTO v_total_invoices
    FROM sales.invoices
    WHERE customer_id = p_customer_id
    AND invoice_status != 'cancelled';
    
    -- Get total payments
    SELECT COALESCE(SUM(payment_amount), 0) INTO v_total_payments
    FROM financial.payments
    WHERE party_id = p_customer_id
    AND party_type = 'customer'
    AND payment_status = 'cleared';
    
    -- Get total credit notes (reduce what customer owes)
    SELECT COALESCE(SUM(credit_amount), 0) INTO v_total_credit_notes
    FROM sales.credit_notes
    WHERE customer_id = p_customer_id
    AND status = 'approved';
    
    -- Get total debit notes (increase what customer owes)
    SELECT COALESCE(SUM(debit_amount), 0) INTO v_total_debit_notes
    FROM sales.debit_notes
    WHERE customer_id = p_customer_id
    AND status = 'approved';
    
    -- Calculate net position
    -- Positive = customer owes us
    -- Negative = we owe customer (advance)
    RETURN (v_total_invoices + v_total_debit_notes) - (v_total_payments + v_total_credit_notes);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION financial.get_customer_total_payments(INTEGER) TO postgres;
GRANT EXECUTE ON FUNCTION financial.get_customer_total_invoices(INTEGER) TO postgres;
GRANT EXECUTE ON FUNCTION financial.get_customer_net_position(INTEGER) TO postgres;

-- Comments
COMMENT ON FUNCTION financial.get_customer_total_payments(INTEGER) IS 
'Returns total payments made by a customer';

COMMENT ON FUNCTION financial.get_customer_total_invoices(INTEGER) IS 
'Returns total invoice amount for a customer';

COMMENT ON FUNCTION financial.get_customer_net_position(INTEGER) IS 
'Returns net position: positive = customer owes, negative = we owe customer';

-- Example usage:
-- SELECT financial.get_customer_total_payments(109);
-- SELECT financial.get_customer_total_invoices(109);
-- SELECT financial.get_customer_net_position(109);