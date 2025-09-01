#!/bin/bash

echo "========================================"
echo "Verifying Customer Outstanding Setup"
echo "========================================"

# Get DATABASE_URL from Railway
DB_URL=$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")

if [ -z "$DB_URL" ]; then
    echo "Error: Unable to get DATABASE_URL from Railway"
    echo "Make sure you're logged in: railway login"
    echo "And linked to project: railway link"
    exit 1
fi

# 1. Check if invoice 289 is in customer_outstanding
echo ""
echo "1. Checking invoice 289 in customer_outstanding..."
psql "$DB_URL" -c "
SELECT 
    co.outstanding_id,
    co.customer_id,
    co.document_number,
    co.original_amount,
    co.outstanding_amount,
    co.paid_amount,
    co.status,
    co.aging_bucket
FROM financial.customer_outstanding co
WHERE co.document_type = 'INVOICE' 
AND co.document_id = 289;"

# 2. Create a test invoice to verify trigger works
echo ""
echo "2. Creating a test invoice to verify trigger..."
psql "$DB_URL" -c "
-- Create test invoice
INSERT INTO sales.invoices (
    org_id,
    branch_id,
    invoice_number,
    invoice_date,
    customer_id,
    customer_name,
    final_amount,
    paid_amount,
    credit_amount,
    payment_status,
    invoice_status,
    created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    5,
    'TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
    CURRENT_DATE,
    111,
    'Test Customer',
    1000.00,
    300.00,
    700.00,
    'partial',
    'posted',
    7
) RETURNING invoice_id, invoice_number, final_amount, paid_amount, credit_amount;"

# 3. Wait a second for trigger to process
sleep 1

# 4. Check if the test invoice appears in customer_outstanding
echo ""
echo "3. Checking if test invoice appears in customer_outstanding..."
psql "$DB_URL" -c "
SELECT 
    co.document_number,
    co.original_amount,
    co.outstanding_amount,
    co.paid_amount,
    co.status
FROM financial.customer_outstanding co
WHERE co.document_type = 'INVOICE' 
AND co.document_number LIKE 'TEST-%'
ORDER BY co.created_at DESC
LIMIT 1;"

# 5. Summary of all outstanding records
echo ""
echo "4. Summary of customer_outstanding table..."
psql "$DB_URL" -c "
SELECT 
    status,
    COUNT(*) as count,
    SUM(outstanding_amount) as total_outstanding
FROM financial.customer_outstanding
WHERE document_type = 'INVOICE'
GROUP BY status
ORDER BY status;"

# 6. Check trigger status
echo ""
echo "5. Checking if trigger is active..."
psql "$DB_URL" -c "
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_create_customer_outstanding';"

echo ""
echo "========================================"
echo "VERIFICATION COMPLETE"
echo "========================================"
echo "If you see:"
echo "✓ Invoice 289 with outstanding_amount = 256.00"
echo "✓ Test invoice with outstanding_amount = 700.00"
echo "✓ Trigger is active"
echo "Then customer_outstanding is working correctly!"
echo "========================================"