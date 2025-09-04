-- Function to get complete payment summary for a customer
-- Provides total payments, allocations, and period-wise breakdowns

CREATE OR REPLACE FUNCTION financial.get_customer_payment_summary(
    p_customer_id INTEGER,
    p_from_date DATE DEFAULT NULL,
    p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
    customer_id INTEGER,
    customer_name TEXT,
    period_start DATE,
    period_end DATE,
    -- Payment totals
    total_payments NUMERIC(15,2),
    payment_count INTEGER,
    -- Allocation breakdown
    allocated_to_invoices NUMERIC(15,2),
    unallocated_amount NUMERIC(15,2),
    -- Payment method breakdown
    cash_payments NUMERIC(15,2),
    bank_payments NUMERIC(15,2),
    upi_payments NUMERIC(15,2),
    card_payments NUMERIC(15,2),
    cheque_payments NUMERIC(15,2),
    -- Period comparisons
    avg_payment_amount NUMERIC(15,2),
    max_payment_amount NUMERIC(15,2),
    last_payment_date DATE,
    last_payment_amount NUMERIC(15,2)
) AS $$
BEGIN
    -- Set date range defaults if not provided
    p_from_date := COALESCE(p_from_date, '2000-01-01'::DATE);
    p_to_date := COALESCE(p_to_date, CURRENT_DATE);
    
    RETURN QUERY
    WITH payment_data AS (
        SELECT 
            p.party_id AS customer_id,
            p.payment_date,
            p.payment_amount,
            p.allocated_amount,
            pm.method_code
        FROM financial.payments p
        LEFT JOIN financial.payment_methods pm ON pm.payment_method_id = p.payment_method_id
        WHERE p.party_id = p_customer_id
        AND p.party_type = 'customer'
        AND p.payment_status = 'cleared'
        AND p.payment_date BETWEEN p_from_date AND p_to_date
    ),
    payment_summary AS (
        SELECT 
            pd.customer_id,
            COUNT(*) AS payment_count,
            SUM(pd.payment_amount) AS total_payments,
            SUM(COALESCE(pd.allocated_amount, 0)) AS allocated_to_invoices,
            SUM(pd.payment_amount - COALESCE(pd.allocated_amount, 0)) AS unallocated_amount,
            -- Payment method breakdown
            SUM(CASE WHEN LOWER(pd.method_code) = 'cash' THEN pd.payment_amount ELSE 0 END) AS cash_payments,
            SUM(CASE WHEN LOWER(pd.method_code) IN ('bank', 'bank_transfer', 'neft', 'rtgs', 'imps') 
                THEN pd.payment_amount ELSE 0 END) AS bank_payments,
            SUM(CASE WHEN LOWER(pd.method_code) = 'upi' THEN pd.payment_amount ELSE 0 END) AS upi_payments,
            SUM(CASE WHEN LOWER(pd.method_code) IN ('card', 'debit_card', 'credit_card') 
                THEN pd.payment_amount ELSE 0 END) AS card_payments,
            SUM(CASE WHEN LOWER(pd.method_code) IN ('cheque', 'check') THEN pd.payment_amount ELSE 0 END) AS cheque_payments,
            -- Analytics
            AVG(pd.payment_amount) AS avg_payment_amount,
            MAX(pd.payment_amount) AS max_payment_amount,
            MAX(pd.payment_date) AS last_payment_date
        FROM payment_data pd
        GROUP BY pd.customer_id
    ),
    last_payment AS (
        SELECT DISTINCT ON (party_id)
            party_id AS customer_id,
            payment_amount AS last_payment_amount
        FROM financial.payments
        WHERE party_id = p_customer_id
        AND party_type = 'customer'
        AND payment_status = 'cleared'
        ORDER BY party_id, payment_date DESC, payment_id DESC
    )
    SELECT 
        c.customer_id,
        c.customer_name,
        p_from_date AS period_start,
        p_to_date AS period_end,
        COALESCE(ps.total_payments, 0) AS total_payments,
        COALESCE(ps.payment_count, 0)::INTEGER AS payment_count,
        COALESCE(ps.allocated_to_invoices, 0) AS allocated_to_invoices,
        COALESCE(ps.unallocated_amount, 0) AS unallocated_amount,
        COALESCE(ps.cash_payments, 0) AS cash_payments,
        COALESCE(ps.bank_payments, 0) AS bank_payments,
        COALESCE(ps.upi_payments, 0) AS upi_payments,
        COALESCE(ps.card_payments, 0) AS card_payments,
        COALESCE(ps.cheque_payments, 0) AS cheque_payments,
        ROUND(COALESCE(ps.avg_payment_amount, 0), 2) AS avg_payment_amount,
        COALESCE(ps.max_payment_amount, 0) AS max_payment_amount,
        ps.last_payment_date,
        COALESCE(lp.last_payment_amount, 0) AS last_payment_amount
    FROM parties.customers c
    LEFT JOIN payment_summary ps ON ps.customer_id = c.customer_id
    LEFT JOIN last_payment lp ON lp.customer_id = c.customer_id
    WHERE c.customer_id = p_customer_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION financial.get_customer_payment_summary(INTEGER, DATE, DATE) TO postgres;

-- Comment on the function
COMMENT ON FUNCTION financial.get_customer_payment_summary(INTEGER, DATE, DATE) IS 
'Returns comprehensive payment summary for a customer including totals, allocations, and payment method breakdown';

-- Example usage:
-- SELECT * FROM financial.get_customer_payment_summary(109); -- All time
-- SELECT * FROM financial.get_customer_payment_summary(109, '2025-01-01', '2025-01-31'); -- Specific period