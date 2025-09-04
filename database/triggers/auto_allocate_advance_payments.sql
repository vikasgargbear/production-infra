-- Trigger to automatically allocate advance payments when new invoices are created
-- This ensures advance payments are applied to invoices automatically

CREATE OR REPLACE FUNCTION allocate_advance_payments_to_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_remaining_invoice_amount NUMERIC;
    v_payment_record RECORD;
    v_allocation_amount NUMERIC;
BEGIN
    -- Only process if invoice has outstanding amount
    IF NEW.payment_status IN ('unpaid', 'partial') AND 
       NEW.final_amount > COALESCE(NEW.paid_amount, 0) THEN
        
        v_remaining_invoice_amount := NEW.final_amount - COALESCE(NEW.paid_amount, 0);
        
        -- Find unallocated or partially allocated advance payments for this customer
        FOR v_payment_record IN 
            SELECT 
                payment_id,
                payment_number,
                payment_amount,
                COALESCE(allocated_amount, 0) as allocated_amount,
                (payment_amount - COALESCE(allocated_amount, 0)) as unallocated_amount
            FROM financial.payments
            WHERE party_type = 'customer'
                AND party_id = NEW.customer_id
                AND payment_status = 'cleared'
                AND allocation_status IN ('unallocated', 'partial')
                AND (payment_amount - COALESCE(allocated_amount, 0)) > 0
            ORDER BY payment_date, payment_id  -- FIFO: oldest payments first
        LOOP
            -- Exit if invoice is fully paid
            IF v_remaining_invoice_amount <= 0 THEN
                EXIT;
            END IF;
            
            -- Calculate allocation amount (min of remaining invoice amount and unallocated payment)
            v_allocation_amount := LEAST(v_remaining_invoice_amount, v_payment_record.unallocated_amount);
            
            -- Create allocation record
            INSERT INTO financial.payment_allocations (
                payment_id,
                reference_type,
                reference_id,
                reference_number,
                allocated_amount,
                created_by,
                created_at
            ) VALUES (
                v_payment_record.payment_id,
                'INVOICE',
                NEW.invoice_id,
                NEW.invoice_number,
                v_allocation_amount,
                COALESCE(NEW.created_by, 1),  -- Use invoice creator or system user
                CURRENT_TIMESTAMP
            );
            
            -- Update payment allocation status and amount
            UPDATE financial.payments
            SET 
                allocated_amount = COALESCE(allocated_amount, 0) + v_allocation_amount,
                allocation_status = CASE
                    WHEN (COALESCE(allocated_amount, 0) + v_allocation_amount) >= payment_amount THEN 'allocated'
                    ELSE 'partial'
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = v_payment_record.payment_id;
            
            -- Update remaining invoice amount
            v_remaining_invoice_amount := v_remaining_invoice_amount - v_allocation_amount;
            
            -- Update invoice paid amount
            UPDATE sales.invoices
            SET 
                paid_amount = COALESCE(paid_amount, 0) + v_allocation_amount,
                payment_status = CASE
                    WHEN (COALESCE(paid_amount, 0) + v_allocation_amount) >= final_amount THEN 'paid'
                    ELSE 'partial'
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = NEW.invoice_id;
            
            RAISE NOTICE 'Auto-allocated % from payment % to invoice %', 
                v_allocation_amount, v_payment_record.payment_number, NEW.invoice_number;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on invoice insert
DROP TRIGGER IF EXISTS trigger_allocate_advance_payments ON sales.invoices;
CREATE TRIGGER trigger_allocate_advance_payments
    AFTER INSERT ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION allocate_advance_payments_to_invoice();

-- Also trigger on invoice update (in case invoice amount changes)
DROP TRIGGER IF EXISTS trigger_allocate_advance_payments_update ON sales.invoices;
CREATE TRIGGER trigger_allocate_advance_payments_update
    AFTER UPDATE OF final_amount, payment_status ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.payment_status IN ('unpaid', 'partial'))
    EXECUTE FUNCTION allocate_advance_payments_to_invoice();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION allocate_advance_payments_to_invoice() TO postgres;