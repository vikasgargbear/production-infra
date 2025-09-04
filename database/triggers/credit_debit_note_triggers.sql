-- Triggers for Credit and Debit Notes
-- Updates customer outstanding and maintains data consistency

-- 1. Trigger to update customer outstanding when credit note is approved
CREATE OR REPLACE FUNCTION update_customer_outstanding_on_credit_note()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process approved credit notes
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Reduce customer outstanding by credit amount
        -- Apply to the oldest outstanding invoice first (FIFO)
        WITH oldest_outstanding AS (
            SELECT outstanding_id
            FROM financial.customer_outstanding
            WHERE customer_id = NEW.customer_id
            AND document_type = 'INVOICE'
            AND status IN ('open', 'partial')
            AND outstanding_amount > 0
            ORDER BY document_date, document_id
            LIMIT 1
        )
        UPDATE financial.customer_outstanding
        SET outstanding_amount = GREATEST(0, outstanding_amount - NEW.total_amount),
            status = CASE 
                WHEN outstanding_amount - NEW.total_amount <= 0 THEN 'paid'
                ELSE 'partial'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE outstanding_id IN (SELECT outstanding_id FROM oldest_outstanding);
        
        RAISE NOTICE 'Credit note % approved for customer %, amount: %', 
            NEW.credit_note_number, NEW.customer_id, NEW.total_amount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_credit_note_approval
    AFTER UPDATE OF status ON sales.credit_notes
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
    EXECUTE FUNCTION update_customer_outstanding_on_credit_note();

-- 2. Trigger to update customer outstanding when debit note is approved
CREATE OR REPLACE FUNCTION update_customer_outstanding_on_debit_note()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process approved debit notes
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create new outstanding record for debit note
        INSERT INTO financial.customer_outstanding (
            org_id, customer_id, document_type, document_id,
            document_number, document_date, original_amount,
            outstanding_amount, paid_amount, due_date, status
        ) VALUES (
            NEW.org_id,
            NEW.customer_id,
            'DEBIT_NOTE',
            NEW.debit_note_id,
            NEW.debit_note_number,
            NEW.debit_note_date,
            NEW.total_amount,
            NEW.total_amount,
            0,
            NEW.debit_note_date + INTERVAL '30 days',
            'open'
        ) ON CONFLICT (org_id, document_type, document_id) 
        DO UPDATE SET
            outstanding_amount = EXCLUDED.outstanding_amount,
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP;
        
        RAISE NOTICE 'Debit note % approved for customer %, amount: %', 
            NEW.debit_note_number, NEW.customer_id, NEW.total_amount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_debit_note_approval
    AFTER UPDATE OF status ON sales.debit_notes
    FOR EACH ROW
    WHEN (NEW.status = 'approved' AND OLD.status != 'approved')
    EXECUTE FUNCTION update_customer_outstanding_on_debit_note();

-- 3. Trigger to update credit note when it's applied to invoices
CREATE OR REPLACE FUNCTION update_credit_note_on_application()
RETURNS TRIGGER AS $$
DECLARE
    v_total_applied NUMERIC(15,2);
BEGIN
    -- Calculate total applied amount for this credit note
    SELECT COALESCE(SUM(applied_amount), 0) INTO v_total_applied
    FROM sales.credit_note_applications
    WHERE credit_note_id = NEW.credit_note_id;
    
    -- Update credit note with new applied amount
    UPDATE sales.credit_notes
    SET applied_amount = v_total_applied,
        status = CASE 
            WHEN v_total_applied >= total_amount THEN 'applied'
            ELSE status
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE credit_note_id = NEW.credit_note_id;
    
    -- Update the invoice that received the credit
    UPDATE sales.invoices
    SET paid_amount = COALESCE(paid_amount, 0) + NEW.applied_amount,
        credit_amount = GREATEST(0, final_amount - (COALESCE(paid_amount, 0) + NEW.applied_amount)),
        payment_status = CASE
            WHEN (COALESCE(paid_amount, 0) + NEW.applied_amount) >= final_amount THEN 'paid'
            WHEN (COALESCE(paid_amount, 0) + NEW.applied_amount) > 0 THEN 'partial'
            ELSE payment_status
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE invoice_id = NEW.invoice_id;
    
    -- Update customer outstanding for the invoice
    UPDATE financial.customer_outstanding
    SET paid_amount = COALESCE(paid_amount, 0) + NEW.applied_amount,
        outstanding_amount = GREATEST(0, original_amount - (COALESCE(paid_amount, 0) + NEW.applied_amount)),
        status = CASE
            WHEN (COALESCE(paid_amount, 0) + NEW.applied_amount) >= original_amount THEN 'paid'
            ELSE 'partial'
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE document_type = 'INVOICE'
    AND document_id = NEW.invoice_id;
    
    RAISE NOTICE 'Applied % from credit note % to invoice %', 
        NEW.applied_amount, NEW.credit_note_id, NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_credit_note_application
    AFTER INSERT ON sales.credit_note_applications
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_note_on_application();

-- 4. Trigger to handle debit note payments
CREATE OR REPLACE FUNCTION update_debit_note_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- When paid_amount is updated
    IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
        -- Update customer outstanding
        UPDATE financial.customer_outstanding
        SET paid_amount = NEW.paid_amount,
            outstanding_amount = GREATEST(0, original_amount - NEW.paid_amount),
            status = CASE
                WHEN NEW.paid_amount >= original_amount THEN 'paid'
                WHEN NEW.paid_amount > 0 THEN 'partial'
                ELSE 'open'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE document_type = 'DEBIT_NOTE'
        AND document_id = NEW.debit_note_id;
        
        RAISE NOTICE 'Updated payment for debit note %: %', 
            NEW.debit_note_number, NEW.paid_amount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_debit_note_payment
    AFTER UPDATE OF paid_amount ON sales.debit_notes
    FOR EACH ROW
    WHEN (NEW.paid_amount IS DISTINCT FROM OLD.paid_amount)
    EXECUTE FUNCTION update_debit_note_on_payment();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION update_customer_outstanding_on_credit_note() TO postgres;
GRANT EXECUTE ON FUNCTION update_customer_outstanding_on_debit_note() TO postgres;
GRANT EXECUTE ON FUNCTION update_credit_note_on_application() TO postgres;
GRANT EXECUTE ON FUNCTION update_debit_note_on_payment() TO postgres;