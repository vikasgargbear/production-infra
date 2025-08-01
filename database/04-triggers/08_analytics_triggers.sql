-- =============================================
-- ANALYTICS AND REPORTING TRIGGERS
-- =============================================
-- Schema: analytics
-- KPI tracking, alerts, and report generation
-- =============================================

-- =============================================
-- 1. REAL-TIME KPI CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_realtime_kpis()
RETURNS TRIGGER AS $$
DECLARE
    v_kpi_type TEXT;
    v_kpi_value NUMERIC;
    v_period_start DATE;
    v_period_end DATE;
    v_comparison_value NUMERIC;
    v_trend TEXT;
BEGIN
    -- Determine KPI type based on source table
    CASE TG_TABLE_NAME
        WHEN 'invoices' THEN
            v_kpi_type := 'sales_revenue';
            v_kpi_value := NEW.final_amount;
            
        WHEN 'orders' THEN
            v_kpi_type := 'order_count';
            v_kpi_value := 1;
            
        WHEN 'inventory_movements' THEN
            IF NEW.movement_type = 'sale' AND NEW.movement_direction = 'out' THEN
                v_kpi_type := 'inventory_turnover';
                v_kpi_value := NEW.total_cost;
            END IF;
            
        WHEN 'customer_outstanding' THEN
            v_kpi_type := 'collection_efficiency';
            v_kpi_value := CASE 
                WHEN NEW.status = 'paid' THEN NEW.original_amount
                ELSE 0
            END;
            
        ELSE
            RETURN NEW;
    END CASE;
    
    -- Set period (current day)
    v_period_start := CURRENT_DATE;
    v_period_end := CURRENT_DATE;
    
    -- Update or insert KPI value
    INSERT INTO analytics.kpi_actuals (
        org_id,
        kpi_code,
        period_type,
        period_start,
        period_end,
        actual_value,
        unit_of_measure,
        data_source,
        last_updated
    )
    SELECT 
        COALESCE(NEW.org_id, 1),
        v_kpi_type,
        'daily',
        v_period_start,
        v_period_end,
        v_kpi_value,
        CASE v_kpi_type
            WHEN 'sales_revenue' THEN 'currency'
            WHEN 'order_count' THEN 'count'
            WHEN 'inventory_turnover' THEN 'currency'
            WHEN 'collection_efficiency' THEN 'currency'
        END,
        TG_TABLE_NAME,
        CURRENT_TIMESTAMP
    ON CONFLICT (org_id, kpi_code, period_type, period_start) 
    DO UPDATE SET
        actual_value = analytics.kpi_actuals.actual_value + v_kpi_value,
        last_updated = CURRENT_TIMESTAMP;
    
    -- Calculate trend
    SELECT actual_value
    INTO v_comparison_value
    FROM analytics.kpi_actuals
    WHERE org_id = COALESCE(NEW.org_id, 1)
    AND kpi_code = v_kpi_type
    AND period_type = 'daily'
    AND period_start = v_period_start - INTERVAL '1 day';
    
    v_trend := CASE
        WHEN v_comparison_value IS NULL THEN 'new'
        WHEN v_comparison_value = 0 THEN 'stable'
        WHEN ((v_kpi_value - v_comparison_value) / v_comparison_value * 100) > 10 THEN 'improving'
        WHEN ((v_kpi_value - v_comparison_value) / v_comparison_value * 100) < -10 THEN 'declining'
        ELSE 'stable'
    END;
    
    -- Check for KPI alerts
    PERFORM check_kpi_thresholds(
        COALESCE(NEW.org_id, 1),
        v_kpi_type,
        v_kpi_value,
        v_trend
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER trigger_kpi_sales
    AFTER INSERT OR UPDATE OF invoice_status ON sales.invoices
    FOR EACH ROW
    WHEN (NEW.invoice_status = 'posted')
    EXECUTE FUNCTION calculate_realtime_kpis();

CREATE TRIGGER trigger_kpi_orders
    AFTER INSERT OR UPDATE OF order_status ON sales.orders
    FOR EACH ROW
    WHEN (NEW.order_status = 'confirmed')
    EXECUTE FUNCTION calculate_realtime_kpis();

-- =============================================
-- 2. KPI THRESHOLD MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION check_kpi_thresholds(
    p_org_id INTEGER,
    p_kpi_code TEXT,
    p_actual_value NUMERIC,
    p_trend TEXT
)
RETURNS VOID AS $$
DECLARE
    v_kpi_config RECORD;
    v_threshold_breached BOOLEAN := FALSE;
    v_alert_type TEXT;
    v_alert_message TEXT;
BEGIN
    -- Get KPI configuration
    SELECT 
        k.*,
        kt.min_threshold,
        kt.max_threshold,
        kt.target_value
    INTO v_kpi_config
    FROM analytics.kpi_definitions k
    LEFT JOIN analytics.kpi_targets kt ON k.kpi_code = kt.kpi_code
        AND kt.org_id = p_org_id
        AND kt.is_active = TRUE
    WHERE k.kpi_code = p_kpi_code
    AND k.is_active = TRUE;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Check thresholds
    IF v_kpi_config.min_threshold IS NOT NULL AND p_actual_value < v_kpi_config.min_threshold THEN
        v_threshold_breached := TRUE;
        v_alert_type := 'below_minimum';
        v_alert_message := format('%s is below minimum threshold. Current: %s, Minimum: %s',
            v_kpi_config.kpi_name,
            p_actual_value,
            v_kpi_config.min_threshold);
            
    ELSIF v_kpi_config.max_threshold IS NOT NULL AND p_actual_value > v_kpi_config.max_threshold THEN
        v_threshold_breached := TRUE;
        v_alert_type := 'above_maximum';
        v_alert_message := format('%s exceeded maximum threshold. Current: %s, Maximum: %s',
            v_kpi_config.kpi_name,
            p_actual_value,
            v_kpi_config.max_threshold);
    END IF;
    
    -- Create alert if threshold breached
    IF v_threshold_breached THEN
        INSERT INTO analytics.kpi_alerts (
            org_id,
            kpi_code,
            alert_type,
            alert_message,
            actual_value,
            threshold_value,
            severity,
            created_at
        ) VALUES (
            p_org_id,
            p_kpi_code,
            v_alert_type,
            v_alert_message,
            p_actual_value,
            CASE v_alert_type
                WHEN 'below_minimum' THEN v_kpi_config.min_threshold
                ELSE v_kpi_config.max_threshold
            END,
            CASE 
                WHEN v_kpi_config.alert_priority = 'critical' THEN 'high'
                ELSE 'medium'
            END,
            CURRENT_TIMESTAMP
        );
        
        -- Send notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            p_org_id,
            'warning',
            'analytics',
            format('KPI Alert: %s', v_kpi_config.kpi_name),
            v_alert_message,
            v_kpi_config.alert_priority,
            jsonb_build_object(
                'kpi_code', p_kpi_code,
                'actual_value', p_actual_value,
                'threshold_breached', v_alert_type,
                'trend', p_trend
            )
        );
    END IF;
    
    -- Check for achievement milestones
    IF v_kpi_config.target_value IS NOT NULL THEN
        DECLARE
            v_achievement_percent NUMERIC;
        BEGIN
            v_achievement_percent := (p_actual_value / v_kpi_config.target_value) * 100;
            
            -- Milestone notifications
            IF v_achievement_percent >= 100 AND 
               NOT EXISTS (
                   SELECT 1 FROM analytics.kpi_alerts
                   WHERE org_id = p_org_id
                   AND kpi_code = p_kpi_code
                   AND alert_type = 'target_achieved'
                   AND created_at > CURRENT_DATE
               ) THEN
                INSERT INTO system_config.system_notifications (
                    org_id,
                    notification_type,
                    notification_category,
                    title,
                    message,
                    priority,
                    notification_data
                ) VALUES (
                    p_org_id,
                    'success',
                    'analytics',
                    format('Target Achieved: %s', v_kpi_config.kpi_name),
                    format('%s target achieved! Current: %s, Target: %s (%s%%)',
                        v_kpi_config.kpi_name,
                        p_actual_value,
                        v_kpi_config.target_value,
                        ROUND(v_achievement_percent, 1)),
                    'high',
                    jsonb_build_object(
                        'kpi_code', p_kpi_code,
                        'actual_value', p_actual_value,
                        'target_value', v_kpi_config.target_value,
                        'achievement_percent', v_achievement_percent
                    )
                );
            END IF;
        END;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. AUTOMATED REPORT GENERATION
-- =============================================
CREATE OR REPLACE FUNCTION schedule_automated_reports()
RETURNS TRIGGER AS $$
DECLARE
    v_report RECORD;
    v_next_run TIMESTAMP;
    v_parameters JSONB;
BEGIN
    -- Check if it's time to run scheduled reports
    FOR v_report IN
        SELECT 
            rs.*,
            rt.template_name,
            rt.template_type,
            rt.default_parameters
        FROM analytics.report_schedules rs
        JOIN analytics.report_templates rt ON rs.template_id = rt.template_id
        WHERE rs.is_active = TRUE
        AND rs.next_run_at <= CURRENT_TIMESTAMP
        AND rs.org_id = NEW.org_id
    LOOP
        -- Build parameters
        v_parameters := COALESCE(v_report.schedule_parameters, v_report.default_parameters) || 
            jsonb_build_object(
                'period_start', CASE v_report.frequency
                    WHEN 'daily' THEN CURRENT_DATE
                    WHEN 'weekly' THEN DATE_TRUNC('week', CURRENT_DATE)
                    WHEN 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE)
                    ELSE CURRENT_DATE
                END,
                'period_end', CASE v_report.frequency
                    WHEN 'daily' THEN CURRENT_DATE
                    WHEN 'weekly' THEN DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days'
                    WHEN 'monthly' THEN DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'
                    ELSE CURRENT_DATE
                END
            );
        
        -- Queue report execution
        INSERT INTO analytics.report_execution_history (
            org_id,
            template_id,
            execution_type,
            parameters_used,
            status,
            scheduled_by,
            created_at
        ) VALUES (
            v_report.org_id,
            v_report.template_id,
            'scheduled',
            v_parameters,
            'queued',
            v_report.created_by,
            CURRENT_TIMESTAMP
        );
        
        -- Calculate next run
        v_next_run := CASE v_report.frequency
            WHEN 'daily' THEN v_report.next_run_at + INTERVAL '1 day'
            WHEN 'weekly' THEN v_report.next_run_at + INTERVAL '1 week'
            WHEN 'monthly' THEN v_report.next_run_at + INTERVAL '1 month'
            WHEN 'quarterly' THEN v_report.next_run_at + INTERVAL '3 months'
            ELSE v_report.next_run_at + INTERVAL '1 day'
        END;
        
        -- Update schedule
        UPDATE analytics.report_schedules
        SET 
            next_run_at = v_next_run,
            last_run_at = CURRENT_TIMESTAMP,
            run_count = run_count + 1
        WHERE schedule_id = v_report.schedule_id;
        
        -- Send notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_users,
            notification_data
        ) VALUES (
            v_report.org_id,
            'info',
            'reports',
            'Scheduled Report Generated',
            format('%s report has been generated for %s',
                v_report.template_name,
                TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY')),
            'low',
            v_report.recipients,
            jsonb_build_object(
                'template_id', v_report.template_id,
                'report_name', v_report.template_name,
                'frequency', v_report.frequency
            )
        );
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on system heartbeat or daily job
CREATE TRIGGER trigger_scheduled_reports
    AFTER INSERT ON system_config.system_health_metrics
    FOR EACH ROW
    EXECUTE FUNCTION schedule_automated_reports();

-- =============================================
-- 4. DATA QUALITY MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_data_quality()
RETURNS TRIGGER AS $$
DECLARE
    v_quality_score NUMERIC;
    v_issues_found INTEGER := 0;
    v_table_metrics JSONB;
BEGIN
    -- Check for data quality issues based on table
    CASE TG_TABLE_NAME
        WHEN 'customers' THEN
            -- Check for missing critical fields
            IF NEW.gst_number IS NULL AND NEW.customer_type = 'b2b' THEN
                v_issues_found := v_issues_found + 1;
                
                INSERT INTO analytics.data_quality_issues (
                    org_id,
                    table_name,
                    record_id,
                    issue_type,
                    issue_description,
                    severity,
                    field_name,
                    current_value
                ) VALUES (
                    NEW.org_id,
                    'customers',
                    NEW.customer_id::TEXT,
                    'missing_required_field',
                    'B2B customer missing GST number',
                    'high',
                    'gst_number',
                    NULL
                );
            END IF;
            
            -- Check for invalid GST format
            IF NEW.gst_number IS NOT NULL AND 
               NOT (NEW.gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$') THEN
                v_issues_found := v_issues_found + 1;
                
                INSERT INTO analytics.data_quality_issues (
                    org_id,
                    table_name,
                    record_id,
                    issue_type,
                    issue_description,
                    severity,
                    field_name,
                    current_value
                ) VALUES (
                    NEW.org_id,
                    'customers',
                    NEW.customer_id::TEXT,
                    'invalid_format',
                    'Invalid GST number format',
                    'high',
                    'gst_number',
                    NEW.gst_number
                );
            END IF;
            
        WHEN 'products' THEN
            -- Check for missing HSN codes
            IF NEW.hsn_code IS NULL OR LENGTH(NEW.hsn_code) < 4 THEN
                v_issues_found := v_issues_found + 1;
                
                INSERT INTO analytics.data_quality_issues (
                    org_id,
                    table_name,
                    record_id,
                    issue_type,
                    issue_description,
                    severity,
                    field_name,
                    current_value
                ) VALUES (
                    NEW.org_id,
                    'products',
                    NEW.product_id::TEXT,
                    'invalid_hsn',
                    'Missing or invalid HSN code',
                    'high',
                    'hsn_code',
                    NEW.hsn_code
                );
            END IF;
            
        WHEN 'invoices' THEN
            -- Check for invoice anomalies
            IF NEW.final_amount <= 0 THEN
                v_issues_found := v_issues_found + 1;
                
                INSERT INTO analytics.data_quality_issues (
                    org_id,
                    table_name,
                    record_id,
                    issue_type,
                    issue_description,
                    severity,
                    field_name,
                    current_value
                ) VALUES (
                    NEW.org_id,
                    'invoices',
                    NEW.invoice_id::TEXT,
                    'invalid_amount',
                    'Invoice with zero or negative amount',
                    'critical',
                    'final_amount',
                    NEW.final_amount::TEXT
                );
            END IF;
    END CASE;
    
    -- Update data quality metrics
    IF v_issues_found > 0 THEN
        INSERT INTO analytics.data_quality_metrics (
            org_id,
            metric_date,
            table_name,
            total_records,
            records_with_issues,
            quality_score,
            issue_summary
        )
        SELECT 
            NEW.org_id,
            CURRENT_DATE,
            TG_TABLE_NAME,
            COUNT(*),
            COUNT(DISTINCT record_id),
            (1 - (COUNT(DISTINCT record_id)::NUMERIC / COUNT(*)::NUMERIC)) * 100,
            jsonb_build_object(
                'total_issues', COUNT(*),
                'by_severity', jsonb_object_agg(severity, count(*)),
                'by_type', jsonb_object_agg(issue_type, count(*))
            )
        FROM analytics.data_quality_issues
        WHERE org_id = NEW.org_id
        AND table_name = TG_TABLE_NAME
        AND created_at >= CURRENT_DATE
        GROUP BY org_id
        ON CONFLICT (org_id, metric_date, table_name)
        DO UPDATE SET
            records_with_issues = analytics.data_quality_metrics.records_with_issues + 1,
            quality_score = (1 - (analytics.data_quality_metrics.records_with_issues + 1)::NUMERIC / 
                            analytics.data_quality_metrics.total_records::NUMERIC) * 100,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to critical tables
CREATE TRIGGER trigger_dq_customers
    AFTER INSERT OR UPDATE ON parties.customers
    FOR EACH ROW
    EXECUTE FUNCTION monitor_data_quality();

CREATE TRIGGER trigger_dq_products
    AFTER INSERT OR UPDATE ON inventory.products
    FOR EACH ROW
    EXECUTE FUNCTION monitor_data_quality();

-- =============================================
-- 5. PREDICTIVE ANALYTICS TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION update_predictive_models()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_metrics RECORD;
    v_churn_score NUMERIC;
    v_clv NUMERIC;
    v_payment_pattern TEXT;
BEGIN
    -- Update customer analytics
    IF TG_TABLE_NAME = 'customer_outstanding' AND NEW.status = 'paid' THEN
        -- Calculate customer metrics
        WITH customer_history AS (
            SELECT 
                customer_id,
                COUNT(*) as total_transactions,
                AVG(days_overdue) as avg_payment_days,
                STDDEV(days_overdue) as payment_consistency,
                SUM(original_amount) as lifetime_value,
                MAX(document_date) as last_transaction_date,
                COUNT(CASE WHEN days_overdue > 30 THEN 1 END) as late_payments
            FROM financial.customer_outstanding
            WHERE customer_id = NEW.customer_id
            GROUP BY customer_id
        )
        SELECT * INTO v_customer_metrics FROM customer_history;
        
        -- Calculate churn probability
        v_churn_score := CASE
            WHEN (CURRENT_DATE - v_customer_metrics.last_transaction_date) > 180 THEN 0.8
            WHEN (CURRENT_DATE - v_customer_metrics.last_transaction_date) > 90 THEN 0.6
            WHEN v_customer_metrics.late_payments > 5 THEN 0.5
            WHEN v_customer_metrics.payment_consistency > 20 THEN 0.4
            ELSE 0.2
        END;
        
        -- Calculate CLV (simplified)
        v_clv := v_customer_metrics.lifetime_value * 
                (1 - v_churn_score) * 
                (CASE 
                    WHEN v_customer_metrics.avg_payment_days < 30 THEN 1.2
                    WHEN v_customer_metrics.avg_payment_days < 60 THEN 1.0
                    ELSE 0.8
                END);
        
        -- Determine payment pattern
        v_payment_pattern := CASE
            WHEN v_customer_metrics.avg_payment_days < 15 THEN 'early_payer'
            WHEN v_customer_metrics.avg_payment_days < 30 THEN 'on_time'
            WHEN v_customer_metrics.avg_payment_days < 60 THEN 'delayed'
            ELSE 'chronic_late'
        END;
        
        -- Update customer predictions
        INSERT INTO analytics.customer_predictions (
            org_id,
            customer_id,
            prediction_date,
            churn_probability,
            churn_risk_level,
            customer_lifetime_value,
            payment_pattern,
            next_order_probability,
            recommended_credit_limit,
            model_confidence,
            factors
        ) VALUES (
            NEW.org_id,
            NEW.customer_id,
            CURRENT_DATE,
            v_churn_score,
            CASE 
                WHEN v_churn_score > 0.7 THEN 'high'
                WHEN v_churn_score > 0.4 THEN 'medium'
                ELSE 'low'
            END,
            v_clv,
            v_payment_pattern,
            1 - v_churn_score, -- Simplified
            v_customer_metrics.lifetime_value / 12, -- Monthly average as credit limit
            0.85, -- Model confidence
            jsonb_build_object(
                'total_transactions', v_customer_metrics.total_transactions,
                'avg_payment_days', v_customer_metrics.avg_payment_days,
                'payment_consistency', v_customer_metrics.payment_consistency,
                'days_since_last_order', (CURRENT_DATE - v_customer_metrics.last_transaction_date)
            )
        )
        ON CONFLICT (customer_id, prediction_date)
        DO UPDATE SET
            churn_probability = EXCLUDED.churn_probability,
            customer_lifetime_value = EXCLUDED.customer_lifetime_value,
            updated_at = CURRENT_TIMESTAMP;
        
        -- Alert for high churn risk
        IF v_churn_score > 0.7 THEN
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
                'analytics',
                'High Churn Risk Alert',
                format('Customer %s has %s%% churn probability. Last transaction: %s days ago',
                    (SELECT customer_name FROM parties.customers WHERE customer_id = NEW.customer_id),
                    ROUND(v_churn_score * 100),
                    (CURRENT_DATE - v_customer_metrics.last_transaction_date)),
                'high',
                jsonb_build_object(
                    'customer_id', NEW.customer_id,
                    'churn_score', v_churn_score,
                    'lifetime_value', v_clv,
                    'last_transaction_days', (CURRENT_DATE - v_customer_metrics.last_transaction_date)
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_predictive_analytics
    AFTER UPDATE OF status ON financial.customer_outstanding
    FOR EACH ROW
    WHEN (NEW.status = 'paid')
    EXECUTE FUNCTION update_predictive_models();

-- =============================================
-- 6. PERFORMANCE BENCHMARKING
-- =============================================
CREATE OR REPLACE FUNCTION update_performance_benchmarks()
RETURNS TRIGGER AS $$
DECLARE
    v_metric_type TEXT;
    v_metric_value NUMERIC;
    v_benchmark RECORD;
    v_percentile NUMERIC;
BEGIN
    -- Determine metric type
    CASE TG_TABLE_NAME
        WHEN 'sales_targets' THEN
            IF NEW.revenue_achievement_percent IS NOT NULL THEN
                v_metric_type := 'sales_achievement';
                v_metric_value := NEW.revenue_achievement_percent;
            END IF;
            
        WHEN 'vendor_performance' THEN
            v_metric_type := 'vendor_delivery';
            v_metric_value := NEW.on_time_delivery_percent;
            
        WHEN 'customer_visits' THEN
            IF NEW.visit_purpose = 'sales' AND NEW.order_generated = TRUE THEN
                v_metric_type := 'sales_conversion';
                v_metric_value := 100; -- Successful conversion
            END IF;
    END CASE;
    
    IF v_metric_type IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Get industry benchmark
    SELECT * INTO v_benchmark
    FROM analytics.industry_benchmarks
    WHERE metric_type = v_metric_type
    AND industry_type = 'pharmaceutical'
    AND is_active = TRUE;
    
    -- Calculate percentile
    WITH metric_distribution AS (
        SELECT 
            percent_rank() OVER (ORDER BY metric_value) as percentile
        FROM analytics.performance_metrics
        WHERE metric_type = v_metric_type
        AND metric_value = v_metric_value
    )
    SELECT percentile * 100 INTO v_percentile FROM metric_distribution LIMIT 1;
    
    -- Store performance metric
    INSERT INTO analytics.performance_metrics (
        org_id,
        metric_type,
        metric_date,
        metric_value,
        entity_type,
        entity_id,
        benchmark_value,
        variance_from_benchmark,
        percentile_rank,
        performance_rating
    ) VALUES (
        NEW.org_id,
        v_metric_type,
        CURRENT_DATE,
        v_metric_value,
        CASE TG_TABLE_NAME
            WHEN 'sales_targets' THEN 'user'
            WHEN 'vendor_performance' THEN 'vendor'
            WHEN 'customer_visits' THEN 'user'
        END,
        CASE TG_TABLE_NAME
            WHEN 'sales_targets' THEN NEW.target_entity_id::TEXT
            WHEN 'vendor_performance' THEN NEW.supplier_id::TEXT
            WHEN 'customer_visits' THEN NEW.visited_by::TEXT
        END,
        v_benchmark.benchmark_value,
        v_metric_value - v_benchmark.benchmark_value,
        v_percentile,
        CASE 
            WHEN v_metric_value >= v_benchmark.top_quartile THEN 'excellent'
            WHEN v_metric_value >= v_benchmark.median_value THEN 'good'
            WHEN v_metric_value >= v_benchmark.bottom_quartile THEN 'average'
            ELSE 'below_average'
        END
    );
    
    -- Create recognition for top performers
    IF v_metric_value >= v_benchmark.top_quartile THEN
        INSERT INTO analytics.performance_recognition (
            org_id,
            entity_type,
            entity_id,
            recognition_type,
            achievement_description,
            metric_value,
            recognition_date
        ) VALUES (
            NEW.org_id,
            CASE TG_TABLE_NAME
                WHEN 'sales_targets' THEN 'user'
                WHEN 'vendor_performance' THEN 'vendor'
                WHEN 'customer_visits' THEN 'user'
            END,
            CASE TG_TABLE_NAME
                WHEN 'sales_targets' THEN NEW.target_entity_id::TEXT
                WHEN 'vendor_performance' THEN NEW.supplier_id::TEXT
                WHEN 'customer_visits' THEN NEW.visited_by::TEXT
            END,
            'top_performer',
            format('Achieved top quartile performance in %s (%s%%)',
                v_metric_type, ROUND(v_metric_value, 1)),
            v_metric_value,
            CURRENT_DATE
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_benchmark_sales
    AFTER UPDATE ON sales.sales_targets
    FOR EACH ROW
    WHEN (NEW.revenue_achievement_percent IS NOT NULL)
    EXECUTE FUNCTION update_performance_benchmarks();

-- =============================================
-- 7. DASHBOARD CACHE REFRESH
-- =============================================
CREATE OR REPLACE FUNCTION refresh_dashboard_cache()
RETURNS TRIGGER AS $$
DECLARE
    v_cache_key TEXT;
    v_affected_dashboards TEXT[];
BEGIN
    -- Determine affected dashboards
    CASE TG_TABLE_NAME
        WHEN 'invoices' THEN
            v_affected_dashboards := ARRAY['sales_dashboard', 'executive_dashboard', 'finance_dashboard'];
            
        WHEN 'inventory_movements' THEN
            v_affected_dashboards := ARRAY['inventory_dashboard', 'operations_dashboard'];
            
        WHEN 'customer_outstanding' THEN
            v_affected_dashboards := ARRAY['finance_dashboard', 'collection_dashboard'];
            
        ELSE
            RETURN NEW;
    END CASE;
    
    -- Mark cache as stale
    UPDATE analytics.dashboard_cache
    SET 
        is_stale = TRUE,
        stale_since = CURRENT_TIMESTAMP
    WHERE org_id = NEW.org_id
    AND dashboard_type = ANY(v_affected_dashboards);
    
    -- Queue refresh job
    INSERT INTO analytics.cache_refresh_queue (
        org_id,
        cache_type,
        cache_key,
        priority,
        created_at
    )
    SELECT 
        NEW.org_id,
        'dashboard',
        dashboard_type,
        CASE 
            WHEN dashboard_type = 'executive_dashboard' THEN 1
            ELSE 5
        END,
        CURRENT_TIMESTAMP
    FROM unnest(v_affected_dashboards) as dashboard_type
    ON CONFLICT (org_id, cache_type, cache_key) 
    DO UPDATE SET
        priority = LEAST(analytics.cache_refresh_queue.priority, EXCLUDED.priority),
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to high-impact tables
CREATE TRIGGER trigger_cache_refresh_invoices
    AFTER INSERT OR UPDATE OR DELETE ON sales.invoices
    FOR EACH ROW
    EXECUTE FUNCTION refresh_dashboard_cache();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
-- Tables don't exist - commenting out indexes
-- CREATE INDEX idx_kpi_actuals_lookup ON analytics.kpi_actuals(org_id, kpi_code, period_type, period_start);
-- CREATE INDEX idx_kpi_alerts_recent ON analytics.kpi_alerts(org_id, created_at) WHERE acknowledged = FALSE;
CREATE INDEX idx_report_schedules_next ON analytics.report_schedules(is_active) WHERE is_active = TRUE;
-- CREATE INDEX idx_data_quality_issues ON analytics.data_quality_issues(org_id, table_name, created_at);
-- CREATE INDEX idx_customer_predictions ON analytics.customer_predictions(customer_id, prediction_date);
-- CREATE INDEX idx_performance_metrics ON analytics.performance_metrics(metric_type, metric_date);
-- CREATE INDEX idx_dashboard_cache_stale ON analytics.dashboard_cache(org_id, is_stale) WHERE is_stale = TRUE;

-- Add comments
COMMENT ON FUNCTION calculate_realtime_kpis() IS 'Calculates KPIs in real-time from transactional data';
-- COMMENT ON FUNCTION check_kpi_thresholds() IS 'Monitors KPI thresholds and creates alerts'; -- Function doesn't exist
COMMENT ON FUNCTION schedule_automated_reports() IS 'Manages automated report generation schedule';
COMMENT ON FUNCTION monitor_data_quality() IS 'Tracks data quality issues across critical tables';
COMMENT ON FUNCTION update_predictive_models() IS 'Updates predictive analytics models';
COMMENT ON FUNCTION update_performance_benchmarks() IS 'Compares performance against industry benchmarks';
COMMENT ON FUNCTION refresh_dashboard_cache() IS 'Manages dashboard cache invalidation';