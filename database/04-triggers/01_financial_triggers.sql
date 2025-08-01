-- =============================================
-- FINANCIAL MANAGEMENT TRIGGERS
-- =============================================
-- Schema: financial
-- Critical for maintaining financial integrity
-- =============================================

-- =============================================
-- 1. DOUBLE-ENTRY BOOKKEEPING VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_debits NUMERIC;
    v_total_credits NUMERIC;
    v_difference NUMERIC;
BEGIN
    -- Only validate when posting
    IF NEW.entry_status != 'posted' OR OLD.entry_status = 'posted' THEN
        RETURN NEW;
    END IF;
    
    -- Calculate total debits and credits
    SELECT 
        COALESCE(SUM(debit_amount), 0),
        COALESCE(SUM(credit_amount), 0)
    INTO v_total_debits, v_total_credits
    FROM financial.journal_entry_lines
    WHERE journal_id = NEW.journal_id;
    
    v_difference := ABS(v_total_debits - v_total_credits);
    
    -- Check if balanced (allowing for tiny rounding differences)
    IF v_difference > 0.01 THEN
        RAISE EXCEPTION 'Journal entry is not balanced. Debits: %, Credits: %, Difference: %',
            v_total_debits, v_total_credits, v_difference;
    END IF;
    
    -- Ensure at least 2 lines
    IF (SELECT COUNT(*) FROM financial.journal_entry_lines WHERE journal_id = NEW.journal_id) < 2 THEN
        RAISE EXCEPTION 'Journal entry must have at least 2 lines';
    END IF;
    
    -- Set posting details
    NEW.posted_by := NEW.updated_by;
    NEW.posted_at := CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_journal_balance
    BEFORE UPDATE OF entry_status ON financial.journal_entries
    FOR EACH ROW
    WHEN (NEW.entry_status = 'posted')
    EXECUTE FUNCTION validate_journal_entry_balance();

-- =============================================
-- 2. PAYMENT ALLOCATION VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_amount NUMERIC;
    v_allocated_amount NUMERIC;
    v_new_total_allocated NUMERIC;
BEGIN
    -- Get payment amount
    SELECT payment_amount 
    INTO v_payment_amount
    FROM financial.payments
    WHERE payment_id = NEW.payment_id;
    
    -- Calculate current allocations excluding this one
    SELECT COALESCE(SUM(allocated_amount), 0)
    INTO v_allocated_amount
    FROM financial.payment_allocations
    WHERE payment_id = NEW.payment_id
    AND allocation_id != COALESCE(NEW.allocation_id, -1)
    AND allocation_status = 'active';
    
    -- Calculate new total
    v_new_total_allocated := v_allocated_amount + NEW.allocated_amount;
    
    -- Validate allocation doesn't exceed payment
    IF v_new_total_allocated > v_payment_amount THEN
        RAISE EXCEPTION 'Total allocation (%) exceeds payment amount (%)',
            v_new_total_allocated, v_payment_amount;
    END IF;
    
    -- Update payment allocation status
    UPDATE financial.payments
    SET 
        allocated_amount = v_new_total_allocated,
        unallocated_amount = payment_amount - v_new_total_allocated,
        allocation_status = CASE
            WHEN v_new_total_allocated = 0 THEN 'unallocated'
            WHEN v_new_total_allocated < payment_amount THEN 'partial'
            ELSE 'full'
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE payment_id = NEW.payment_id;
    
    -- Update outstanding if allocating to invoice
    IF NEW.reference_type = 'invoice' THEN
        UPDATE financial.customer_outstanding
        SET 
            paid_amount = paid_amount + NEW.allocated_amount,
            outstanding_amount = outstanding_amount - NEW.allocated_amount,
            status = CASE
                WHEN outstanding_amount - NEW.allocated_amount <= 0 THEN 'paid'
                ELSE 'partial'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE document_type = 'invoice'
        AND document_id = NEW.reference_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_payment_allocation
    AFTER INSERT OR UPDATE ON financial.payment_allocations
    FOR EACH ROW
    WHEN (NEW.allocation_status = 'active')
    EXECUTE FUNCTION validate_payment_allocation();

-- =============================================
-- 3. CUSTOMER CREDIT LIMIT CHECK
-- =============================================
CREATE OR REPLACE FUNCTION check_customer_credit_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_credit_limit NUMERIC;
    v_current_outstanding NUMERIC;
    v_order_value NUMERIC;
    v_total_exposure NUMERIC;
    v_customer_name TEXT;
    v_credit_days INTEGER;
    v_overdue_amount NUMERIC;
BEGIN
    -- Only check for confirmed orders
    IF NEW.order_status != 'confirmed' OR OLD.order_status = 'confirmed' THEN
        RETURN NEW;
    END IF;
    
    -- Get customer credit info
    SELECT 
        c.customer_name,
        (c.credit_info->>'credit_limit')::NUMERIC,
        (c.credit_info->>'credit_days')::INTEGER
    INTO v_customer_name, v_credit_limit, v_credit_days
    FROM parties.customers c
    WHERE c.customer_id = NEW.customer_id;
    
    -- Skip if no credit limit set
    IF v_credit_limit IS NULL OR v_credit_limit = 0 THEN
        RETURN NEW;
    END IF;
    
    -- Get current outstanding
    SELECT 
        COALESCE(SUM(outstanding_amount), 0),
        COALESCE(SUM(CASE WHEN days_overdue > 0 THEN outstanding_amount ELSE 0 END), 0)
    INTO v_current_outstanding, v_overdue_amount
    FROM financial.customer_outstanding
    WHERE customer_id = NEW.customer_id
    AND status IN ('open', 'partial');
    
    -- Calculate total exposure
    v_order_value := NEW.final_amount;
    v_total_exposure := v_current_outstanding + v_order_value;
    
    -- Check if overdue exists
    IF v_overdue_amount > 0 THEN
        RAISE EXCEPTION 'Cannot confirm order. Customer % has overdue amount: ₹%',
            v_customer_name, v_overdue_amount;
    END IF;
    
    -- Check credit limit
    IF v_total_exposure > v_credit_limit THEN
        -- Create notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_audience,
            notification_data
        ) VALUES (
            NEW.org_id,
            'warning',
            'credit',
            'Credit Limit Exceeded',
            format('Order %s for %s exceeds credit limit. Limit: ₹%s, Exposure: ₹%s',
                NEW.order_number,
                v_customer_name,
                TO_CHAR(v_credit_limit, 'FM99,99,999'),
                TO_CHAR(v_total_exposure, 'FM99,99,999')),
            'high',
            'specific',
            jsonb_build_object(
                'order_id', NEW.order_id,
                'customer_id', NEW.customer_id,
                'credit_limit', v_credit_limit,
                'current_outstanding', v_current_outstanding,
                'order_value', v_order_value,
                'total_exposure', v_total_exposure
            )
        );
        
        -- Block order if strict credit control
        IF EXISTS (
            SELECT 1 FROM system_config.system_settings
            WHERE setting_key = 'strict_credit_control'
            AND setting_value = 'true'
            AND org_id = NEW.org_id
        ) THEN
            RAISE EXCEPTION 'Credit limit exceeded. Total exposure: ₹%, Limit: ₹%',
                v_total_exposure, v_credit_limit;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_credit_limit
    BEFORE UPDATE OF order_status ON sales.orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'confirmed')
    EXECUTE FUNCTION check_customer_credit_limit();

-- =============================================
-- 4. OUTSTANDING AGING UPDATE
-- =============================================
CREATE OR REPLACE FUNCTION update_outstanding_aging()
RETURNS TRIGGER AS $$
BEGIN
    -- This function is called by a scheduled job daily
    -- Update aging for all open items
    UPDATE financial.customer_outstanding
    SET 
        days_overdue = GREATEST(0, (CURRENT_DATE - due_date)::INTEGER),
        aging_bucket = CASE
            WHEN due_date >= CURRENT_DATE THEN 'current'
            WHEN (CURRENT_DATE - due_date) <= 30 THEN '1-30'
            WHEN (CURRENT_DATE - due_date) <= 60 THEN '31-60'
            WHEN (CURRENT_DATE - due_date) <= 90 THEN '61-90'
            WHEN (CURRENT_DATE - due_date) <= 120 THEN '91-120'
            ELSE 'above_120'
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE status IN ('open', 'partial')
    AND org_id = NEW.org_id;
    
    -- Send alerts for critical overdue
    INSERT INTO system_config.system_notifications (
        org_id,
        notification_type,
        notification_category,
        title,
        message,
        priority,
        target_audience,
        notification_data
    )
    SELECT DISTINCT
        co.org_id,
        'warning',
        'collection',
        'Critical Overdue Receivables',
        format('%s customers have receivables overdue by more than 90 days. Total: ₹%s',
            COUNT(DISTINCT co.customer_id),
            TO_CHAR(SUM(co.outstanding_amount), 'FM99,99,999')),
        'urgent',
        'collection_team',
        jsonb_build_object(
            'customer_count', COUNT(DISTINCT co.customer_id),
            'total_overdue', SUM(co.outstanding_amount),
            'oldest_days', MAX(co.days_overdue)
        )
    FROM financial.customer_outstanding co
    WHERE co.org_id = NEW.org_id
    AND co.days_overdue > 90
    AND co.status IN ('open', 'partial')
    GROUP BY co.org_id
    HAVING SUM(co.outstanding_amount) > 0;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. PDC MATURITY TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_pdc_maturity()
RETURNS TRIGGER AS $$
BEGIN
    -- Update PDC status based on cheque date
    IF NEW.cheque_date <= CURRENT_DATE AND OLD.pdc_status = 'pending' THEN
        NEW.pdc_status := 'due_for_deposit';
        
        -- Create notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'info',
            'banking',
            'PDC Due for Deposit',
            format('Cheque #%s from %s for ₹%s is due for deposit',
                NEW.cheque_number,
                NEW.party_name,
                TO_CHAR(NEW.cheque_amount, 'FM99,99,999')),
            'high',
            jsonb_build_object(
                'pdc_id', NEW.pdc_id,
                'cheque_number', NEW.cheque_number,
                'cheque_date', NEW.cheque_date,
                'amount', NEW.cheque_amount,
                'party_name', NEW.party_name
            )
        );
    END IF;
    
    -- Handle bounce
    IF NEW.pdc_status = 'bounced' AND OLD.pdc_status != 'bounced' THEN
        NEW.bounce_count := COALESCE(NEW.bounce_count, 0) + 1;
        
        -- Reverse payment allocation if exists
        IF NEW.payment_id IS NOT NULL THEN
            UPDATE financial.payments
            SET 
                payment_status = 'bounced',
                updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = NEW.payment_id;
            
            -- Reverse allocations
            UPDATE financial.payment_allocations
            SET 
                allocation_status = 'reversed',
                reversed_at = CURRENT_TIMESTAMP,
                reversal_reason = 'Cheque bounced'
            WHERE payment_id = NEW.payment_id;
        END IF;
        
        -- Create high priority notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            requires_acknowledgment,
            notification_data
        ) VALUES (
            NEW.org_id,
            'error',
            'banking',
            'Cheque Bounced',
            format('URGENT: Cheque #%s from %s for ₹%s has bounced. Bounce count: %s',
                NEW.cheque_number,
                NEW.party_name,
                TO_CHAR(NEW.cheque_amount, 'FM99,99,999'),
                NEW.bounce_count),
            'urgent',
            TRUE,
            jsonb_build_object(
                'pdc_id', NEW.pdc_id,
                'cheque_number', NEW.cheque_number,
                'amount', NEW.cheque_amount,
                'party_name', NEW.party_name,
                'bounce_count', NEW.bounce_count,
                'bounce_reason', NEW.bounce_reason
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_pdc_maturity
    BEFORE UPDATE ON financial.pdc_management
    FOR EACH ROW
    EXECUTE FUNCTION track_pdc_maturity();

-- =============================================
-- 6. CASH FLOW IMPACT TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION update_cash_flow_impact()
RETURNS TRIGGER AS $$
DECLARE
    v_impact_date DATE;
    v_impact_amount NUMERIC;
    v_impact_type TEXT;
BEGIN
    -- Determine impact based on operation
    CASE TG_TABLE_NAME
        WHEN 'payments' THEN
            v_impact_date := NEW.payment_date;
            v_impact_amount := NEW.payment_amount;
            v_impact_type := CASE 
                WHEN NEW.payment_type = 'receipt' THEN 'inflow'
                ELSE 'outflow'
            END;
            
        WHEN 'invoices' THEN
            IF NEW.invoice_status = 'posted' AND OLD.invoice_status != 'posted' THEN
                v_impact_date := NEW.due_date;
                v_impact_amount := NEW.final_amount - COALESCE(NEW.paid_amount, 0);
                v_impact_type := 'expected_inflow';
            ELSE
                RETURN NEW;
            END IF;
            
        WHEN 'purchase_orders' THEN
            IF NEW.po_status = 'approved' AND OLD.po_status != 'approved' THEN
                v_impact_date := NEW.due_date;
                v_impact_amount := NEW.total_amount;
                v_impact_type := 'expected_outflow';
            ELSE
                RETURN NEW;
            END IF;
    END CASE;
    
    -- Update or create cash flow forecast
    INSERT INTO financial.cash_flow_forecast (
        org_id,
        forecast_date,
        forecast_type,
        opening_balance,
        customer_collections,
        supplier_payments,
        projected_closing_balance
    )
    SELECT 
        NEW.org_id,
        v_impact_date,
        'daily',
        COALESCE(
            (SELECT projected_closing_balance 
             FROM financial.cash_flow_forecast 
             WHERE org_id = NEW.org_id 
             AND forecast_date = v_impact_date - INTERVAL '1 day'),
            0
        ),
        CASE WHEN v_impact_type IN ('inflow', 'expected_inflow') 
             THEN v_impact_amount ELSE 0 END,
        CASE WHEN v_impact_type IN ('outflow', 'expected_outflow') 
             THEN v_impact_amount ELSE 0 END,
        0
    ON CONFLICT (org_id, forecast_date) DO UPDATE
    SET 
        customer_collections = financial.cash_flow_forecast.customer_collections + 
            CASE WHEN v_impact_type IN ('inflow', 'expected_inflow') 
                 THEN v_impact_amount ELSE 0 END,
        supplier_payments = financial.cash_flow_forecast.supplier_payments + 
            CASE WHEN v_impact_type IN ('outflow', 'expected_outflow') 
                 THEN v_impact_amount ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Recalculate closing balance
    UPDATE financial.cash_flow_forecast
    SET 
        total_inflows = customer_collections + other_income,
        total_outflows = supplier_payments + salary_payments + other_expenses,
        projected_closing_balance = opening_balance + 
            (customer_collections + other_income) - 
            (supplier_payments + salary_payments + other_expenses)
    WHERE org_id = NEW.org_id
    AND forecast_date = v_impact_date;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_cash_flow_impact
    AFTER INSERT OR UPDATE ON financial.payments
    FOR EACH ROW
    WHEN (NEW.payment_status IN ('approved', 'processed'))
    EXECUTE FUNCTION update_cash_flow_impact();

CREATE TRIGGER trigger_invoice_cash_flow_impact
    AFTER UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_flow_impact();

CREATE TRIGGER trigger_po_cash_flow_impact
    AFTER UPDATE OF po_status ON procurement.purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_flow_impact();

-- =============================================
-- 7. BANK RECONCILIATION MATCHING
-- =============================================
CREATE OR REPLACE FUNCTION auto_match_bank_transactions()
RETURNS TRIGGER AS $$
DECLARE
    v_matched_payment RECORD;
    v_tolerance NUMERIC := 0.01; -- 1 paisa tolerance
BEGIN
    -- Try to match with payments
    FOR v_matched_payment IN
        SELECT 
            p.payment_id,
            p.payment_amount,
            p.reference_number
        FROM financial.payments p
        WHERE p.org_id = NEW.org_id
        AND p.bank_account_id = NEW.bank_account_id
        AND p.payment_status IN ('processed', 'cleared')
        AND ABS(p.payment_amount - NEW.transaction_amount) <= v_tolerance
        AND p.payment_date BETWEEN NEW.transaction_date - INTERVAL '3 days' 
                                AND NEW.transaction_date + INTERVAL '3 days'
        AND NOT EXISTS (
            SELECT 1 FROM financial.bank_reconciliation_items bri
            WHERE bri.transaction_id = p.payment_id
            AND bri.transaction_type = 'payment'
            AND bri.is_reconciled = TRUE
        )
        ORDER BY ABS(p.payment_date - NEW.transaction_date)
        LIMIT 1
    LOOP
        -- Create reconciliation item
        INSERT INTO financial.bank_reconciliation_items (
            reconciliation_id,
            transaction_type,
            transaction_id,
            transaction_date,
            transaction_amount,
            is_reconciled,
            reconciled_amount,
            statement_reference,
            statement_date
        ) VALUES (
            NEW.reconciliation_id,
            'payment',
            v_matched_payment.payment_id,
            NEW.transaction_date,
            v_matched_payment.payment_amount,
            TRUE,
            NEW.transaction_amount,
            NEW.statement_reference,
            NEW.statement_date
        );
        
        -- Update payment status
        UPDATE financial.payments
        SET 
            payment_status = 'cleared',
            clearance_date = NEW.transaction_date,
            updated_at = CURRENT_TIMESTAMP
        WHERE payment_id = v_matched_payment.payment_id;
        
        -- Mark this transaction as matched
        NEW.is_reconciled := TRUE;
        NEW.notes := format('Auto-matched with payment %s', v_matched_payment.reference_number);
        
        EXIT; -- Only match one payment
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_bank_reconciliation
    BEFORE INSERT ON financial.bank_reconciliation_items
    FOR EACH ROW
    WHEN (NEW.transaction_type = 'bank_transaction' AND NOT NEW.is_reconciled)
    EXECUTE FUNCTION auto_match_bank_transactions();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_journal_entries_status ON financial.journal_entries(entry_status);
CREATE INDEX idx_payment_allocations_payment ON financial.payment_allocations(payment_id);
CREATE INDEX idx_customer_outstanding_overdue ON financial.customer_outstanding(customer_id, days_overdue);
CREATE INDEX idx_pdc_cheque_date_pending ON financial.pdc_management(cheque_date) WHERE pdc_status = 'pending';
CREATE INDEX idx_cash_flow_forecast_date ON financial.cash_flow_forecast(org_id, forecast_date);

-- Add comments
COMMENT ON FUNCTION validate_journal_entry_balance() IS 'Ensures journal entries are balanced before posting';
COMMENT ON FUNCTION check_customer_credit_limit() IS 'Validates customer credit limit before order confirmation';
COMMENT ON FUNCTION track_pdc_maturity() IS 'Tracks post-dated cheque maturity and handles bounces';
COMMENT ON FUNCTION update_cash_flow_impact() IS 'Updates cash flow forecast based on transactions';