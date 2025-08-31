-- Fix for update_allocation_status trigger bug
-- This trigger was also using NEW.invoice_id instead of NEW.reference_id

CREATE OR REPLACE FUNCTION financial.update_allocation_status()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_total NUMERIC(15,2);
    v_payment_allocated NUMERIC(15,2);
    v_reference_total NUMERIC(15,2);
    v_reference_allocated NUMERIC(15,2);
    v_payment_status TEXT;
    v_reference_status TEXT;
BEGIN
    -- Only process INVOICE type allocations for now
    IF (NEW.reference_type = 'INVOICE' OR OLD.reference_type = 'INVOICE') THEN
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
            -- Update invoice allocated amount
            UPDATE sales.invoices
            SET allocated_amount = (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE' 
                AND reference_id = NEW.reference_id  -- FIX: Use reference_id not invoice_id
                AND allocation_status = 'active'
            ),
            paid_amount = (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE' 
                AND reference_id = NEW.reference_id
                AND allocation_status = 'active'
            )
            WHERE invoice_id = NEW.reference_id;  -- FIX: Use reference_id
            
            -- Get invoice totals for payment status
            SELECT final_amount, 
                   COALESCE((SELECT SUM(allocated_amount) 
                            FROM financial.payment_allocations 
                            WHERE reference_type = 'INVOICE' 
                            AND reference_id = NEW.reference_id 
                            AND allocation_status = 'active'), 0)
            INTO v_reference_total, v_reference_allocated
            FROM sales.invoices
            WHERE invoice_id = NEW.reference_id;
            
            -- Update invoice payment status
            IF v_reference_allocated >= v_reference_total THEN
                v_reference_status := 'paid';
            ELSIF v_reference_allocated > 0 THEN
                v_reference_status := 'partial';
            ELSE
                v_reference_status := 'pending';
            END IF;
            
            UPDATE sales.invoices
            SET payment_status = v_reference_status,
                credit_amount = GREATEST(0, final_amount - v_reference_allocated)
            WHERE invoice_id = NEW.reference_id;
            
            -- Update payment allocated amount
            SELECT payment_amount INTO v_payment_total
            FROM financial.payments
            WHERE payment_id = NEW.payment_id;
            
            SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
            FROM financial.payment_allocations
            WHERE payment_id = NEW.payment_id
            AND allocation_status = 'active';
            
            -- Update payment allocation status
            IF v_payment_allocated >= v_payment_total THEN
                v_payment_status := 'ALLOCATED';
            ELSIF v_payment_allocated > 0 THEN
                v_payment_status := 'PARTIAL';
            ELSE
                v_payment_status := 'UNALLOCATED';
            END IF;
            
            UPDATE financial.payments
            SET allocated_amount = v_payment_allocated,
                unallocated_amount = v_payment_total - v_payment_allocated,
                allocation_status = v_payment_status
            WHERE payment_id = NEW.payment_id;
            
        ELSIF TG_OP = 'DELETE' THEN
            -- Update invoice on deletion
            UPDATE sales.invoices
            SET allocated_amount = (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE'
                AND reference_id = OLD.reference_id  -- FIX: Use reference_id
                AND allocation_status = 'active'
            ),
            paid_amount = (
                SELECT COALESCE(SUM(allocated_amount), 0)
                FROM financial.payment_allocations
                WHERE reference_type = 'INVOICE'
                AND reference_id = OLD.reference_id
                AND allocation_status = 'active'
            )
            WHERE invoice_id = OLD.reference_id;
            
            -- Update payment on deletion
            SELECT payment_amount INTO v_payment_total
            FROM financial.payments
            WHERE payment_id = OLD.payment_id;
            
            SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
            FROM financial.payment_allocations
            WHERE payment_id = OLD.payment_id
            AND allocation_status = 'active';
            
            UPDATE financial.payments
            SET allocated_amount = v_payment_allocated,
                unallocated_amount = v_payment_total - v_payment_allocated,
                allocation_status = CASE 
                    WHEN v_payment_allocated >= v_payment_total THEN 'ALLOCATED'
                    WHEN v_payment_allocated > 0 THEN 'PARTIAL'
                    ELSE 'UNALLOCATED'
                END
            WHERE payment_id = OLD.payment_id;
            
            -- Update invoice payment status after deletion
            UPDATE sales.invoices
            SET payment_status = CASE
                    WHEN paid_amount >= final_amount THEN 'paid'
                    WHEN paid_amount > 0 THEN 'partial'
                    ELSE 'pending'
                END,
                credit_amount = GREATEST(0, final_amount - paid_amount)
            WHERE invoice_id = OLD.reference_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Test to ensure triggers are fixed
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'financial'
AND event_object_table = 'payment_allocations';