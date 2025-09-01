#!/bin/bash

# Quick script to apply customer_outstanding triggers via Railway
# Run this AFTER doing: railway login

echo "Applying customer_outstanding triggers..."

# Get DATABASE_URL from Railway
DB_URL=$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")

if [ -z "$DB_URL" ]; then
    echo "Error: Unable to get DATABASE_URL from Railway"
    exit 1
fi

# Apply just the essential trigger
psql "$DB_URL" << 'EOF'
-- Create trigger for new invoices
CREATE OR REPLACE FUNCTION financial.create_customer_outstanding_on_invoice()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO financial.customer_outstanding (
        org_id, customer_id, document_type, document_id,
        document_number, document_date, original_amount,
        outstanding_amount, paid_amount, due_date, status
    )
    SELECT
        NEW.org_id,
        NEW.customer_id::INTEGER,
        'INVOICE',
        NEW.invoice_id,
        NEW.invoice_number,
        NEW.invoice_date,
        NEW.final_amount,
        COALESCE(NEW.credit_amount, NEW.final_amount - COALESCE(NEW.paid_amount, 0)),
        COALESCE(NEW.paid_amount, 0),
        COALESCE(NEW.due_date, NEW.invoice_date + INTERVAL '30 days'),
        CASE 
            WHEN COALESCE(NEW.credit_amount, 0) <= 0 THEN 'paid'
            WHEN COALESCE(NEW.paid_amount, 0) > 0 THEN 'partial'
            ELSE 'open'
        END
    ON CONFLICT (org_id, document_type, document_id) 
    DO UPDATE SET
        outstanding_amount = EXCLUDED.outstanding_amount,
        paid_amount = EXCLUDED.paid_amount,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_customer_outstanding ON sales.invoices;
CREATE TRIGGER trigger_create_customer_outstanding
AFTER INSERT OR UPDATE ON sales.invoices
FOR EACH ROW
EXECUTE FUNCTION financial.create_customer_outstanding_on_invoice();

-- Populate existing invoices
INSERT INTO financial.customer_outstanding (
    org_id, customer_id, document_type, document_id,
    document_number, document_date, original_amount,
    outstanding_amount, paid_amount, due_date, status
)
SELECT
    org_id,
    customer_id::INTEGER,
    'INVOICE',
    invoice_id,
    invoice_number,
    invoice_date,
    final_amount,
    COALESCE(credit_amount, final_amount - COALESCE(paid_amount, 0)),
    COALESCE(paid_amount, 0),
    COALESCE(due_date, invoice_date + INTERVAL '30 days'),
    CASE 
        WHEN COALESCE(credit_amount, 0) <= 0 THEN 'paid'
        WHEN COALESCE(paid_amount, 0) > 0 THEN 'partial'
        ELSE 'open'
    END
FROM sales.invoices
WHERE invoice_id = 289
ON CONFLICT DO NOTHING;

-- Check results
SELECT 
    'Invoice 289 in outstanding' as check,
    outstanding_amount,
    paid_amount,
    status
FROM financial.customer_outstanding
WHERE document_id = 289;
EOF

echo "Done! Checking results..."
psql "$DB_URL" -c "SELECT COUNT(*) as total FROM financial.customer_outstanding WHERE document_type = 'INVOICE';"