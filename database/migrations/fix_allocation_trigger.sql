-- Fix: Remove references to allocated_amount column in sales.invoices
-- This column was removed as part of finance/operational separation

-- 1. Drop the existing trigger
DROP TRIGGER IF EXISTS trg_update_allocation_status ON financial.payment_allocations;

-- 2. Create updated function that doesn't reference sales.invoices.allocated_amount
CREATE OR REPLACE FUNCTION financial.update_allocation_status()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_total NUMERIC(15,2);
    v_payment_allocated NUMERIC(15,2);
    v_invoice_total NUMERIC(15,2);
    v_invoice_allocated NUMERIC(15,2);
    v_payment_status TEXT;
    v_invoice_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Calculate total allocated for this invoice from payment_allocations table
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_invoice_allocated
        FROM financial.payment_allocations
        WHERE invoice_id = NEW.invoice_id;
        
        -- Get invoice total
        SELECT final_amount INTO v_invoice_total
        FROM sales.invoices
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update invoice payment_status (but NOT allocated_amount - that column was removed)
        IF v_invoice_allocated >= v_invoice_total THEN
            v_invoice_status := 'paid';
        ELSIF v_invoice_allocated > 0 THEN
            v_invoice_status := 'partial';
        ELSE
            v_invoice_status := 'pending';
        END IF;
        
        -- Only update payment_status on invoices
        UPDATE sales.invoices
        SET payment_status = v_invoice_status,
            paid_amount = v_invoice_allocated
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update payment allocated amount
        SELECT payment_amount INTO v_payment_total
        FROM financial.payments
        WHERE payment_id = NEW.payment_id;
        
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
        FROM financial.payment_allocations
        WHERE payment_id = NEW.payment_id;
        
        -- Update payment allocation status
        IF v_payment_allocated >= v_payment_total THEN
            v_payment_status := 'full';
        ELSIF v_payment_allocated > 0 THEN
            v_payment_status := 'partial';
        ELSE
            v_payment_status := 'unallocated';
        END IF;
        
        UPDATE financial.payments
        SET allocated_amount = v_payment_allocated,
            unallocated_amount = v_payment_total - v_payment_allocated,
            allocation_status = v_payment_status
        WHERE payment_id = NEW.payment_id;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Recalculate for deleted allocation
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_invoice_allocated
        FROM financial.payment_allocations
        WHERE invoice_id = OLD.invoice_id;
        
        SELECT final_amount INTO v_invoice_total
        FROM sales.invoices
        WHERE invoice_id = OLD.invoice_id;
        
        IF v_invoice_allocated >= v_invoice_total THEN
            v_invoice_status := 'paid';
        ELSIF v_invoice_allocated > 0 THEN
            v_invoice_status := 'partial';
        ELSE
            v_invoice_status := 'pending';
        END IF;
        
        UPDATE sales.invoices
        SET payment_status = v_invoice_status,
            paid_amount = v_invoice_allocated
        WHERE invoice_id = OLD.invoice_id;
        
        -- Update payment on deletion
        SELECT payment_amount INTO v_payment_total
        FROM financial.payments
        WHERE payment_id = OLD.payment_id;
        
        SELECT COALESCE(SUM(allocated_amount), 0) INTO v_payment_allocated
        FROM financial.payment_allocations
        WHERE payment_id = OLD.payment_id;
        
        UPDATE financial.payments
        SET allocated_amount = v_payment_allocated,
            unallocated_amount = v_payment_total - v_payment_allocated,
            allocation_status = CASE 
                WHEN v_payment_allocated >= v_payment_total THEN 'full'
                WHEN v_payment_allocated > 0 THEN 'partial'
                ELSE 'unallocated'
            END
        WHERE payment_id = OLD.payment_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recreate trigger
CREATE TRIGGER trg_update_allocation_status
    AFTER INSERT OR UPDATE OR DELETE ON financial.payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION financial.update_allocation_status();

-- 4. Also update the validation function to not reference allocated_amount column
CREATE OR REPLACE FUNCTION financial.validate_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_amount NUMERIC(15,2);
    v_total_allocated NUMERIC(15,2);
    v_invoice_amount NUMERIC(15,2);
    v_invoice_allocated NUMERIC(15,2);
BEGIN
    -- Get payment amount
    SELECT payment_amount INTO v_payment_amount
    FROM financial.payments
    WHERE payment_id = NEW.payment_id;
    
    -- Get total already allocated for this payment (excluding current if UPDATE)
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
    FROM financial.payment_allocations
    WHERE payment_id = NEW.payment_id
    AND allocation_id != COALESCE(NEW.allocation_id, -1);
    
    -- Check if allocation exceeds payment amount
    IF (v_total_allocated + NEW.allocated_amount) > v_payment_amount THEN
        RAISE EXCEPTION 'Allocation exceeds payment amount. Payment: %, Already allocated: %, Trying to allocate: %',
            v_payment_amount, v_total_allocated, NEW.allocated_amount;
    END IF;
    
    -- Get invoice amount and current allocation FROM payment_allocations table (not from invoice column)
    SELECT final_amount INTO v_invoice_amount
    FROM sales.invoices
    WHERE invoice_id = NEW.invoice_id;
    
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_invoice_allocated
    FROM financial.payment_allocations
    WHERE invoice_id = NEW.invoice_id
    AND allocation_id != COALESCE(NEW.allocation_id, -1);
    
    -- Check if allocation exceeds invoice amount
    IF TG_OP = 'INSERT' THEN
        IF (v_invoice_allocated + NEW.allocated_amount) > v_invoice_amount THEN
            RAISE EXCEPTION 'Allocation exceeds invoice amount. Invoice: %, Already allocated: %, Trying to allocate: %',
                v_invoice_amount, v_invoice_allocated, NEW.allocated_amount;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Drop the allocated_amount and unallocated_amount columns from sales.invoices if they exist
-- (They should not exist anymore, but just in case)
ALTER TABLE sales.invoices DROP COLUMN IF EXISTS allocated_amount CASCADE;
ALTER TABLE sales.invoices DROP COLUMN IF EXISTS unallocated_amount CASCADE;
