-- Trigger to create customer_outstanding record when invoice is created
-- This ensures every invoice has a corresponding outstanding record

CREATE OR REPLACE FUNCTION financial.create_customer_outstanding_on_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INTEGER;
    v_invoice_number TEXT;
BEGIN
    -- Only process on INSERT or UPDATE that changes final_amount
    IF TG_OP = 'INSERT' OR 
       (TG_OP = 'UPDATE' AND NEW.final_amount != OLD.final_amount) THEN
        
        -- Convert UUID to INTEGER for customer_id
        SELECT c.customer_id::INTEGER
        INTO v_customer_id
        FROM parties.customers c
        WHERE c.customer_id::TEXT = NEW.customer_id::TEXT
        LIMIT 1;
        
        -- Handle case where customer_id might already be INTEGER stored as UUID
        IF v_customer_id IS NULL THEN
            v_customer_id := CASE 
                WHEN NEW.customer_id::TEXT ~ '^\d+$' THEN NEW.customer_id::TEXT::INTEGER
                ELSE NULL
            END;
        END IF;
        
        -- Only proceed if we have a valid customer_id
        IF v_customer_id IS NOT NULL THEN
            -- Generate invoice number if not present
            v_invoice_number := COALESCE(NEW.invoice_number, 'INV-' || NEW.invoice_id::TEXT);
            
            -- Insert or update customer_outstanding record
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
                aging_bucket,
                days_overdue,
                created_at,
                updated_at
            ) VALUES (
                NEW.org_id,
                v_customer_id,
                'INVOICE',
                NEW.invoice_id::INTEGER,
                v_invoice_number,
                COALESCE(NEW.invoice_date, CURRENT_DATE),
                NEW.final_amount,
                COALESCE(NEW.credit_amount, NEW.final_amount - COALESCE(NEW.paid_amount, 0)),
                COALESCE(NEW.paid_amount, 0),
                COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '30 days',
                CASE 
                    WHEN COALESCE(NEW.credit_amount, NEW.final_amount - COALESCE(NEW.paid_amount, 0)) <= 0 THEN 'paid'
                    WHEN COALESCE(NEW.paid_amount, 0) > 0 THEN 'partial'
                    ELSE 'open'
                END,
                CASE
                    WHEN COALESCE(NEW.credit_amount, NEW.final_amount - COALESCE(NEW.paid_amount, 0)) <= 0 THEN 'PAID'
                    WHEN CURRENT_DATE <= COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '30 days' THEN 'CURRENT'
                    WHEN CURRENT_DATE <= COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '60 days' THEN '1-30'
                    WHEN CURRENT_DATE <= COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '90 days' THEN '31-60'
                    WHEN CURRENT_DATE <= COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '120 days' THEN '61-90'
                    ELSE 'OVER_90'
                END,
                GREATEST(0, CURRENT_DATE - (COALESCE(NEW.invoice_date, CURRENT_DATE) + INTERVAL '30 days'))::INTEGER,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (org_id, document_type, document_id) 
            DO UPDATE SET
                document_number = EXCLUDED.document_number,
                document_date = EXCLUDED.document_date,
                original_amount = EXCLUDED.original_amount,
                outstanding_amount = EXCLUDED.outstanding_amount,
                paid_amount = EXCLUDED.paid_amount,
                due_date = EXCLUDED.due_date,
                status = EXCLUDED.status,
                aging_bucket = EXCLUDED.aging_bucket,
                days_overdue = EXCLUDED.days_overdue,
                updated_at = CURRENT_TIMESTAMP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_customer_outstanding ON sales.invoices;

-- Create trigger on invoices table
CREATE TRIGGER trigger_create_customer_outstanding
AFTER INSERT OR UPDATE ON sales.invoices
FOR EACH ROW
EXECUTE FUNCTION financial.create_customer_outstanding_on_invoice();

-- Function to populate existing invoices into customer_outstanding
CREATE OR REPLACE FUNCTION financial.populate_existing_invoices_to_outstanding()
RETURNS void AS $$
DECLARE
    v_count INTEGER := 0;
    v_customer_id INTEGER;
    rec RECORD;
BEGIN
    -- Loop through all existing invoices
    FOR rec IN 
        SELECT 
            i.*,
            COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)) as outstanding,
            COALESCE(SUM(pa.allocated_amount), 0) as total_paid
        FROM sales.invoices i
        LEFT JOIN financial.payment_allocations pa 
            ON pa.reference_id = i.invoice_id 
            AND pa.reference_type = 'INVOICE'
            AND pa.allocation_status = 'active'
        GROUP BY i.invoice_id, i.org_id, i.customer_id, i.invoice_number, 
                 i.invoice_date, i.final_amount, i.paid_amount, i.payment_status,
                 i.credit_amount, i.created_at, i.updated_at
    LOOP
        -- Convert customer_id to INTEGER
        BEGIN
            v_customer_id := CASE 
                WHEN rec.customer_id::TEXT ~ '^\d+$' THEN rec.customer_id::TEXT::INTEGER
                ELSE (
                    SELECT c.customer_id::INTEGER
                    FROM parties.customers c
                    WHERE c.customer_id::TEXT = rec.customer_id::TEXT
                    LIMIT 1
                )
            END;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE; -- Skip if we can't convert customer_id
        END;
        
        -- Skip if no valid customer_id
        IF v_customer_id IS NULL THEN
            CONTINUE;
        END IF;
        
        -- Insert into customer_outstanding
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
            aging_bucket,
            days_overdue,
            created_at,
            updated_at
        ) VALUES (
            rec.org_id,
            v_customer_id,
            'INVOICE',
            rec.invoice_id::INTEGER,
            COALESCE(rec.invoice_number, 'INV-' || rec.invoice_id::TEXT),
            COALESCE(rec.invoice_date, rec.created_at::DATE),
            rec.final_amount,
            rec.outstanding,
            rec.total_paid,
            COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '30 days',
            CASE 
                WHEN rec.outstanding <= 0 THEN 'paid'
                WHEN rec.total_paid > 0 THEN 'partial'
                ELSE 'open'
            END,
            CASE
                WHEN rec.outstanding <= 0 THEN 'PAID'
                WHEN CURRENT_DATE <= COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '30 days' THEN 'CURRENT'
                WHEN CURRENT_DATE <= COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '60 days' THEN '1-30'
                WHEN CURRENT_DATE <= COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '90 days' THEN '31-60'
                WHEN CURRENT_DATE <= COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '120 days' THEN '61-90'
                ELSE 'OVER_90'
            END,
            GREATEST(0, CURRENT_DATE - (COALESCE(rec.invoice_date, rec.created_at::DATE) + INTERVAL '30 days'))::INTEGER,
            rec.created_at,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (org_id, document_type, document_id) 
        DO UPDATE SET
            outstanding_amount = EXCLUDED.outstanding_amount,
            paid_amount = EXCLUDED.paid_amount,
            status = EXCLUDED.status,
            aging_bucket = EXCLUDED.aging_bucket,
            days_overdue = EXCLUDED.days_overdue,
            updated_at = CURRENT_TIMESTAMP;
        
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Populated % invoices into customer_outstanding', v_count;
END;
$$ LANGUAGE plpgsql;

-- Call the function to populate existing invoices
SELECT financial.populate_existing_invoices_to_outstanding();

-- Create a simpler trigger that updates outstanding when invoice payment_status or credit_amount changes
CREATE OR REPLACE FUNCTION financial.sync_invoice_to_outstanding()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id INTEGER;
BEGIN
    -- Only process on UPDATE of payment-related fields
    IF TG_OP = 'UPDATE' AND 
       (NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
        NEW.credit_amount IS DISTINCT FROM OLD.credit_amount OR
        NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) THEN
        
        -- Convert customer_id to INTEGER
        v_customer_id := CASE 
            WHEN NEW.customer_id::TEXT ~ '^\d+$' THEN NEW.customer_id::TEXT::INTEGER
            ELSE (
                SELECT c.customer_id::INTEGER
                FROM parties.customers c
                WHERE c.customer_id::TEXT = NEW.customer_id::TEXT
                LIMIT 1
            )
        END;
        
        -- Update the outstanding record
        UPDATE financial.customer_outstanding
        SET 
            outstanding_amount = COALESCE(NEW.credit_amount, NEW.final_amount - COALESCE(NEW.paid_amount, 0)),
            paid_amount = COALESCE(NEW.paid_amount, 0),
            status = CASE 
                WHEN COALESCE(NEW.credit_amount, 0) <= 0 THEN 'paid'
                WHEN COALESCE(NEW.paid_amount, 0) > 0 THEN 'partial'
                ELSE 'open'
            END,
            aging_bucket = CASE
                WHEN COALESCE(NEW.credit_amount, 0) <= 0 THEN 'PAID'
                WHEN CURRENT_DATE <= NEW.invoice_date + INTERVAL '30 days' THEN 'CURRENT'
                WHEN CURRENT_DATE <= NEW.invoice_date + INTERVAL '60 days' THEN '1-30'
                WHEN CURRENT_DATE <= NEW.invoice_date + INTERVAL '90 days' THEN '31-60'
                WHEN CURRENT_DATE <= NEW.invoice_date + INTERVAL '120 days' THEN '61-90'
                ELSE 'OVER_90'
            END,
            days_overdue = GREATEST(0, CURRENT_DATE - (NEW.invoice_date + INTERVAL '30 days'))::INTEGER,
            updated_at = CURRENT_TIMESTAMP
        WHERE document_type = 'INVOICE'
        AND document_id = NEW.invoice_id::INTEGER;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_sync_invoice_to_outstanding ON sales.invoices;

-- Create trigger for invoice updates
CREATE TRIGGER trigger_sync_invoice_to_outstanding
AFTER UPDATE ON sales.invoices
FOR EACH ROW
EXECUTE FUNCTION financial.sync_invoice_to_outstanding();

-- Verify the data
SELECT 
    'Total Invoices' as metric,
    COUNT(*) as count
FROM sales.invoices
UNION ALL
SELECT 
    'Outstanding Records' as metric,
    COUNT(*) as count
FROM financial.customer_outstanding
WHERE document_type = 'INVOICE';