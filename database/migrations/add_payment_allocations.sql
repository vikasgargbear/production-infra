-- ========================================
-- PAYMENT ALLOCATION SYSTEM
-- Links payments to specific invoices for proper ledger tracking
-- ========================================

-- 1. CREATE PAYMENT ALLOCATIONS TABLE
CREATE TABLE IF NOT EXISTS financial.payment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Link to payment and invoice
    payment_id INTEGER NOT NULL REFERENCES financial.payments(payment_id) ON DELETE CASCADE,
    invoice_id INTEGER NOT NULL REFERENCES sales.invoices(invoice_id) ON DELETE RESTRICT,
    
    -- Allocation details
    allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
    allocation_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    allocation_type TEXT DEFAULT 'manual', -- 'manual', 'auto', 'fifo', 'lifo', 'specific'
    
    -- Tracking
    created_by INTEGER REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique allocation per payment-invoice pair
    CONSTRAINT unique_payment_invoice_allocation UNIQUE (payment_id, invoice_id),
    
    -- Ensure allocation doesn't exceed payment amount (will be enforced by trigger)
    CONSTRAINT check_positive_allocation CHECK (allocated_amount > 0)
);

-- Create indexes for performance
CREATE INDEX idx_payment_allocations_payment ON financial.payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON financial.payment_allocations(invoice_id);
CREATE INDEX idx_payment_allocations_date ON financial.payment_allocations(allocation_date);

-- 2. ADD TRACKING COLUMNS TO INVOICES (if not exists)
ALTER TABLE sales.invoices ADD COLUMN IF NOT EXISTS 
    allocated_amount NUMERIC(15,2) DEFAULT 0;

ALTER TABLE sales.invoices ADD COLUMN IF NOT EXISTS 
    unallocated_amount NUMERIC(15,2) GENERATED ALWAYS AS (final_amount - COALESCE(allocated_amount, 0)) STORED;

-- 3. CREATE FUNCTION TO VALIDATE ALLOCATION
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
    
    -- Get invoice amount and current allocation
    SELECT final_amount, COALESCE(allocated_amount, 0) INTO v_invoice_amount, v_invoice_allocated
    FROM sales.invoices
    WHERE invoice_id = NEW.invoice_id;
    
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

-- Create trigger for validation
DROP TRIGGER IF EXISTS trg_validate_payment_allocation ON financial.payment_allocations;
CREATE TRIGGER trg_validate_payment_allocation
    BEFORE INSERT OR UPDATE ON financial.payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION financial.validate_payment_allocation();

-- 4. CREATE FUNCTION TO UPDATE INVOICE AND PAYMENT ALLOCATION STATUS
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
        -- Update invoice allocated amount
        UPDATE sales.invoices
        SET allocated_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE invoice_id = NEW.invoice_id
        )
        WHERE invoice_id = NEW.invoice_id;
        
        -- Get invoice totals for payment status
        SELECT final_amount, allocated_amount 
        INTO v_invoice_total, v_invoice_allocated
        FROM sales.invoices
        WHERE invoice_id = NEW.invoice_id;
        
        -- Update invoice payment status
        IF v_invoice_allocated >= v_invoice_total THEN
            v_invoice_status := 'paid';
        ELSIF v_invoice_allocated > 0 THEN
            v_invoice_status := 'partial';
        ELSE
            v_invoice_status := 'pending';
        END IF;
        
        UPDATE sales.invoices
        SET payment_status = v_invoice_status
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
        -- Update invoice on deletion
        UPDATE sales.invoices
        SET allocated_amount = (
            SELECT COALESCE(SUM(allocated_amount), 0)
            FROM financial.payment_allocations
            WHERE invoice_id = OLD.invoice_id
        )
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

-- Create trigger for updating allocation status
DROP TRIGGER IF EXISTS trg_update_allocation_status ON financial.payment_allocations;
CREATE TRIGGER trg_update_allocation_status
    AFTER INSERT OR UPDATE OR DELETE ON financial.payment_allocations
    FOR EACH ROW
    EXECUTE FUNCTION financial.update_allocation_status();

-- 5. CREATE FUNCTION FOR AUTO-ALLOCATION (FIFO)
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
BEGIN
    -- Get payment details
    SELECT * INTO v_payment
    FROM financial.payments
    WHERE payment_id = p_payment_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;
    
    -- Initialize remaining amount
    v_remaining_amount := v_payment.payment_amount - COALESCE(v_payment.allocated_amount, 0);
    
    IF v_remaining_amount <= 0 THEN
        RETURN; -- Nothing to allocate
    END IF;
    
    -- Get unpaid invoices for the party (FIFO - oldest first)
    FOR v_invoice IN
        SELECT i.invoice_id, i.final_amount, COALESCE(i.allocated_amount, 0) as allocated
        FROM sales.invoices i
        WHERE i.customer_id = v_payment.party_id
        AND i.payment_status != 'paid'
        AND i.invoice_status != 'cancelled'
        ORDER BY 
            CASE WHEN p_allocation_type = 'fifo' THEN i.invoice_date END ASC,
            CASE WHEN p_allocation_type = 'lifo' THEN i.invoice_date END DESC,
            i.invoice_id
    LOOP
        -- Calculate amount to allocate to this invoice
        v_to_allocate := LEAST(
            v_remaining_amount,
            v_invoice.final_amount - v_invoice.allocated
        );
        
        IF v_to_allocate > 0 THEN
            -- Create allocation
            INSERT INTO financial.payment_allocations (
                org_id, payment_id, invoice_id, allocated_amount, allocation_type, created_by
            )
            SELECT 
                v_payment.org_id, p_payment_id, v_invoice.invoice_id, v_to_allocate, p_allocation_type, v_payment.created_by
            ON CONFLICT (payment_id, invoice_id) 
            DO UPDATE SET 
                allocated_amount = payment_allocations.allocated_amount + EXCLUDED.allocated_amount,
                allocation_date = CURRENT_TIMESTAMP;
            
            -- Return this allocation
            invoice_id := v_invoice.invoice_id;
            allocated_amount := v_to_allocate;
            RETURN NEXT;
            
            -- Update remaining amount
            v_remaining_amount := v_remaining_amount - v_to_allocate;
            
            -- Exit if fully allocated
            IF v_remaining_amount <= 0 THEN
                EXIT;
            END IF;
        END IF;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE VIEW FOR COMPLETE LEDGER WITH ALLOCATIONS
CREATE OR REPLACE VIEW financial.v_party_ledger AS
WITH ledger_entries AS (
    -- Invoices (Debit entries)
    SELECT 
        i.customer_id as party_id,
        'customer' as party_type,
        i.invoice_date as entry_date,
        'Invoice' as entry_type,
        i.invoice_number as reference_number,
        i.invoice_id as source_id,
        'invoice' as source_type,
        i.final_amount as debit_amount,
        0::NUMERIC as credit_amount,
        i.narration as description,
        i.payment_status
    FROM sales.invoices i
    WHERE i.invoice_status != 'cancelled'
    
    UNION ALL
    
    -- Payment Allocations (Credit entries)
    SELECT 
        i.customer_id as party_id,
        'customer' as party_type,
        pa.allocation_date::DATE as entry_date,
        'Payment' as entry_type,
        p.payment_number || ' -> ' || i.invoice_number as reference_number,
        pa.allocation_id as source_id,
        'allocation' as source_type,
        0::NUMERIC as debit_amount,
        pa.allocated_amount as credit_amount,
        'Payment allocated to Invoice ' || i.invoice_number as description,
        p.payment_status
    FROM financial.payment_allocations pa
    JOIN financial.payments p ON pa.payment_id = p.payment_id
    JOIN sales.invoices i ON pa.invoice_id = i.invoice_id
    WHERE p.payment_status != 'cancelled'
    
    UNION ALL
    
    -- Unallocated Payments (Credit entries)
    SELECT 
        p.party_id,
        p.party_type,
        p.payment_date as entry_date,
        'Advance Payment' as entry_type,
        p.payment_number as reference_number,
        p.payment_id as source_id,
        'payment' as source_type,
        0::NUMERIC as debit_amount,
        p.unallocated_amount as credit_amount,
        'Unallocated payment' as description,
        p.payment_status
    FROM financial.payments p
    WHERE p.allocation_status != 'full'
    AND p.unallocated_amount > 0
    AND p.payment_status != 'cancelled'
)
SELECT 
    *,
    SUM(debit_amount - credit_amount) OVER (
        PARTITION BY party_id 
        ORDER BY entry_date, source_id
    ) as running_balance
FROM ledger_entries
ORDER BY party_id, entry_date DESC;

-- 7. HELPER FUNCTION TO GET PARTY BALANCE
CREATE OR REPLACE FUNCTION financial.get_party_balance(
    p_party_id INTEGER,
    p_party_type TEXT,
    p_as_of_date DATE DEFAULT CURRENT_DATE
) RETURNS NUMERIC AS $$
DECLARE
    v_balance NUMERIC(15,2);
BEGIN
    IF p_party_type = 'customer' THEN
        SELECT 
            COALESCE(SUM(i.final_amount), 0) - COALESCE(SUM(i.allocated_amount), 0)
        INTO v_balance
        FROM sales.invoices i
        WHERE i.customer_id = p_party_id
        AND i.invoice_date <= p_as_of_date
        AND i.invoice_status != 'cancelled';
    ELSE
        -- For suppliers (implement later)
        v_balance := 0;
    END IF;
    
    RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- 8. ADD COMMENT DOCUMENTATION
COMMENT ON TABLE financial.payment_allocations IS 
'Links payments to specific invoices for tracking partial payments and maintaining accurate ledger';

COMMENT ON COLUMN financial.payment_allocations.allocation_type IS 
'How the allocation was made: manual (user specified), auto (system FIFO), fifo (oldest first), lifo (newest first), specific (user selected invoice)';

COMMENT ON FUNCTION financial.auto_allocate_payment IS 
'Automatically allocates a payment to outstanding invoices using FIFO or LIFO method';

COMMENT ON VIEW financial.v_party_ledger IS 
'Complete party ledger showing all invoices, allocated payments, and unallocated advances with running balance';

-- 9. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE ON financial.payment_allocations TO application_role;
GRANT SELECT ON financial.v_party_ledger TO application_role;
GRANT EXECUTE ON FUNCTION financial.auto_allocate_payment TO application_role;
GRANT EXECUTE ON FUNCTION financial.get_party_balance TO application_role;