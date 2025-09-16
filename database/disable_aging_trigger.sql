-- Disable the aging buckets trigger that's causing payment errors
-- The trigger is trying to update non-existent bucket columns

-- Replace the function with a no-op version
CREATE OR REPLACE FUNCTION public.update_outstanding_aging_buckets()
RETURNS TRIGGER AS $$
BEGIN
    -- DISABLED - The bucket columns don't exist on customer_outstanding table
    -- Just return NEW without any modifications
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_outstanding_aging_buckets IS
'DISABLED - Bucket columns do not exist on customer_outstanding table';

-- Output success message
DO $$
BEGIN
    RAISE NOTICE '✅ Disabled update_outstanding_aging_buckets trigger function';
    RAISE NOTICE 'Payment recording should now work without bucket column errors';
END $$;