-- Update all notification-creating functions to check feature flags before creating notifications
-- This ensures notifications are only created when enabled in master settings

-- Create a helper function to check if notifications are enabled
CREATE OR REPLACE FUNCTION system_config.should_create_notification()
RETURNS BOOLEAN AS $$
DECLARE
    is_enabled BOOLEAN;
BEGIN
    -- Check if system_notifications flag is enabled
    SELECT COALESCE(is_active, false) INTO is_enabled
    FROM system_config.feature_flags
    WHERE flag_key = 'system_notifications'
    AND org_id IS NULL;  -- Global flag

    RETURN COALESCE(is_enabled, false);
END;
$$ LANGUAGE plpgsql;

-- Create helper function to check any feature flag
CREATE OR REPLACE FUNCTION system_config.is_feature_enabled(feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    is_enabled BOOLEAN;
BEGIN
    SELECT COALESCE(is_active, false) INTO is_enabled
    FROM system_config.feature_flags
    WHERE flag_key = feature_key
    AND org_id IS NULL;  -- Global flag

    RETURN COALESCE(is_enabled, false);
END;
$$ LANGUAGE plpgsql;

-- Update the notification creation wrapper to check flag
CREATE OR REPLACE FUNCTION public.create_notification_if_enabled(
    p_org_id UUID,
    p_type VARCHAR(50),
    p_category VARCHAR(100),
    p_title TEXT,
    p_message TEXT,
    p_priority VARCHAR(20) DEFAULT 'medium',
    p_target_audience VARCHAR(100) DEFAULT 'all',
    p_data JSONB DEFAULT '{}'::JSONB
) RETURNS VOID AS $$
BEGIN
    -- Only create notification if feature is enabled
    IF system_config.should_create_notification() THEN
        BEGIN
            INSERT INTO system_config.system_notifications (
                org_id, notification_type, notification_category,
                title, message, priority, target_audience,
                notification_data, created_at, created_by
            ) VALUES (
                p_org_id, p_type, p_category,
                p_title, p_message, p_priority,
                COALESCE(p_target_audience, 'all'),
                p_data, NOW(), 1
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Log but don't break the transaction
                RAISE WARNING 'Failed to create notification: %', SQLERRM;
        END;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update aging buckets function to check notifications flag
CREATE OR REPLACE FUNCTION public.update_outstanding_aging_buckets()
RETURNS TRIGGER AS $$
BEGIN
    -- Update aging buckets (always do this)
    NEW.bucket_0_30 := CASE WHEN NEW.days_overdue BETWEEN 0 AND 30 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_31_60 := CASE WHEN NEW.days_overdue BETWEEN 31 AND 60 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_61_90 := CASE WHEN NEW.days_overdue BETWEEN 61 AND 90 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_91_180 := CASE WHEN NEW.days_overdue BETWEEN 91 AND 180 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_181_365 := CASE WHEN NEW.days_overdue BETWEEN 181 AND 365 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_over_365 := CASE WHEN NEW.days_overdue > 365 THEN NEW.outstanding_amount ELSE 0 END;

    -- Only create notification if enabled
    IF system_config.should_create_notification() AND NEW.days_overdue > 30 AND NEW.outstanding_amount > 0 THEN
        PERFORM public.create_notification_if_enabled(
            NEW.org_id,
            'warning',
            'collection',
            'Invoice Overdue',
            format('Invoice %s is overdue by %s days. Amount: ₹%s',
                NEW.document_number,
                NEW.days_overdue,
                TO_CHAR(NEW.outstanding_amount, 'FM99,99,999')),
            CASE
                WHEN NEW.days_overdue > 90 THEN 'high'
                WHEN NEW.days_overdue > 60 THEN 'medium'
                ELSE 'low'
            END,
            'finance_team',
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'document_number', NEW.document_number,
                'days_overdue', NEW.days_overdue,
                'outstanding_amount', NEW.outstanding_amount
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Insert all feature flags with proper defaults
INSERT INTO system_config.feature_flags (flag_key, flag_name, description, flag_type, default_value, is_active)
VALUES
    -- Notification Features
    ('system_notifications', 'System Notifications', 'Enable automatic notifications for events', 'boolean', 'false', false),
    ('low_stock_alerts', 'Low Stock Alerts', 'Alert when inventory falls below minimum', 'boolean', 'true', true),
    ('expiry_alerts', 'Expiry Alerts', 'Alert for expiring products', 'boolean', 'true', true),
    ('overdue_invoice_alerts', 'Overdue Invoice Alerts', 'Alert for overdue invoices', 'boolean', 'true', true),

    -- Inventory Features
    ('allow_negative_stock', 'Allow Negative Stock', 'Allow stock to go negative', 'boolean', 'false', false),
    ('batch_wise_tracking', 'Batch Wise Tracking', 'Track inventory by batch', 'boolean', 'true', true),
    ('expiry_date_mandatory', 'Expiry Date Mandatory', 'Require expiry date for products', 'boolean', 'true', true),
    ('stock_adjustment_approval', 'Stock Adjustment Approval', 'Require approval for stock adjustments', 'boolean', 'false', false),

    -- Financial Features
    ('auto_fifo_allocation', 'Auto FIFO Allocation', 'Automatically allocate payments to oldest invoices', 'boolean', 'true', true),
    ('credit_limit_enforcement', 'Credit Limit Enforcement', 'Enforce customer credit limits', 'boolean', 'false', false),
    ('partial_payments', 'Allow Partial Payments', 'Allow partial invoice payments', 'boolean', 'true', true),
    ('auto_reconciliation', 'Auto Reconciliation', 'Automatically reconcile payments', 'boolean', 'false', false),

    -- Sales Features
    ('sales_approval_required', 'Sales Approval Required', 'Require approval for sales orders', 'boolean', 'false', false),
    ('discount_limit_check', 'Discount Limit Check', 'Check discount limits on sales', 'boolean', 'true', true),
    ('minimum_margin_check', 'Minimum Margin Check', 'Check minimum profit margins', 'boolean', 'true', true),

    -- GST & Compliance
    ('gst_round_off', 'GST Round Off', 'Round off GST calculations', 'boolean', 'true', true),
    ('eway_bill_enabled', 'E-Way Bill Enabled', 'Generate E-Way bills', 'boolean', 'false', false),
    ('tcs_applicable', 'TCS Applicable', 'Apply TCS on sales', 'boolean', 'false', false)

ON CONFLICT (flag_key, org_id) DO UPDATE SET
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION system_config.should_create_notification TO PUBLIC;
GRANT EXECUTE ON FUNCTION system_config.is_feature_enabled TO PUBLIC;
GRANT SELECT ON system_config.feature_flags TO PUBLIC;

COMMENT ON FUNCTION system_config.should_create_notification IS
'Checks if system notifications are enabled in master settings';

COMMENT ON FUNCTION system_config.is_feature_enabled IS
'Checks if a specific feature is enabled in master settings';

DO $$
BEGIN
    RAISE NOTICE '✅ Updated all notification functions to check feature flags';
    RAISE NOTICE 'All features can now be controlled from Master Settings';
END $$;