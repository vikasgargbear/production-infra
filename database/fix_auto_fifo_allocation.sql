-- Fix Auto-FIFO to prevent re-allocating to same invoice
-- This ensures FIFO properly applies to oldest UNPAID invoices

CREATE OR REPLACE FUNCTION financial.auto_allocate_payment(
    p_payment_id INTEGER,
    p_allocation_type TEXT DEFAULT 'fifo'
) RETURNS TABLE (
    invoice_id INTEGER,
    allocated_amount NUMERIC(15,2)
) AS $$
DECLARE
    v_payment RECORD;
    v_invoice RECORD;
    v_remaining_amount NUMERIC(15,2);
    v_to_allocate NUMERIC(15,2);
    v_already_allocated NUMERIC(15,2);
BEGIN
    -- Get payment details
    SELECT * INTO v_payment
    FROM financial.payments
    WHERE payment_id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;

    -- Calculate remaining unallocated amount for this payment
    SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_already_allocated
    FROM financial.payment_allocations pa
    WHERE pa.payment_id = p_payment_id;

    v_remaining_amount := v_payment.payment_amount - v_already_allocated;

    IF v_remaining_amount <= 0 THEN
        RETURN; -- Nothing to allocate
    END IF;

    -- Get unpaid invoices for the party (FIFO - oldest first)
    -- IMPORTANT: Exclude invoices that already have allocations from THIS payment
    FOR v_invoice IN
        SELECT
            i.invoice_id,
            i.final_amount,
            COALESCE(i.allocated_amount, 0) as total_allocated,
            COALESCE(existing_alloc.amount_from_this_payment, 0) as already_from_this_payment
        FROM sales.invoices i
        LEFT JOIN (
            -- Check if this payment already has allocations to this invoice
            SELECT
                pa.invoice_id,
                SUM(pa.allocated_amount) as amount_from_this_payment
            FROM financial.payment_allocations pa
            WHERE pa.payment_id = p_payment_id
            GROUP BY pa.invoice_id
        ) existing_alloc ON existing_alloc.invoice_id = i.invoice_id
        WHERE i.customer_id = v_payment.party_id
        AND i.payment_status != 'paid'
        AND i.invoice_status != 'cancelled'
        -- Skip invoices that already have allocations from this payment
        AND COALESCE(existing_alloc.amount_from_this_payment, 0) = 0
        ORDER BY
            CASE WHEN p_allocation_type = 'fifo' THEN i.invoice_date END ASC,
            CASE WHEN p_allocation_type = 'lifo' THEN i.invoice_date END DESC,
            i.invoice_id
    LOOP
        -- Calculate amount still due on this invoice
        v_to_allocate := LEAST(
            v_remaining_amount,
            v_invoice.final_amount - v_invoice.total_allocated
        );

        IF v_to_allocate > 0 THEN
            -- Create allocation
            INSERT INTO financial.payment_allocations (
                org_id, payment_id, invoice_id, allocated_amount, allocation_type, created_by
            )
            SELECT
                v_payment.org_id,
                p_payment_id,
                v_invoice.invoice_id,
                v_to_allocate,
                p_allocation_type,
                1  -- Default user, should be passed as parameter in production
            WHERE NOT EXISTS (
                -- Double-check to prevent race conditions
                SELECT 1 FROM financial.payment_allocations
                WHERE payment_id = p_payment_id
                AND invoice_id = v_invoice.invoice_id
            );

            -- Return this allocation
            invoice_id := v_invoice.invoice_id;
            allocated_amount := v_to_allocate;
            RETURN NEXT;

            -- Update remaining amount
            v_remaining_amount := v_remaining_amount - v_to_allocate;

            -- Exit if no more to allocate
            EXIT WHEN v_remaining_amount <= 0;
        END IF;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financial.auto_allocate_payment IS
'Automatically allocates a payment to outstanding invoices using FIFO or LIFO method.
Fixed to prevent re-allocating to the same invoice and properly handle existing allocations.';

-- Test query to verify FIFO order
-- This shows invoices in FIFO order for a customer
/*
SELECT
    i.invoice_id,
    i.invoice_number,
    i.invoice_date,
    i.final_amount,
    COALESCE(i.allocated_amount, 0) as allocated,
    i.final_amount - COALESCE(i.allocated_amount, 0) as due,
    i.payment_status,
    CASE
        WHEN i.payment_status = 'paid' THEN 'Skip - Fully Paid'
        WHEN i.final_amount - COALESCE(i.allocated_amount, 0) <= 0 THEN 'Skip - No Due'
        ELSE 'Allocate'
    END as fifo_action
FROM sales.invoices i
WHERE i.customer_id = 123  -- Replace with actual customer
AND i.invoice_status != 'cancelled'
ORDER BY i.invoice_date ASC, i.invoice_id ASC;
*/