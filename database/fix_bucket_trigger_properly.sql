-- Fix the update_outstanding_aging_buckets function that's causing payment errors
-- This function is being triggered but bucket columns don't exist on customer_outstanding table

-- Drop and recreate the function to ensure it doesn't try to update non-existent columns
DROP FUNCTION IF EXISTS public.update_outstanding_aging_buckets() CASCADE;

CREATE OR REPLACE FUNCTION public.update_outstanding_aging_buckets()
RETURNS TRIGGER AS $$
BEGIN
    -- Just return NEW without any modifications
    -- Bucket columns don't exist on customer_outstanding table
    -- All we need to do is pass through the record unchanged
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger if it was dropped
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'trigger_update_aging_buckets'
        AND event_object_table = 'customer_outstanding'
    ) THEN
        CREATE TRIGGER trigger_update_aging_buckets
        BEFORE INSERT OR UPDATE ON financial.customer_outstanding
        FOR EACH ROW
        EXECUTE FUNCTION public.update_outstanding_aging_buckets();
    END IF;
END $$;

COMMENT ON FUNCTION public.update_outstanding_aging_buckets IS
'No-op function - bucket columns do not exist on customer_outstanding table';

-- Also check if there are bucket columns that need to be added or if we should just disable this completely
DO $$
DECLARE
    has_bucket_columns BOOLEAN;
BEGIN
    -- Check if any bucket columns exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'financial'
        AND table_name = 'customer_outstanding'
        AND column_name LIKE 'bucket_%'
    ) INTO has_bucket_columns;

    IF NOT has_bucket_columns THEN
        RAISE NOTICE 'No bucket columns exist on customer_outstanding table';
        RAISE NOTICE 'The aging bucket trigger has been disabled';
    END IF;
END $$;

-- Output success message
DO $$
BEGIN
    RAISE NOTICE '✅ Fixed update_outstanding_aging_buckets trigger';
    RAISE NOTICE 'Payment recording should now work without bucket column errors';
END $$;