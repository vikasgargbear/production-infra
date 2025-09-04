-- Function to get complete customer balance information
-- Returns outstanding amount (what customer owes) and advance amount (what we owe customer)

CREATE OR REPLACE FUNCTION financial.get_customer_balance(p_customer_id INTEGER)
RETURNS TABLE(
    customer_id INTEGER,
    customer_name TEXT,
    total_outstanding NUMERIC(15,2),
    total_advance NUMERIC(15,2),
    net_balance NUMERIC(15,2),  -- Positive = customer owes, Negative = we owe customer
    outstanding_invoices INTEGER,
    advance_payments INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH outstanding AS (
        -- Calculate total outstanding from unpaid/partially paid invoices
        SELECT 
            co.customer_id,
            COALESCE(SUM(co.outstanding_amount), 0) AS total_outstanding,
            COUNT(*) AS invoice_count
        FROM financial.customer_outstanding co
        WHERE co.customer_id = p_customer_id
            AND co.document_type = 'INVOICE'
            AND co.status IN ('open', 'partial')
            AND co.outstanding_amount > 0
        GROUP BY co.customer_id
    ),
    advances AS (
        -- Calculate total unallocated payments (advances)
        SELECT 
            p.party_id AS customer_id,
            COALESCE(SUM(p.payment_amount - COALESCE(p.allocated_amount, 0)), 0) AS total_advance,
            COUNT(*) AS payment_count
        FROM financial.payments p
        WHERE p.party_id = p_customer_id
            AND p.party_type = 'customer'
            AND p.payment_status = 'cleared'
            AND p.payment_amount > COALESCE(p.allocated_amount, 0)
        GROUP BY p.party_id
    )
    SELECT 
        c.customer_id,
        c.customer_name,
        COALESCE(o.total_outstanding, 0) AS total_outstanding,
        COALESCE(a.total_advance, 0) AS total_advance,
        COALESCE(o.total_outstanding, 0) - COALESCE(a.total_advance, 0) AS net_balance,
        COALESCE(o.invoice_count, 0)::INTEGER AS outstanding_invoices,
        COALESCE(a.payment_count, 0)::INTEGER AS advance_payments
    FROM parties.customers c
    LEFT JOIN outstanding o ON o.customer_id = c.customer_id
    LEFT JOIN advances a ON a.customer_id = c.customer_id
    WHERE c.customer_id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION financial.get_customer_balance(INTEGER) TO postgres;

-- Comment on the function
COMMENT ON FUNCTION financial.get_customer_balance(INTEGER) IS 
'Returns complete balance information for a customer including outstanding invoices and advance payments';

-- Example usage:
-- SELECT * FROM financial.get_customer_balance(109);