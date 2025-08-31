-- Trigger to update customer_outstanding when payment allocations change
-- This ensures outstanding amounts stay synchronized when payments are made

CREATE OR REPLACE FUNCTION financial.update_customer_outstanding_from_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_customer_id UUID;
    v_org_id UUID;
    v_total_allocated NUMERIC(15,2);
    v_invoice_amount NUMERIC(15,2);
    v_new_outstanding NUMERIC(15,2);
    v_new_status TEXT;
BEGIN
    -- Only process INVOICE type allocations
    IF (NEW.reference_type = 'INVOICE' AND TG_OP IN ('INSERT', 'UPDATE')) OR 
       (OLD.reference_type = 'INVOICE' AND TG_OP = 'DELETE') THEN
        
        -- Determine which invoice to update
        IF TG_OP = 'DELETE' THEN
            v_invoice_id := OLD.reference_id;
        ELSE
            v_invoice_id := NEW.reference_id;
        END IF;
        
        -- Get invoice details
        SELECT i.customer_id, i.org_id, i.final_amount
        INTO v_customer_id, v_org_id, v_invoice_amount
        FROM sales.invoices i
        WHERE i.invoice_id = v_invoice_id;
        
        -- Calculate total allocated amount for this invoice
        SELECT COALESCE(SUM(allocated_amount), 0)
        INTO v_total_allocated
        FROM financial.payment_allocations
        WHERE reference_type = 'INVOICE'
        AND reference_id = v_invoice_id
        AND allocation_status = 'active';
        
        -- Calculate new outstanding amount
        v_new_outstanding := v_invoice_amount - v_total_allocated;
        
        -- Determine status
        IF v_new_outstanding <= 0 THEN
            v_new_status := 'paid';
        ELSIF v_new_outstanding < v_invoice_amount THEN
            v_new_status := 'partial';
        ELSE
            v_new_status := 'open';
        END IF;
        
        -- Update customer_outstanding record
        UPDATE financial.customer_outstanding
        SET 
            paid_amount = v_total_allocated,
            outstanding_amount = v_new_outstanding,
            status = v_new_status,
            updated_at = CURRENT_TIMESTAMP
        WHERE document_type = 'INVOICE'
        AND document_id = v_invoice_id;
        
        -- If no record exists (for legacy invoices), create one
        IF NOT FOUND THEN
            INSERT INTO financial.customer_outstanding (
                org_id,
                customer_id,
                document_type,
                document_id,
                document_number,
                document_date,
                original_amount,
                outstanding_amount,
                paid_amount,
                due_date,
                status,
                created_at
            )
            SELECT
                i.org_id,
                i.customer_id,
                'INVOICE',
                i.invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.final_amount,
                v_new_outstanding,
                v_total_allocated,
                i.invoice_date + INTERVAL '30 days',
                v_new_status,
                CURRENT_TIMESTAMP
            FROM sales.invoices i
            WHERE i.invoice_id = v_invoice_id;
        END IF;
        
        -- Update aging bucket based on current date
        UPDATE financial.customer_outstanding
        SET aging_bucket = CASE
            WHEN outstanding_amount <= 0 THEN 'PAID'
            WHEN CURRENT_DATE <= due_date THEN 'CURRENT'
            WHEN CURRENT_DATE <= due_date + INTERVAL '30 days' THEN '1-30'
            WHEN CURRENT_DATE <= due_date + INTERVAL '60 days' THEN '31-60'
            WHEN CURRENT_DATE <= due_date + INTERVAL '90 days' THEN '61-90'
            ELSE 'OVER_90'
        END
        WHERE document_type = 'INVOICE'
        AND document_id = v_invoice_id;
        
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_customer_outstanding ON financial.payment_allocations;

-- Create trigger on payment_allocations table
CREATE TRIGGER trigger_update_customer_outstanding
AFTER INSERT OR UPDATE OR DELETE ON financial.payment_allocations
FOR EACH ROW
EXECUTE FUNCTION financial.update_customer_outstanding_from_allocation();

-- Also create a function to handle payment deletion/updates
CREATE OR REPLACE FUNCTION financial.update_outstanding_on_payment_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When a payment is deleted or updated, recalculate all related outstanding amounts
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.payment_status != NEW.payment_status) THEN
        -- Update all invoices that had allocations from this payment
        UPDATE financial.customer_outstanding co
        SET 
            paid_amount = (
                SELECT COALESCE(SUM(pa.allocated_amount), 0)
                FROM financial.payment_allocations pa
                WHERE pa.reference_type = 'INVOICE'
                AND pa.reference_id = co.document_id
                AND pa.allocation_status = 'active'
            ),
            outstanding_amount = co.original_amount - (
                SELECT COALESCE(SUM(pa.allocated_amount), 0)
                FROM financial.payment_allocations pa
                WHERE pa.reference_type = 'INVOICE'
                AND pa.reference_id = co.document_id
                AND pa.allocation_status = 'active'
            ),
            status = CASE
                WHEN co.original_amount <= (
                    SELECT COALESCE(SUM(pa.allocated_amount), 0)
                    FROM financial.payment_allocations pa
                    WHERE pa.reference_type = 'INVOICE'
                    AND pa.reference_id = co.document_id
                    AND pa.allocation_status = 'active'
                ) THEN 'paid'
                WHEN (
                    SELECT COALESCE(SUM(pa.allocated_amount), 0)
                    FROM financial.payment_allocations pa
                    WHERE pa.reference_type = 'INVOICE'
                    AND pa.reference_id = co.document_id
                    AND pa.allocation_status = 'active'
                ) > 0 THEN 'partial'
                ELSE 'open'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE co.document_type = 'INVOICE'
        AND co.document_id IN (
            SELECT DISTINCT reference_id
            FROM financial.payment_allocations
            WHERE payment_id = COALESCE(OLD.payment_id, NEW.payment_id)
            AND reference_type = 'INVOICE'
        );
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_outstanding_on_payment_change ON financial.payments;

-- Create trigger on payments table
CREATE TRIGGER trigger_outstanding_on_payment_change
AFTER UPDATE OR DELETE ON financial.payments
FOR EACH ROW
EXECUTE FUNCTION financial.update_outstanding_on_payment_change();

-- Test query to verify triggers are created
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'financial'
AND trigger_name IN ('trigger_update_customer_outstanding', 'trigger_outstanding_on_payment_change');