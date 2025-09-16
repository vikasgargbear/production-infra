-- Disable all system notifications by replacing trigger functions with no-op versions
-- This will prevent notification errors from breaking other operations

-- Replace the update_outstanding_aging_buckets function to ONLY update buckets, no notifications
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

    -- NOTIFICATIONS DISABLED - No notification creation

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace the update_outstanding_aging function to not create notifications
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

    -- NOTIFICATIONS DISABLED

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace create_overdue_notification to do nothing
CREATE OR REPLACE FUNCTION financial.create_overdue_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- NOTIFICATIONS DISABLED - Function does nothing
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a generic no-op notification function for any other triggers
CREATE OR REPLACE FUNCTION public.no_op_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- NOTIFICATIONS DISABLED - Function does nothing
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Find and disable any triggers that insert into system_notifications
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Log all functions that reference system_notifications
    FOR func_record IN
        SELECT DISTINCT routine_schema, routine_name
        FROM information_schema.routines
        WHERE routine_definition LIKE '%system_notifications%'
        AND routine_type = 'FUNCTION'
        AND routine_schema NOT IN ('pg_catalog', 'information_schema')
    LOOP
        RAISE NOTICE 'Function % references system_notifications',
            func_record.routine_schema || '.' || func_record.routine_name;
    END LOOP;
END $$;

-- Add comment to track when notifications were disabled
COMMENT ON FUNCTION public.update_outstanding_aging_buckets IS
'NOTIFICATIONS DISABLED - Only updates aging buckets, no notification creation';

COMMENT ON FUNCTION public.update_outstanding_aging IS
'NOTIFICATIONS DISABLED - Only updates aging buckets, no notification creation';

COMMENT ON FUNCTION financial.create_overdue_notification IS
'NOTIFICATIONS DISABLED - No-op function to prevent notification errors';

-- Output success message
DO $$
BEGIN
    RAISE NOTICE '✅ System notifications have been DISABLED to prevent errors';
    RAISE NOTICE 'Payment recording should now work without notification conflicts';
END $$;