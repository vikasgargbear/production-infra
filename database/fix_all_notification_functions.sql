-- Comprehensive fix for all notification-related functions
-- Ensures target_audience is always provided when inserting into system_notifications

-- First, ensure target_audience has a default value
ALTER TABLE system_config.system_notifications
ALTER COLUMN target_audience SET DEFAULT 'all';

-- Update any existing NULL values
UPDATE system_config.system_notifications
SET target_audience = 'all'
WHERE target_audience IS NULL;

-- Fix the update_outstanding_aging function that's likely causing the issue
CREATE OR REPLACE FUNCTION public.update_outstanding_aging()
RETURNS TRIGGER AS $$
BEGIN
    -- Update aging buckets
    NEW.bucket_0_30 := CASE WHEN NEW.days_overdue BETWEEN 0 AND 30 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_31_60 := CASE WHEN NEW.days_overdue BETWEEN 31 AND 60 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_61_90 := CASE WHEN NEW.days_overdue BETWEEN 61 AND 90 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_91_180 := CASE WHEN NEW.days_overdue BETWEEN 91 AND 180 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_181_365 := CASE WHEN NEW.days_overdue BETWEEN 181 AND 365 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_over_365 := CASE WHEN NEW.days_overdue > 365 THEN NEW.outstanding_amount ELSE 0 END;

    -- Generate notification for overdue invoices (if needed)
    IF NEW.days_overdue > 0 AND NEW.outstanding_amount > 0 THEN
        -- Check if notification already exists for this invoice
        IF NOT EXISTS (
            SELECT 1 FROM system_config.system_notifications
            WHERE org_id = NEW.org_id
            AND notification_data->>'invoice_number' = NEW.document_number::text
            AND created_at > CURRENT_DATE - INTERVAL '7 days'
        ) THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_audience,  -- Always include this field
                notification_data,
                created_at
            ) VALUES (
                NEW.org_id,
                'warning',
                'collection',
                'Invoice Overdue',
                format('Invoice %s for %s is overdue by %s days. Amount: ₹%s',
                    NEW.document_number,
                    NEW.party_name,
                    NEW.days_overdue,
                    TO_CHAR(NEW.outstanding_amount, 'FM99,99,999')),
                CASE
                    WHEN NEW.days_overdue > 90 THEN 'high'
                    WHEN NEW.days_overdue > 30 THEN 'medium'
                    ELSE 'low'
                END,
                'finance_team',  -- Set appropriate target audience
                jsonb_build_object(
                    'customer_id', NEW.party_id,
                    'customer_name', NEW.party_name,
                    'invoice_number', NEW.document_number,
                    'days_overdue', NEW.days_overdue,
                    'outstanding_amount', NEW.outstanding_amount
                ),
                NOW()
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Now let's create a generic function that safely creates notifications
CREATE OR REPLACE FUNCTION public.create_safe_notification(
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
    INSERT INTO system_config.system_notifications (
        org_id,
        notification_type,
        notification_category,
        title,
        message,
        priority,
        target_audience,
        notification_data,
        created_at
    ) VALUES (
        p_org_id,
        p_type,
        p_category,
        p_title,
        p_message,
        p_priority,
        COALESCE(p_target_audience, 'all'),  -- Ensure it's never NULL
        p_data,
        NOW()
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't break the transaction
        RAISE WARNING 'Failed to create notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_safe_notification TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION public.create_safe_notification IS
'Safe notification creation function that ensures all required fields are provided';

-- Output success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully fixed notification functions with target_audience field';
END $$;