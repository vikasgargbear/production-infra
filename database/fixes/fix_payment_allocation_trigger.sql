-- Fix for payment allocation trigger bug
-- The trigger was using NEW.invoice_id but the column is actually reference_id
-- This fix updates the trigger to work correctly with the actual table structure

-- Drop the broken trigger function and recreate it correctly
CREATE OR REPLACE FUNCTION financial.validate_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_amount NUMERIC(15,2);
    v_total_allocated NUMERIC(15,2);
    v_reference_amount NUMERIC(15,2);
    v_reference_allocated NUMERIC(15,2);
BEGIN
    -- Get payment amount
    SELECT payment_amount INTO v_payment_amount
    FROM financial.payments
    WHERE payment_id = NEW.payment_id;
    
    -- Get total already allocated for this payment (excluding current if UPDATE)
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
    FROM financial.payment_allocations
    WHERE payment_id = NEW.payment_id
    AND allocation_id != COALESCE(NEW.allocation_id, -1)
    AND allocation_status = 'active';
    
    -- Check if allocation exceeds payment amount
    IF (v_total_allocated + NEW.allocated_amount) > v_payment_amount THEN
        RAISE EXCEPTION 'Allocation exceeds payment amount. Payment: %, Already allocated: %, Trying to allocate: %',
            v_payment_amount, v_total_allocated, NEW.allocated_amount;
    END IF;
    
    -- Validate based on reference type
    IF NEW.reference_type = 'INVOICE' THEN
        -- Get invoice amount and current allocation
        SELECT final_amount, COALESCE(paid_amount, 0) 
        INTO v_reference_amount, v_reference_allocated
        FROM sales.invoices
        WHERE invoice_id = NEW.reference_id;  -- Use reference_id, not invoice_id
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice % not found', NEW.reference_id;
        END IF;
        
        -- For new allocations, check if it would exceed invoice amount
        IF TG_OP = 'INSERT' THEN
            -- Get total already allocated to this invoice from other payments
            SELECT COALESCE(SUM(allocated_amount), 0) INTO v_reference_allocated
            FROM financial.payment_allocations
            WHERE reference_type = 'INVOICE'
            AND reference_id = NEW.reference_id
            AND allocation_status = 'active';
            
            IF (v_reference_allocated + NEW.allocated_amount) > v_reference_amount THEN
                RAISE EXCEPTION 'Allocation exceeds invoice amount. Invoice: %, Already allocated: %, Trying to allocate: %',
                    v_reference_amount, v_reference_allocated, NEW.allocated_amount;
            END IF;
        END IF;
        
    ELSIF NEW.reference_type = 'PURCHASE_ORDER' THEN
        -- Get purchase order amount and current allocation
        SELECT final_amount, COALESCE(paid_amount, 0) 
        INTO v_reference_amount, v_reference_allocated
        FROM procurement.purchase_orders
        WHERE purchase_order_id = NEW.reference_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Purchase Order % not found', NEW.reference_id;
        END IF;
        
        -- Similar validation for purchase orders
        IF TG_OP = 'INSERT' THEN
            SELECT COALESCE(SUM(allocated_amount), 0) INTO v_reference_allocated
            FROM financial.payment_allocations
            WHERE reference_type = 'PURCHASE_ORDER'
            AND reference_id = NEW.reference_id
            AND allocation_status = 'active';
            
            IF (v_reference_allocated + NEW.allocated_amount) > v_reference_amount THEN
                RAISE EXCEPTION 'Allocation exceeds purchase order amount. PO: %, Already allocated: %, Trying to allocate: %',
                    v_reference_amount, v_reference_allocated, NEW.allocated_amount;
            END IF;
        END IF;
        
    ELSIF NEW.reference_type = 'ADVANCE' THEN
        -- Advance payments don't have a reference document to validate against
        -- Just ensure the allocation doesn't exceed the payment amount (already checked above)
        NULL;
        
    ELSE
        RAISE EXCEPTION 'Invalid reference type: %', NEW.reference_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also create a function to update invoice/PO paid amounts when allocations change
CREATE OR REPLACE FUNCTION financial.update_reference_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
    -- Update paid amount for invoices
    IF (NEW.reference_type = 'INVOICE' OR OLD.reference_type = 'INVOICE') THEN
        UPDATE sales.invoices
        SET paid_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE reference_type = 'INVOICE'
            AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
            AND allocation_status = 'active'
        ),
        credit_amount = final_amount - (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE reference_type = 'INVOICE'
            AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
            AND allocation_status = 'active'
        ),
        payment_status = CASE
            WHEN (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE'
                AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
                AND allocation_status = 'active'
            ) >= final_amount THEN 'paid'
            WHEN (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE'
                AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
                AND allocation_status = 'active'
            ) > 0 THEN 'partial'
            ELSE 'pending'
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE invoice_id = COALESCE(NEW.reference_id, OLD.reference_id);
    END IF;
    
    -- Update paid amount for purchase orders
    IF (NEW.reference_type = 'PURCHASE_ORDER' OR OLD.reference_type = 'PURCHASE_ORDER') THEN
        UPDATE procurement.purchase_orders
        SET paid_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE reference_type = 'PURCHASE_ORDER'
            AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
            AND allocation_status = 'active'
        ),
        payment_status = CASE
            WHEN (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'PURCHASE_ORDER'
                AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
                AND allocation_status = 'active'
            ) >= final_amount THEN 'paid'
            WHEN (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'PURCHASE_ORDER'
                AND reference_id = COALESCE(NEW.reference_id, OLD.reference_id)
                AND allocation_status = 'active'
            ) > 0 THEN 'partial'
            ELSE 'pending'
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE purchase_order_id = COALESCE(NEW.reference_id, OLD.reference_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update paid amounts
DROP TRIGGER IF EXISTS trg_update_reference_paid_amount ON financial.payment_allocations;
CREATE TRIGGER trg_update_reference_paid_amount
AFTER INSERT OR UPDATE OR DELETE ON financial.payment_allocations
FOR EACH ROW
EXECUTE FUNCTION financial.update_reference_paid_amount();

-- Test the fix by checking existing allocations
SELECT 
    pa.allocation_id,
    pa.payment_id,
    pa.reference_type,
    pa.reference_id,
    pa.allocated_amount,
    p.payment_amount,
    CASE 
        WHEN pa.reference_type = 'INVOICE' THEN i.invoice_number
        ELSE pa.reference_number
    END as reference_number
FROM financial.payment_allocations pa
JOIN financial.payments p ON pa.payment_id = p.payment_id
LEFT JOIN sales.invoices i ON pa.reference_type = 'INVOICE' AND pa.reference_id = i.invoice_id
WHERE pa.allocation_status = 'active'
LIMIT 10;