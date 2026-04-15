-- Customer Ledger View showing all transactions (invoices and payments) with running balance
-- Positive balance = Customer owes, Negative = We owe customer (advance)

CREATE OR REPLACE VIEW financial.customer_ledger AS
WITH transactions AS (
    -- Invoices (Debit entries - increase what customer owes)
    SELECT 
        i.customer_id,
        i.invoice_date AS transaction_date,
        'INVOICE' AS transaction_type,
        i.invoice_id AS document_id,
        i.invoice_number AS document_number,
        'Invoice raised' AS description,
        i.final_amount AS debit_amount,
        0::NUMERIC AS credit_amount,
        i.created_at,
        1 AS sort_order -- Invoices come first for same date
    FROM sales.invoices i
    WHERE i.invoice_status != 'cancelled'
    
    UNION ALL
    
    -- Payments (Credit entries - reduce what customer owes)
    SELECT 
        p.party_id AS customer_id,
        p.payment_date AS transaction_date,
        'PAYMENT' AS transaction_type,
        p.payment_id AS document_id,
        p.payment_number AS document_number,
        COALESCE(p.narration, 'Payment received') AS description,
        0::NUMERIC AS debit_amount,
        p.payment_amount AS credit_amount,
        p.created_at,
        2 AS sort_order -- Payments come second for same date
    FROM financial.payments p
    WHERE p.party_type = 'customer'
    AND p.payment_status = 'cleared'
    
    UNION ALL
    
    -- Credit Notes (Credit entries - reduce what customer owes)
    SELECT 
        cn.customer_id,
        cn.credit_note_date AS transaction_date,
        'CREDIT_NOTE' AS transaction_type,
        cn.credit_note_id AS document_id,
        cn.credit_note_number AS document_number,
        COALESCE(cn.reason, 'Credit note issued') AS description,
        0::NUMERIC AS debit_amount,
        cn.credit_amount AS credit_amount,
        cn.created_at,
        3 AS sort_order
    FROM financial.credit_notes cn
    WHERE cn.status = 'approved'
    
    UNION ALL
    
    -- Debit Notes (Debit entries - increase what customer owes)
    SELECT 
        dn.customer_id,
        dn.debit_note_date AS transaction_date,
        'DEBIT_NOTE' AS transaction_type,
        dn.debit_note_id AS document_id,
        dn.debit_note_number AS document_number,
        COALESCE(dn.reason, 'Debit note issued') AS description,
        dn.debit_amount AS debit_amount,
        0::NUMERIC AS credit_amount,
        dn.created_at,
        4 AS sort_order
    FROM financial.debit_notes dn
    WHERE dn.status = 'approved'
)
SELECT 
    t.customer_id,
    c.customer_name,
    c.customer_code,
    t.transaction_date,
    t.transaction_type,
    t.document_id,
    t.document_number,
    t.description,
    t.debit_amount,
    t.credit_amount,
    -- Calculate running balance
    SUM(t.debit_amount - t.credit_amount) OVER (
        PARTITION BY t.customer_id 
        ORDER BY t.transaction_date, t.sort_order, t.created_at
    ) AS running_balance
FROM transactions t
JOIN parties.customers c ON c.customer_id = t.customer_id
ORDER BY t.customer_id, t.transaction_date DESC, t.sort_order DESC, t.created_at DESC;

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_customer_date 
ON sales.invoices(customer_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_financial_credit_notes_customer_date 
ON financial.credit_notes(customer_id, credit_note_date DESC) 
WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS idx_financial_debit_notes_customer_date 
ON financial.debit_notes(customer_id, debit_note_date DESC) 
WHERE status = 'approved';

-- Grant permissions
GRANT SELECT ON financial.customer_ledger TO postgres;

-- Comment on the view
COMMENT ON VIEW financial.customer_ledger IS 
'Complete customer ledger showing all transactions (invoices, payments, credit/debit notes) with running balance';
