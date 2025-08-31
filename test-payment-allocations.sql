-- Test Payment Allocations for Party Ledger
-- This script creates sample payment data with allocations to demonstrate partial payments

-- First, let's check what invoices exist for Garg Medical Store (customer_id = 108)
SELECT invoice_id, invoice_number, invoice_date, final_amount, paid_amount, payment_status
FROM sales.invoices
WHERE customer_id = 108
ORDER BY invoice_date DESC
LIMIT 5;

-- Create test payments if financial.payments table exists
-- Payment 1: Full payment for one invoice
INSERT INTO financial.payments (
    org_id,
    branch_id,
    payment_number,
    payment_date,
    payment_type,
    party_type,
    party_id,
    party_name,
    payment_amount,
    payment_method_id,
    payment_status,
    narration,
    created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    1,
    'PAY-2024-001',
    '2024-01-15',
    'receipt',
    'customer',
    108,
    'Garg Medical Store',
    5000.00,
    1,
    'completed',
    'Full payment for January invoice',
    1
) ON CONFLICT DO NOTHING;

-- Payment 2: Partial payment
INSERT INTO financial.payments (
    org_id,
    branch_id,
    payment_number,
    payment_date,
    payment_type,
    party_type,
    party_id,
    party_name,
    payment_amount,
    payment_method_id,
    payment_status,
    narration,
    created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    1,
    'PAY-2024-002',
    '2024-01-20',
    'receipt',
    'customer',
    108,
    'Garg Medical Store',
    3000.00,
    1,
    'completed',
    'Partial payment - on account',
    1
) ON CONFLICT DO NOTHING;

-- Payment 3: Another partial payment
INSERT INTO financial.payments (
    org_id,
    branch_id,
    payment_number,
    payment_date,
    payment_type,
    party_type,
    party_id,
    party_name,
    payment_amount,
    payment_method_id,
    payment_status,
    narration,
    created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    1,
    'PAY-2024-003',
    '2024-02-05',
    'receipt',
    'customer',
    108,
    'Garg Medical Store',
    7500.00,
    1,
    'completed',
    'Payment for February invoices',
    1
) ON CONFLICT DO NOTHING;

-- Now create allocations if the table exists
-- Get payment IDs and invoice IDs for allocations
DO $$
DECLARE
    payment1_id INTEGER;
    payment2_id INTEGER;
    payment3_id INTEGER;
    invoice1_id INTEGER;
    invoice2_id INTEGER;
    invoice3_id INTEGER;
BEGIN
    -- Get payment IDs
    SELECT payment_id INTO payment1_id FROM financial.payments WHERE payment_number = 'PAY-2024-001' LIMIT 1;
    SELECT payment_id INTO payment2_id FROM financial.payments WHERE payment_number = 'PAY-2024-002' LIMIT 1;
    SELECT payment_id INTO payment3_id FROM financial.payments WHERE payment_number = 'PAY-2024-003' LIMIT 1;
    
    -- Get invoice IDs for customer 108
    SELECT invoice_id INTO invoice1_id FROM sales.invoices WHERE customer_id = 108 ORDER BY invoice_date DESC LIMIT 1 OFFSET 0;
    SELECT invoice_id INTO invoice2_id FROM sales.invoices WHERE customer_id = 108 ORDER BY invoice_date DESC LIMIT 1 OFFSET 1;
    SELECT invoice_id INTO invoice3_id FROM sales.invoices WHERE customer_id = 108 ORDER BY invoice_date DESC LIMIT 1 OFFSET 2;
    
    -- Create allocations if we have the data
    IF payment1_id IS NOT NULL AND invoice1_id IS NOT NULL THEN
        INSERT INTO financial.payment_allocations (
            payment_id,
            reference_type,
            reference_id,
            reference_number,
            allocated_amount,
            allocation_status,
            created_by
        ) VALUES (
            payment1_id,
            'invoice',
            invoice1_id,
            (SELECT invoice_number FROM sales.invoices WHERE invoice_id = invoice1_id),
            5000.00,
            'allocated',
            1
        ) ON CONFLICT DO NOTHING;
    END IF;
    
    IF payment2_id IS NOT NULL AND invoice2_id IS NOT NULL THEN
        INSERT INTO financial.payment_allocations (
            payment_id,
            reference_type,
            reference_id,
            reference_number,
            allocated_amount,
            allocation_status,
            created_by
        ) VALUES (
            payment2_id,
            'invoice',
            invoice2_id,
            (SELECT invoice_number FROM sales.invoices WHERE invoice_id = invoice2_id),
            3000.00,
            'allocated',
            1
        ) ON CONFLICT DO NOTHING;
    END IF;
    
    IF payment3_id IS NOT NULL THEN
        -- Allocate to multiple invoices
        IF invoice2_id IS NOT NULL THEN
            INSERT INTO financial.payment_allocations (
                payment_id,
                reference_type,
                reference_id,
                reference_number,
                allocated_amount,
                allocation_status,
                created_by
            ) VALUES (
                payment3_id,
                'invoice',
                invoice2_id,
                (SELECT invoice_number FROM sales.invoices WHERE invoice_id = invoice2_id),
                4000.00,
                'allocated',
                1
            ) ON CONFLICT DO NOTHING;
        END IF;
        
        IF invoice3_id IS NOT NULL THEN
            INSERT INTO financial.payment_allocations (
                payment_id,
                reference_type,
                reference_id,
                reference_number,
                allocated_amount,
                allocation_status,
                created_by
            ) VALUES (
                payment3_id,
                'invoice',
                invoice3_id,
                (SELECT invoice_number FROM sales.invoices WHERE invoice_id = invoice3_id),
                3500.00,
                'allocated',
                1
            ) ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;

-- Create a sample sales return (credit note)
INSERT INTO sales.sales_returns (
    org_id,
    return_number,
    return_date,
    customer_id,
    invoice_id,
    return_amount,
    return_reason,
    return_status,
    created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a',
    'CRN-2024-001',
    '2024-01-25',
    108,
    (SELECT invoice_id FROM sales.invoices WHERE customer_id = 108 LIMIT 1),
    1500.00,
    'Damaged goods returned',
    'approved',
    1
) ON CONFLICT DO NOTHING;

-- Now let's see the comprehensive ledger
SELECT 
    date,
    transaction_type,
    reference,
    description,
    debit,
    credit,
    running_balance
FROM (
    -- The same query our API uses
    WITH ledger_entries AS (
        -- Invoices
        SELECT 
            invoice_id as ledger_id,
            invoice_date as date,
            'Invoice' as transaction_type,
            invoice_number as reference,
            CONCAT('Invoice ', invoice_number) as description,
            final_amount as debit,
            0 as credit
        FROM sales.invoices
        WHERE customer_id = 108
        AND invoice_status != 'cancelled'
        
        UNION ALL
        
        -- Payments
        SELECT 
            payment_id as ledger_id,
            payment_date as date,
            'Payment' as transaction_type,
            payment_number as reference,
            COALESCE(narration, 'Payment Received') as description,
            0 as debit,
            payment_amount as credit
        FROM financial.payments
        WHERE party_id = 108 AND party_type = 'customer'
        AND payment_status != 'cancelled'
        
        UNION ALL
        
        -- Sales Returns
        SELECT 
            return_id as ledger_id,
            return_date as date,
            'Credit Note' as transaction_type,
            return_number as reference,
            CONCAT('Sales Return ', return_number, ' - ', return_reason) as description,
            0 as debit,
            return_amount as credit
        FROM sales.sales_returns
        WHERE customer_id = 108
        AND return_status != 'cancelled'
    )
    SELECT * FROM ledger_entries
    ORDER BY date ASC
) AS ledger_with_balance;