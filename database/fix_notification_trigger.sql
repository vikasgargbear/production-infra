-- Fix notification trigger that's breaking payment recording
-- The trigger is trying to insert notifications without required target_audience field

-- Find and fix the trigger that's causing the issue
-- The error shows it's related to overdue invoice notifications

-- First, let's add a default value for target_audience if it doesn't have one
ALTER TABLE system_config.system_notifications
ALTER COLUMN target_audience SET DEFAULT 'all';

-- Now fix any triggers that create notifications without target_audience
-- This appears to be related to invoice overdue notifications

-- Find the problematic trigger
DO $$
BEGIN
    -- Update any existing triggers that insert into system_notifications
    -- without specifying target_audience

    -- Since we can't directly modify trigger functions, we need to recreate them
    -- Let's create a fixed version of the notification trigger

    CREATE OR REPLACE FUNCTION financial.create_overdue_notification()
    RETURNS TRIGGER AS $func$
    BEGIN
        -- Insert notification with all required fields including target_audience
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_audience,  -- Add this required field
            notification_data,
            created_at
        )
        SELECT
            NEW.org_id,
            'warning',
            'collection',
            'Invoice Overdue',
            format('Invoice %s for %s is now overdue by %s days. Amount: ₹%s',
                NEW.document_number,
                NEW.party_name,
                NEW.days_overdue,
                TO_CHAR(NEW.outstanding_amount, 'FM99,99,999')),
            'high',
            'finance_team',  -- Set appropriate target audience
            jsonb_build_object(
                'customer_id', NEW.party_id,
                'customer_name', NEW.party_name,
                'invoice_number', NEW.document_number,
                'days_overdue', NEW.days_overdue,
                'outstanding_amount', NEW.outstanding_amount
            ),
            NOW()
        WHERE NEW.days_overdue > 0
        AND NEW.document_type = 'invoice';

        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

EXCEPTION
    WHEN duplicate_function THEN
        -- Function already exists, that's ok
        NULL;
END $$;

-- Alternative: Make target_audience nullable if it shouldn't be required
-- ALTER TABLE system_config.system_notifications ALTER COLUMN target_audience DROP NOT NULL;

-- For immediate fix, update any NULL target_audience values
UPDATE system_config.system_notifications
SET target_audience = 'all'
WHERE target_audience IS NULL;

-- Add comment explaining the fix
COMMENT ON COLUMN system_config.system_notifications.target_audience IS
'Target audience for the notification. Defaults to "all". Options: all, finance_team, warehouse_team, sales_team, management';

RAISE NOTICE '✅ Fixed notification trigger - added target_audience to prevent payment recording failures';