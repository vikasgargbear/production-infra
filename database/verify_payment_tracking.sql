-- Verification script for payment tracking implementation
-- Run this to verify all payment tracking components are working

-- 1. Check if triggers exist and are properly configured
SELECT '=== TRIGGER VERIFICATION ===' as section;

SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'financial'
AND event_object_table IN ('payment_allocations', 'payments')
ORDER BY event_object_table, trigger_name;

-- 2. Check recent payments (last 10)
SELECT '=== RECENT PAYMENTS ===' as section;

SELECT 
    p.payment_id,
    p.payment_date,
    p.payment_method,
    p.payment_amount,
    p.allocated_amount,
    p.unallocated_amount,
    p.allocation_status,
    p.reference_type,
    p.reference_number
FROM financial.payments p
ORDER BY p.created_at DESC
LIMIT 10;

-- 3. Check recent payment allocations
SELECT '=== RECENT PAYMENT ALLOCATIONS ===' as section;

SELECT 
    pa.allocation_id,
    pa.payment_id,
    pa.reference_type,
    pa.reference_number,
    pa.allocated_amount,
    pa.allocation_status,
    pa.created_at
FROM financial.payment_allocations pa
ORDER BY pa.created_at DESC
LIMIT 10;

-- 4. Check invoices with payments
SELECT '=== INVOICES WITH PAYMENT STATUS ===' as section;

SELECT 
    i.invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.customer_id,
    i.final_amount,
    i.paid_amount,
    i.credit_amount,
    i.payment_status,
    CASE 
        WHEN i.credit_amount > 0 THEN 'Has Outstanding'
        ELSE 'Fully Paid'
    END as credit_status
FROM sales.invoices i
WHERE i.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY i.created_at DESC
LIMIT 10;

-- 5. Check customer outstanding records
SELECT '=== CUSTOMER OUTSTANDING ===' as section;

SELECT 
    co.outstanding_id,
    co.customer_id,
    co.document_type,
    co.document_number,
    co.document_date,
    co.original_amount,
    co.paid_amount,
    co.outstanding_amount,
    co.status,
    co.aging_bucket,
    co.due_date
FROM financial.customer_outstanding co
WHERE co.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY co.created_at DESC
LIMIT 10;

-- 6. Payment reconciliation check
SELECT '=== PAYMENT RECONCILIATION ===' as section;

-- Check if invoice amounts match payment allocations
SELECT 
    i.invoice_number,
    i.final_amount as invoice_total,
    i.paid_amount as invoice_paid,
    COALESCE(SUM(pa.allocated_amount), 0) as total_allocated,
    i.credit_amount,
    CASE 
        WHEN i.paid_amount = COALESCE(SUM(pa.allocated_amount), 0) THEN '✓ Matched'
        ELSE '✗ Mismatch'
    END as reconciliation_status
FROM sales.invoices i
LEFT JOIN financial.payment_allocations pa 
    ON pa.reference_type = 'INVOICE' 
    AND pa.reference_id = i.invoice_id
    AND pa.allocation_status = 'active'
WHERE i.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY i.invoice_id, i.invoice_number, i.final_amount, i.paid_amount, i.credit_amount
ORDER BY i.created_at DESC
LIMIT 10;

-- 7. Outstanding vs Invoice reconciliation
SELECT '=== OUTSTANDING VS INVOICE CHECK ===' as section;

SELECT 
    i.invoice_number,
    i.final_amount,
    i.paid_amount,
    i.credit_amount as invoice_credit,
    co.outstanding_amount,
    CASE 
        WHEN i.credit_amount = co.outstanding_amount THEN '✓ Matched'
        ELSE '✗ Mismatch'
    END as outstanding_match
FROM sales.invoices i
LEFT JOIN financial.customer_outstanding co 
    ON co.document_type = 'INVOICE' 
    AND co.document_id = i.invoice_id
WHERE i.created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY i.created_at DESC
LIMIT 10;

-- 8. Summary statistics
SELECT '=== SUMMARY STATISTICS ===' as section;

SELECT 
    'Total Invoices (7 days)' as metric,
    COUNT(*) as value
FROM sales.invoices
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
    'Invoices with Payments' as metric,
    COUNT(*) as value
FROM sales.invoices
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
AND paid_amount > 0

UNION ALL

SELECT 
    'Total Payments Created' as metric,
    COUNT(*) as value
FROM financial.payments
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
    'Total Allocations' as metric,
    COUNT(*) as value
FROM financial.payment_allocations
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
    'Outstanding Records' as metric,
    COUNT(*) as value
FROM financial.customer_outstanding
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
    'Total Outstanding Amount' as metric,
    COALESCE(SUM(outstanding_amount), 0)::bigint as value
FROM financial.customer_outstanding
WHERE status IN ('open', 'partial');

-- 9. Potential issues detection
SELECT '=== POTENTIAL ISSUES ===' as section;

-- Check for invoices without outstanding records (when they have credit)
SELECT 
    'Invoices with credit but no outstanding record' as issue_type,
    COUNT(*) as count
FROM sales.invoices i
LEFT JOIN financial.customer_outstanding co 
    ON co.document_type = 'INVOICE' 
    AND co.document_id = i.invoice_id
WHERE i.credit_amount > 0
AND co.outstanding_id IS NULL

UNION ALL

-- Check for payments without allocations
SELECT 
    'Payments without allocations' as issue_type,
    COUNT(*) as count
FROM financial.payments p
LEFT JOIN financial.payment_allocations pa 
    ON pa.payment_id = p.payment_id
WHERE p.reference_type = 'INVOICE'
AND pa.allocation_id IS NULL

UNION ALL

-- Check for allocation mismatches
SELECT 
    'Payment allocation mismatches' as issue_type,
    COUNT(*) as count
FROM financial.payments p
WHERE p.allocated_amount != (
    SELECT COALESCE(SUM(allocated_amount), 0)
    FROM financial.payment_allocations
    WHERE payment_id = p.payment_id
    AND allocation_status = 'active'
);

-- 10. Test scenario validation
SELECT '=== TEST SCENARIOS ===' as section;

-- Show different payment scenarios from recent invoices
SELECT 
    i.invoice_number,
    i.payment_status,
    i.final_amount,
    COUNT(DISTINCT p.payment_id) as payment_count,
    STRING_AGG(DISTINCT p.payment_method, ', ') as payment_methods,
    SUM(p.payment_amount) as total_paid,
    i.credit_amount,
    CASE 
        WHEN i.payment_status = 'paid' AND i.credit_amount = 0 THEN 'Full Payment'
        WHEN i.payment_status = 'partial' THEN 'Partial Payment'
        WHEN i.payment_status = 'pending' THEN 'No Payment (Credit)'
        WHEN COUNT(DISTINCT p.payment_id) > 1 THEN 'Split Payment'
        ELSE 'Other'
    END as scenario
FROM sales.invoices i
LEFT JOIN financial.payments p 
    ON p.reference_type = 'INVOICE' 
    AND p.reference_id = i.invoice_id
WHERE i.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY i.invoice_id, i.invoice_number, i.payment_status, 
         i.final_amount, i.credit_amount
ORDER BY i.created_at DESC
LIMIT 15;