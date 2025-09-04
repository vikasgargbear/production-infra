-- Comprehensive view for all customer payments and their allocation details
-- This shows every payment made by customers with allocation breakdown

CREATE OR REPLACE VIEW financial.customer_payment_history AS
WITH payment_details AS (
    SELECT 
        p.payment_id,
        p.org_id,
        p.party_id AS customer_id,
        c.customer_name,
        c.customer_code,
        p.payment_number,
        p.payment_date,
        p.payment_amount,
        COALESCE(p.allocated_amount, 0) AS allocated_amount,
        (p.payment_amount - COALESCE(p.allocated_amount, 0)) AS unallocated_amount,
        p.payment_method_id,
        pm.method_name AS payment_method,
        p.reference_number,
        p.narration,
        p.payment_status,
        p.allocation_status,
        p.created_at,
        p.created_by,
        -- Get allocation details
        CASE 
            WHEN p.allocated_amount > 0 THEN
                (SELECT jsonb_agg(
                    jsonb_build_object(
                        'allocation_id', pa.allocation_id,
                        'invoice_id', pa.reference_id,
                        'invoice_number', pa.reference_number,
                        'allocated_amount', pa.allocated_amount,
                        'allocation_date', pa.created_at::date
                    ) ORDER BY pa.created_at
                )
                FROM financial.payment_allocations pa
                WHERE pa.payment_id = p.payment_id
                AND pa.allocation_status = 'active')
            ELSE NULL
        END AS allocations
    FROM financial.payments p
    JOIN parties.customers c ON c.customer_id = p.party_id
    LEFT JOIN financial.payment_methods pm ON pm.payment_method_id = p.payment_method_id
    WHERE p.party_type = 'customer'
)
SELECT * FROM payment_details
ORDER BY payment_date DESC, payment_id DESC;

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_payments_party_date 
ON financial.payments(party_id, payment_date DESC) 
WHERE party_type = 'customer';

-- Grant permissions
GRANT SELECT ON financial.customer_payment_history TO postgres;

-- Comment on the view
COMMENT ON VIEW financial.customer_payment_history IS 
'Complete payment history for customers including allocation details to invoices';