-- View to track customer advance balances (unallocated payments)
-- This shows how much advance/credit each customer has

CREATE OR REPLACE VIEW financial.customer_advance_balance AS
SELECT 
    p.party_id AS customer_id,
    c.customer_name,
    c.customer_code,
    -- Total unallocated amount across all payments
    SUM(p.payment_amount - COALESCE(p.allocated_amount, 0)) AS advance_balance,
    -- Number of payments with unallocated amounts
    COUNT(CASE WHEN p.payment_amount > COALESCE(p.allocated_amount, 0) THEN 1 END) AS advance_payment_count,
    -- Details of unallocated payments
    ARRAY_AGG(
        CASE 
            WHEN p.payment_amount > COALESCE(p.allocated_amount, 0) THEN
                jsonb_build_object(
                    'payment_id', p.payment_id,
                    'payment_number', p.payment_number,
                    'payment_date', p.payment_date,
                    'payment_amount', p.payment_amount,
                    'allocated_amount', COALESCE(p.allocated_amount, 0),
                    'unallocated_amount', p.payment_amount - COALESCE(p.allocated_amount, 0)
                )
            ELSE NULL
        END
    ) FILTER (WHERE p.payment_amount > COALESCE(p.allocated_amount, 0)) AS advance_payments
FROM financial.payments p
JOIN parties.customers c ON c.customer_id = p.party_id
WHERE p.party_type = 'customer'
    AND p.payment_status = 'cleared'
    AND p.payment_amount > COALESCE(p.allocated_amount, 0)
GROUP BY p.party_id, c.customer_name, c.customer_code;

-- Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_payments_unallocated 
ON financial.payments(party_id, party_type) 
WHERE payment_status = 'cleared' AND payment_amount > COALESCE(allocated_amount, 0);

-- Grant permissions
GRANT SELECT ON financial.customer_advance_balance TO postgres;

-- Comment on the view
COMMENT ON VIEW financial.customer_advance_balance IS 'Tracks advance payment balances (unallocated amounts) for each customer';