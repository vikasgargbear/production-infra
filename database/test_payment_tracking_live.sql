-- Live test of payment tracking implementation
-- This script tests if our payment tracking is working correctly

-- 1. First, check if we have recent invoices with payments
SELECT '=== RECENT INVOICES WITH PAYMENTS ===' as test_section;

SELECT 
    i.invoice_number,
    i.invoice_date,
    i.final_amount,
    i.paid_amount,
    i.credit_amount,
    i.payment_status,
    CASE 
        WHEN i.paid_amount > 0 THEN 'Has Payment'
        ELSE 'No Payment'
    END as payment_check
FROM sales.invoices i
WHERE i.created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY i.created_at DESC
LIMIT 5;

-- 2. Check if payments are being created
SELECT '=== PAYMENTS CREATED TODAY ===' as test_section;

SELECT 
    p.payment_id,
    p.payment_date,
    p.payment_method,
    p.payment_amount,
    p.reference_type,
    p.reference_number,
    p.allocation_status
FROM financial.payments p
WHERE p.created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY p.created_at DESC
LIMIT 5;

-- 3. Check if payment allocations are being created
SELECT '=== PAYMENT ALLOCATIONS TODAY ===' as test_section;

SELECT 
    pa.allocation_id,
    pa.payment_id,
    pa.reference_type,
    pa.reference_number,
    pa.allocated_amount,
    pa.allocation_status
FROM financial.payment_allocations pa
WHERE pa.created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY pa.created_at DESC
LIMIT 5;

-- 4. Check if customer outstanding is being tracked
SELECT '=== CUSTOMER OUTSTANDING TODAY ===' as test_section;

SELECT 
    co.outstanding_id,
    co.document_type,
    co.document_number,
    co.original_amount,
    co.paid_amount,
    co.outstanding_amount,
    co.status
FROM financial.customer_outstanding co
WHERE co.created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY co.created_at DESC
LIMIT 5;

-- 5. Join to see complete picture for recent invoices
SELECT '=== COMPLETE PAYMENT TRACKING VIEW ===' as test_section;

SELECT 
    i.invoice_number,
    i.final_amount as invoice_total,
    i.paid_amount as invoice_paid,
    COUNT(DISTINCT p.payment_id) as payment_count,
    COALESCE(SUM(pa.allocated_amount), 0) as total_allocated,
    co.outstanding_amount,
    CASE 
        WHEN i.paid_amount = COALESCE(SUM(pa.allocated_amount), 0) THEN '✓ Payments Match'
        ELSE '✗ Mismatch'
    END as payment_verification,
    CASE 
        WHEN i.credit_amount = co.outstanding_amount THEN '✓ Outstanding Match'
        WHEN co.outstanding_amount IS NULL THEN '✗ No Outstanding Record'
        ELSE '✗ Mismatch'
    END as outstanding_verification
FROM sales.invoices i
LEFT JOIN financial.payments p 
    ON p.reference_type = 'INVOICE' 
    AND p.reference_id = i.invoice_id
LEFT JOIN financial.payment_allocations pa 
    ON pa.reference_type = 'INVOICE' 
    AND pa.reference_id = i.invoice_id
LEFT JOIN financial.customer_outstanding co 
    ON co.document_type = 'INVOICE' 
    AND co.document_id = i.invoice_id
WHERE i.created_at >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY i.invoice_id, i.invoice_number, i.final_amount, i.paid_amount, 
         i.credit_amount, co.outstanding_amount
ORDER BY i.created_at DESC
LIMIT 10;

-- 6. Summary statistics
SELECT '=== SUMMARY STATISTICS ===' as test_section;

WITH stats AS (
    SELECT 
        COUNT(DISTINCT i.invoice_id) as invoices_today,
        COUNT(DISTINCT p.payment_id) as payments_today,
        COUNT(DISTINCT pa.allocation_id) as allocations_today,
        COUNT(DISTINCT co.outstanding_id) as outstanding_records_today
    FROM sales.invoices i
    LEFT JOIN financial.payments p 
        ON p.created_at >= CURRENT_DATE - INTERVAL '1 day'
    LEFT JOIN financial.payment_allocations pa 
        ON pa.created_at >= CURRENT_DATE - INTERVAL '1 day'
    LEFT JOIN financial.customer_outstanding co 
        ON co.created_at >= CURRENT_DATE - INTERVAL '1 day'
    WHERE i.created_at >= CURRENT_DATE - INTERVAL '1 day'
)
SELECT 
    invoices_today,
    payments_today,
    allocations_today,
    outstanding_records_today,
    CASE 
        WHEN payments_today > 0 AND allocations_today > 0 AND outstanding_records_today > 0 
        THEN '✓ All systems working!'
        WHEN payments_today = 0 
        THEN '✗ No payments being created'
        WHEN allocations_today = 0 
        THEN '✗ No allocations being created'
        WHEN outstanding_records_today = 0 
        THEN '✗ No outstanding records being created'
        ELSE '⚠ Partial implementation'
    END as status
FROM stats;