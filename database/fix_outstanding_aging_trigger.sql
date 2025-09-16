-- Fix the update_outstanding_aging_buckets function that's failing
-- This function is triggered when customer_outstanding is updated

CREATE OR REPLACE FUNCTION public.update_outstanding_aging_buckets()
RETURNS TRIGGER AS $$
BEGIN
    -- Update aging buckets based on days overdue
    NEW.bucket_0_30 := CASE WHEN NEW.days_overdue BETWEEN 0 AND 30 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_31_60 := CASE WHEN NEW.days_overdue BETWEEN 31 AND 60 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_61_90 := CASE WHEN NEW.days_overdue BETWEEN 61 AND 90 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_91_180 := CASE WHEN NEW.days_overdue BETWEEN 91 AND 180 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_181_365 := CASE WHEN NEW.days_overdue BETWEEN 181 AND 365 THEN NEW.outstanding_amount ELSE 0 END;
    NEW.bucket_over_365 := CASE WHEN NEW.days_overdue > 365 THEN NEW.outstanding_amount ELSE 0 END;

    -- Only create notification for significantly overdue invoices
    IF NEW.days_overdue > 30 AND NEW.outstanding_amount > 0 THEN
        BEGIN
            -- Create notification with ALL required fields including created_by
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_audience,  -- Required field
                created_by,       -- Required field
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
                CASE
                    WHEN NEW.days_overdue > 90 THEN 'high'
                    WHEN NEW.days_overdue > 60 THEN 'medium'
                    ELSE 'low'
                END,
                'finance_team',  -- Target audience
                1,               -- System user ID (should ideally get from context)
                jsonb_build_object(
                    'customer_id', NEW.customer_id,
                    'customer_name', c.customer_name,
                    'document_type', NEW.document_type,
                    'document_number', NEW.document_number,
                    'days_overdue', NEW.days_overdue,
                    'outstanding_amount', NEW.outstanding_amount
                )
            FROM parties.customers c
            WHERE c.customer_id = NEW.customer_id
            -- Only create notification if one doesn't exist recently
            AND NOT EXISTS (
                SELECT 1 FROM system_config.system_notifications
                WHERE org_id = NEW.org_id
                AND notification_data->>'document_number' = NEW.document_number::text
                AND created_at > CURRENT_DATE - INTERVAL '7 days'
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Log error but don't break the transaction
                RAISE WARNING 'Failed to create overdue notification: %', SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also ensure the created_by column has a default
ALTER TABLE system_config.system_notifications
ALTER COLUMN created_by SET DEFAULT 1;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_outstanding_aging_buckets TO PUBLIC;

-- Add comment
COMMENT ON FUNCTION public.update_outstanding_aging_buckets IS
'Updates aging buckets and creates overdue notifications with proper error handling and all required fields';

DO $$
BEGIN
    RAISE NOTICE 'Successfully fixed update_outstanding_aging_buckets trigger function';
END $$;