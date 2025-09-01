#!/bin/bash

# Apply the invoice to customer_outstanding trigger

echo "Applying invoice to customer_outstanding trigger..."

# Get the database URL from Railway
DB_URL=$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")

if [ -z "$DB_URL" ]; then
    echo "Error: Unable to get DATABASE_URL from Railway"
    exit 1
fi

# Apply the trigger
psql "$DB_URL" -f /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/fixes/invoice_to_outstanding_trigger.sql

if [ $? -eq 0 ]; then
    echo "Trigger applied successfully!"
    
    # Show the results
    echo "Checking customer_outstanding data..."
    psql "$DB_URL" -c "
    SELECT 
        'Total Invoices' as metric,
        COUNT(*) as count
    FROM sales.invoices
    UNION ALL
    SELECT 
        'Outstanding Records' as metric,
        COUNT(*) as count
    FROM financial.customer_outstanding
    WHERE document_type = 'INVOICE'
    UNION ALL
    SELECT 
        'Outstanding with Balance' as metric,
        COUNT(*) as count
    FROM financial.customer_outstanding
    WHERE document_type = 'INVOICE' AND outstanding_amount > 0;"
else
    echo "Error applying trigger"
    exit 1
fi