-- =============================================
-- CREDIT MANAGEMENT TRIGGERS
-- =============================================
-- Schema: financial, parties
-- Credit limits, aging, and collection management
-- =============================================

-- =============================================
-- 1. CREDIT LIMIT ENFORCEMENT
-- =============================================
CREATE OR REPLACE FUNCTION enforce_customer_credit_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_credit_info RECORD;
    v_total_exposure NUMERIC;
    v_overdue_details RECORD;
    v_credit_block_reason TEXT;
BEGIN
    -- Get customer credit information
    SELECT 
        customer_name,
        (credit_info->>'credit_limit')::NUMERIC as credit_limit,
        (credit_info->>'credit_days')::INTEGER as credit_days,
        (credit_info->>'credit_rating')::TEXT as credit_rating,
        (credit_info->>'overdue_interest_rate')::NUMERIC as overdue_interest,
        blacklisted,
        kyc_status
    INTO v_credit_info
    FROM parties.customers
    WHERE customer_id = NEW.customer_id;
    
    -- Check blacklist status
    IF v_credit_info.blacklisted THEN
        v_credit_block_reason := 'Customer is blacklisted';
        RAISE EXCEPTION 'Cannot process transaction: %', v_credit_block_reason;
    END IF;
    
    -- Check KYC status
    IF v_credit_info.kyc_status != 'verified' THEN
        v_credit_block_reason := 'Customer KYC not verified';
        -- Log but allow based on settings
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
            'warning',
            'credit',
            'Unverified KYC',
            format('Transaction for %s processed with unverified KYC',
                v_credit_info.customer_name),
            'medium',
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'transaction_type', TG_TABLE_NAME,
                'transaction_id', NEW.order_id
            )
        );
    END IF;
    
    -- Calculate total exposure
    SELECT 
        COALESCE(SUM(outstanding_amount), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN days_overdue > 0 THEN outstanding_amount ELSE 0 END), 0) as overdue_amount,
        MAX(days_overdue) as max_overdue_days,
        COUNT(CASE WHEN days_overdue > 30 THEN 1 END) as overdue_invoices_30_plus
    INTO v_overdue_details
    FROM financial.customer_outstanding
    WHERE customer_id = NEW.customer_id
    AND status IN ('open', 'partial');
    
    v_total_exposure := v_overdue_details.total_outstanding + NEW.final_amount;
    
    -- Credit checks
    IF v_credit_info.credit_limit IS NOT NULL AND v_credit_info.credit_limit > 0 THEN
        -- Check overdue
        IF v_overdue_details.max_overdue_days > 0 THEN
            -- Check overdue tolerance
            IF v_overdue_details.max_overdue_days > 60 OR 
               v_overdue_details.overdue_invoices_30_plus > 3 THEN
                v_credit_block_reason := format(
                    'Customer has overdue payments. Max overdue: %s days, Amount: ₹%s',
                    v_overdue_details.max_overdue_days,
                    TO_CHAR(v_overdue_details.overdue_amount, 'FM99,99,999')
                );
                
                -- Block if strict credit control
                IF EXISTS (
                    SELECT 1 FROM system_config.system_settings
                    WHERE setting_key = 'block_orders_on_overdue'
                    AND setting_value = 'true'
                    AND org_id = NEW.org_id
                ) THEN
                    RAISE EXCEPTION 'Credit blocked: %', v_credit_block_reason;
                END IF;
            END IF;
            
            -- Apply overdue interest if applicable
            IF v_credit_info.overdue_interest > 0 AND 
               v_overdue_details.max_overdue_days > v_credit_info.credit_days THEN
                -- Create interest charge (simplified)
                INSERT INTO financial.journal_entries (
                    org_id,
                    branch_id,
                    journal_number,
                    journal_date,
                    journal_type,
                    reference_type,
                    reference_id,
                    narration,
                    created_by
                )
                SELECT 
                    NEW.org_id,
                    NEW.branch_id,
                    'INT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                        LPAD(nextval('financial.journal_entries_journal_id_seq')::TEXT, 6, '0'),
                    CURRENT_DATE,
                    'interest',
                    'customer',
                    NEW.customer_id,
                    format('Overdue interest for %s', v_credit_info.customer_name),
                    NEW.created_by
                WHERE NOT EXISTS (
                    SELECT 1 FROM financial.journal_entries
                    WHERE reference_type = 'customer'
                    AND reference_id = NEW.customer_id
                    AND journal_type = 'interest'
                    AND journal_date = CURRENT_DATE
                );
            END IF;
        END IF;
        
        -- Check credit limit
        IF v_total_exposure > v_credit_info.credit_limit THEN
            -- Calculate exceeded amount
            DECLARE
                v_exceeded_amount NUMERIC := v_total_exposure - v_credit_info.credit_limit;
                v_exceeded_percent NUMERIC := (v_exceeded_amount * 100.0 / v_credit_info.credit_limit);
            BEGIN
                -- Create alert
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
                    'error',
                    'credit',
                    'Credit Limit Exceeded',
                    format('%s has exceeded credit limit by ₹%s (%s%%)',
                        v_credit_info.customer_name,
                        TO_CHAR(v_exceeded_amount, 'FM99,99,999'),
                        ROUND(v_exceeded_percent, 1)),
                    'urgent',
                    'credit_team',
                    jsonb_build_object(
                        'customer_id', NEW.customer_id,
                        'customer_name', v_credit_info.customer_name,
                        'credit_limit', v_credit_info.credit_limit,
                        'current_exposure', v_total_exposure,
                        'exceeded_amount', v_exceeded_amount,
                        'exceeded_percent', v_exceeded_percent,
                        'transaction_amount', NEW.final_amount
                    )
                );
                
                -- Check if should block
                IF v_exceeded_percent > 20 OR -- More than 20% over limit
                   v_credit_info.credit_rating IN ('C', 'D') THEN
                    v_credit_block_reason := format(
                        'Credit limit exceeded by %s%%. Limit: ₹%s, Exposure: ₹%s',
                        ROUND(v_exceeded_percent, 1),
                        TO_CHAR(v_credit_info.credit_limit, 'FM99,99,999'),
                        TO_CHAR(v_total_exposure, 'FM99,99,999')
                    );
                    RAISE EXCEPTION 'Credit blocked: %', v_credit_block_reason;
                END IF;
            END;
        END IF;
    END IF;
    
    -- Update customer metrics
    UPDATE parties.customers
    SET 
        last_transaction_date = CURRENT_DATE,
        total_transactions = total_transactions + 1,
        total_business_amount = total_business_amount + NEW.final_amount,
        average_order_value = (total_business_amount + NEW.final_amount) / (total_transactions + 1),
        updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = NEW.customer_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_credit_limit_orders
    BEFORE UPDATE OF order_status ON sales.orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'confirmed' AND OLD.order_status != 'confirmed')
    EXECUTE FUNCTION enforce_customer_credit_limit();

-- =============================================
-- 2. OUTSTANDING AGING AUTOMATION
-- =============================================
CREATE OR REPLACE FUNCTION update_outstanding_aging_buckets()
RETURNS TRIGGER AS $$
DECLARE
    v_aging_summary RECORD;
    v_collection_priority TEXT;
BEGIN
    -- Update aging bucket and days overdue
    NEW.days_overdue := GREATEST(0, (CURRENT_DATE - NEW.due_date)::INTEGER);
    NEW.aging_bucket := CASE
        WHEN NEW.due_date >= CURRENT_DATE THEN 'current'
        WHEN NEW.days_overdue <= 30 THEN '1-30'
        WHEN NEW.days_overdue <= 60 THEN '31-60'
        WHEN NEW.days_overdue <= 90 THEN '61-90'
        WHEN NEW.days_overdue <= 120 THEN '91-120'
        ELSE 'above_120'
    END;
    
    -- Set collection priority
    v_collection_priority := CASE
        WHEN NEW.days_overdue > 120 THEN 'critical'
        WHEN NEW.days_overdue > 90 THEN 'high'
        WHEN NEW.days_overdue > 60 THEN 'medium'
        WHEN NEW.days_overdue > 30 THEN 'low'
        ELSE 'none'
    END;
    
    -- Create collection reminders
    IF NEW.days_overdue > 0 AND OLD.days_overdue = 0 THEN
        -- First overdue notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        )
        SELECT 
            NEW.org_id,
            'warning',
            'collection',
            'Invoice Overdue',
            format('Invoice %s for %s is now overdue by %s days. Amount: ₹%s',
                NEW.document_number,
                c.customer_name,
                NEW.days_overdue,
                TO_CHAR(NEW.outstanding_amount, 'FM99,99,999')),
            'high',
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'customer_name', c.customer_name,
                'document_type', NEW.document_type,
                'document_number', NEW.document_number,
                'days_overdue', NEW.days_overdue,
                'outstanding_amount', NEW.outstanding_amount
            )
        FROM parties.customers c
        WHERE c.customer_id = NEW.customer_id;
        
        -- Set follow-up date
        NEW.follow_up_date := CURRENT_DATE + INTERVAL '3 days';
    END IF;
    
    -- Escalation for long overdue
    IF NEW.days_overdue IN (30, 60, 90, 120) THEN
        -- Get customer aging summary
        SELECT 
            COUNT(*) as total_invoices,
            SUM(outstanding_amount) as total_outstanding,
            MAX(days_overdue) as max_overdue,
            STRING_AGG(document_number, ', ' ORDER BY days_overdue DESC) as overdue_invoices
        INTO v_aging_summary
        FROM financial.customer_outstanding
        WHERE customer_id = NEW.customer_id
        AND status IN ('open', 'partial')
        AND days_overdue > 0;
        
        -- Create escalation notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_audience,
            requires_acknowledgment,
            notification_data
        )
        SELECT 
            NEW.org_id,
            'error',
            'collection',
            format('Collection Escalation - %s Days', NEW.days_overdue),
            format('Customer %s has %s overdue invoices totaling ₹%s. Max overdue: %s days',
                c.customer_name,
                v_aging_summary.total_invoices,
                TO_CHAR(v_aging_summary.total_outstanding, 'FM99,99,999'),
                v_aging_summary.max_overdue),
            'urgent',
            'collection_team',
            TRUE,
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'customer_name', c.customer_name,
                'total_invoices', v_aging_summary.total_invoices,
                'total_outstanding', v_aging_summary.total_outstanding,
                'max_overdue_days', v_aging_summary.max_overdue,
                'overdue_invoices', v_aging_summary.overdue_invoices,
                'collection_priority', v_collection_priority
            )
        FROM parties.customers c
        WHERE c.customer_id = NEW.customer_id;
        
        -- Auto-generate collection letter
        IF NEW.days_overdue >= 60 THEN
            INSERT INTO analytics.report_execution_history (
                org_id,
                template_id,
                execution_type,
                parameters_used,
                executed_by
            )
            SELECT 
                NEW.org_id,
                rt.template_id,
                'automatic',
                jsonb_build_object(
                    'customer_id', NEW.customer_id,
                    'outstanding_id', NEW.outstanding_id,
                    'overdue_days', NEW.days_overdue
                ),
                0 -- System user
            FROM analytics.report_templates rt
            WHERE rt.template_code = 'COLLECTION_LETTER_' || 
                CASE 
                    WHEN NEW.days_overdue >= 90 THEN 'FINAL'
                    WHEN NEW.days_overdue >= 60 THEN 'SECOND'
                    ELSE 'FIRST'
                END
            AND rt.org_id = NEW.org_id
            AND rt.is_active = TRUE;
        END IF;
    END IF;
    
    -- Update promised date tracking
    IF NEW.promised_date IS NOT NULL AND NEW.promised_date < CURRENT_DATE THEN
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        )
        SELECT 
            NEW.org_id,
            'warning',
            'collection',
            'Broken Payment Promise',
            format('Customer %s failed to pay %s by promised date %s',
                c.customer_name,
                NEW.document_number,
                TO_CHAR(NEW.promised_date, 'DD/MM/YYYY')),
            'high',
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'document_number', NEW.document_number,
                'promised_date', NEW.promised_date,
                'outstanding_amount', NEW.outstanding_amount
            )
        FROM parties.customers c
        WHERE c.customer_id = NEW.customer_id;
        
        -- Reset promised date
        NEW.promised_date := NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_aging_buckets
    BEFORE UPDATE ON financial.customer_outstanding
    FOR EACH ROW
    WHEN (OLD.updated_at < CURRENT_DATE OR NEW.due_date != OLD.due_date)
    EXECUTE FUNCTION update_outstanding_aging_buckets();

-- =============================================
-- 3. AUTOMATIC WRITE-OFF MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_automatic_writeoff()
RETURNS TRIGGER AS $$
DECLARE
    v_writeoff_limit NUMERIC;
    v_writeoff_days INTEGER;
    v_approval_required BOOLEAN;
BEGIN
    -- Get write-off settings
    SELECT 
        (setting_value)::NUMERIC,
        (SELECT (setting_value)::INTEGER 
         FROM system_config.system_settings 
         WHERE setting_key = 'auto_writeoff_days' 
         AND org_id = NEW.org_id),
        (SELECT (setting_value)::BOOLEAN 
         FROM system_config.system_settings 
         WHERE setting_key = 'writeoff_approval_required' 
         AND org_id = NEW.org_id)
    INTO v_writeoff_limit, v_writeoff_days, v_approval_required
    FROM system_config.system_settings
    WHERE setting_key = 'auto_writeoff_limit'
    AND org_id = NEW.org_id;
    
    -- Default values if not configured
    v_writeoff_limit := COALESCE(v_writeoff_limit, 1000);
    v_writeoff_days := COALESCE(v_writeoff_days, 365);
    v_approval_required := COALESCE(v_approval_required, TRUE);
    
    -- Check write-off criteria
    IF NEW.days_overdue > v_writeoff_days AND 
       NEW.outstanding_amount <= v_writeoff_limit AND
       NEW.status != 'written_off' THEN
        
        IF v_approval_required THEN
            -- Create approval request
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_audience,
                requires_acknowledgment,
                notification_data
            ) VALUES (
                NEW.org_id,
                'info',
                'finance',
                'Write-off Approval Required',
                format('Outstanding amount ₹%s for %s (overdue %s days) eligible for write-off',
                    TO_CHAR(NEW.outstanding_amount, 'FM99,99,999'),
                    NEW.document_number,
                    NEW.days_overdue),
                'medium',
                'finance_team',
                TRUE,
                jsonb_build_object(
                    'outstanding_id', NEW.outstanding_id,
                    'customer_id', NEW.customer_id,
                    'document_number', NEW.document_number,
                    'outstanding_amount', NEW.outstanding_amount,
                    'days_overdue', NEW.days_overdue,
                    'action', 'approve_writeoff'
                )
            );
        ELSE
            -- Auto write-off
            NEW.write_off_amount := NEW.outstanding_amount;
            NEW.write_off_date := CURRENT_DATE;
            NEW.write_off_reason := format('Auto write-off: Amount below ₹%s and overdue > %s days',
                v_writeoff_limit, v_writeoff_days);
            NEW.outstanding_amount := 0;
            NEW.status := 'written_off';
            
            -- Create journal entry for write-off
            INSERT INTO financial.journal_entries (
                org_id,
                branch_id,
                journal_number,
                journal_date,
                journal_type,
                reference_type,
                reference_id,
                reference_number,
                narration,
                entry_status,
                created_by
            )
            SELECT 
                NEW.org_id,
                i.branch_id,
                'WO-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                    LPAD(nextval('financial.journal_entries_journal_id_seq')::TEXT, 6, '0'),
                CURRENT_DATE,
                'write_off',
                'outstanding',
                NEW.outstanding_id,
                NEW.document_number,
                NEW.write_off_reason,
                'posted',
                0 -- System user
            FROM sales.invoices i
            WHERE i.invoice_number = NEW.document_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_writeoff
    BEFORE UPDATE ON financial.customer_outstanding
    FOR EACH ROW
    WHEN (NEW.days_overdue > 0)
    EXECUTE FUNCTION manage_automatic_writeoff();

-- =============================================
-- 4. CUSTOMER CATEGORY AUTO-UPDATE
-- =============================================
CREATE OR REPLACE FUNCTION update_customer_category()
RETURNS TRIGGER AS $$
DECLARE
    v_payment_history RECORD;
    v_new_category TEXT;
    v_new_grade TEXT;
    v_credit_limit_multiplier NUMERIC;
BEGIN
    -- Analyze payment history
    SELECT 
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN days_overdue = 0 THEN 1 END) as on_time_payments,
        AVG(days_overdue) as avg_payment_days,
        MAX(days_overdue) as max_overdue_days,
        SUM(original_amount) as total_business
    INTO v_payment_history
    FROM financial.customer_outstanding
    WHERE customer_id = NEW.customer_id
    AND document_date >= CURRENT_DATE - INTERVAL '1 year';
    
    -- Determine category and grade
    IF v_payment_history.total_business > 10000000 AND -- 1 Crore+
       v_payment_history.avg_payment_days < 15 AND
       v_payment_history.on_time_payments::NUMERIC / NULLIF(v_payment_history.total_invoices, 0) > 0.9 THEN
        v_new_category := 'vip';
        v_new_grade := 'A';
        v_credit_limit_multiplier := 2.0;
        
    ELSIF v_payment_history.total_business > 5000000 AND -- 50 Lakh+
          v_payment_history.avg_payment_days < 30 AND
          v_payment_history.on_time_payments::NUMERIC / NULLIF(v_payment_history.total_invoices, 0) > 0.8 THEN
        v_new_category := 'premium';
        v_new_grade := 'B';
        v_credit_limit_multiplier := 1.5;
        
    ELSIF v_payment_history.max_overdue_days > 90 OR
          v_payment_history.avg_payment_days > 60 THEN
        v_new_category := 'watch';
        v_new_grade := 'D';
        v_credit_limit_multiplier := 0.5;
        
    ELSE
        v_new_category := 'regular';
        v_new_grade := 'C';
        v_credit_limit_multiplier := 1.0;
    END IF;
    
    -- Update customer if changed
    UPDATE parties.customers
    SET 
        customer_category = v_new_category,
        customer_grade = v_new_grade,
        credit_info = credit_info || 
            jsonb_build_object(
                'auto_updated', CURRENT_DATE,
                'payment_score', ROUND(
                    v_payment_history.on_time_payments::NUMERIC / 
                    NULLIF(v_payment_history.total_invoices, 0) * 100, 2
                ),
                'suggested_limit_multiplier', v_credit_limit_multiplier
            ),
        updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = NEW.customer_id
    AND (customer_category != v_new_category OR customer_grade != v_new_grade);
    
    -- Update loyalty points based on payment
    IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
        UPDATE parties.customers
        SET 
            loyalty_points = loyalty_points + FLOOR(NEW.original_amount / 1000), -- 1 point per 1000
            loyalty_tier = CASE
                WHEN loyalty_points + FLOOR(NEW.original_amount / 1000) >= 10000 THEN 'platinum'
                WHEN loyalty_points + FLOOR(NEW.original_amount / 1000) >= 5000 THEN 'gold'
                WHEN loyalty_points + FLOOR(NEW.original_amount / 1000) >= 2000 THEN 'silver'
                ELSE 'bronze'
            END
        WHERE customer_id = NEW.customer_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_customer_category
    AFTER UPDATE OF status ON financial.customer_outstanding
    FOR EACH ROW
    WHEN (NEW.status IN ('paid', 'written_off'))
    EXECUTE FUNCTION update_customer_category();

-- =============================================
-- 5. COLLECTION EFFICIENCY TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_collection_efficiency()
RETURNS TRIGGER AS $$
DECLARE
    v_collector_stats RECORD;
    v_efficiency_score NUMERIC;
    v_target_achievement NUMERIC;
BEGIN
    -- Track collection visit results
    IF TG_TABLE_NAME = 'customer_visits' AND NEW.visit_purpose = 'collection' THEN
        -- Calculate collector efficiency
        SELECT 
            COUNT(*) as total_visits,
            SUM(CASE WHEN collection_amount > 0 THEN 1 ELSE 0 END) as successful_visits,
            SUM(collection_amount) as total_collected,
            AVG(EXTRACT(EPOCH FROM (check_out_time - check_in_time))/60) as avg_visit_duration_mins
        INTO v_collector_stats
        FROM sales.customer_visits
        WHERE visited_by = NEW.visited_by
        AND visit_purpose = 'collection'
        AND visit_date >= DATE_TRUNC('month', CURRENT_DATE);
        
        -- Calculate efficiency score
        v_efficiency_score := CASE
            WHEN v_collector_stats.total_visits > 0 THEN
                (v_collector_stats.successful_visits::NUMERIC / v_collector_stats.total_visits) * 100
            ELSE 0
        END;
        
        -- Update sales target for collection
        UPDATE sales.sales_targets
        SET 
            visits_achieved = v_collector_stats.total_visits,
            revenue_achieved = v_collector_stats.total_collected,
            overall_achievement_percent = v_efficiency_score,
            updated_at = CURRENT_TIMESTAMP
        WHERE target_type = 'user'
        AND target_entity_id = NEW.visited_by
        AND target_year = EXTRACT(YEAR FROM NEW.visit_date)
        AND target_month = EXTRACT(MONTH FROM NEW.visit_date);
        
        -- Create performance alert
        IF v_efficiency_score < 50 AND v_collector_stats.total_visits > 10 THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_users
            ) VALUES (
                NEW.org_id,
                'warning',
                'performance',
                'Low Collection Efficiency',
                format('Your collection efficiency is %s%% this month. Target: 70%%',
                    ROUND(v_efficiency_score, 1)),
                'medium',
                ARRAY[NEW.visited_by]
            );
        END IF;
    END IF;
    
    -- Track payment collection
    IF TG_TABLE_NAME = 'payments' AND NEW.payment_type = 'receipt' THEN
        -- Update outstanding
        UPDATE financial.customer_outstanding
        SET 
            paid_amount = paid_amount + NEW.allocated_amount,
            outstanding_amount = outstanding_amount - NEW.allocated_amount,
            status = CASE 
                WHEN outstanding_amount - NEW.allocated_amount <= 0 THEN 'paid'
                ELSE 'partial'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE outstanding_id IN (
            SELECT reference_id 
            FROM financial.payment_allocations
            WHERE payment_id = NEW.payment_id
            AND reference_type = 'invoice'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_collection_visit
    AFTER INSERT OR UPDATE ON sales.customer_visits
    FOR EACH ROW
    WHEN (NEW.visit_purpose = 'collection')
    EXECUTE FUNCTION track_collection_efficiency();

CREATE TRIGGER trigger_track_collection_payment
    AFTER UPDATE OF payment_status ON financial.payments
    FOR EACH ROW
    WHEN (NEW.payment_status = 'cleared' AND NEW.payment_type = 'receipt')
    EXECUTE FUNCTION track_collection_efficiency();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_customer_outstanding_customer ON financial.customer_outstanding(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_outstanding_aging ON financial.customer_outstanding(aging_bucket, days_overdue);
CREATE INDEX idx_customer_outstanding_followup ON financial.customer_outstanding(follow_up_date) 
    WHERE status IN ('open', 'partial');
CREATE INDEX idx_customers_category ON parties.customers(customer_category, customer_grade);
CREATE INDEX idx_customer_visits_collector ON sales.customer_visits(visited_by, visit_purpose, visit_date);

-- Add comments
COMMENT ON FUNCTION enforce_customer_credit_limit() IS 'Enforces credit limits with multiple check levels';
COMMENT ON FUNCTION update_outstanding_aging_buckets() IS 'Manages aging buckets and collection escalation';
COMMENT ON FUNCTION manage_automatic_writeoff() IS 'Handles automatic write-off based on configured rules';
COMMENT ON FUNCTION update_customer_category() IS 'Auto-updates customer category based on payment behavior';