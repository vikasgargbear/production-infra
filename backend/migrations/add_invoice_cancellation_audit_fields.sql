-- Add explicit invoice cancellation audit fields used by the backend service.
-- Existing deployments may only have cancellation_reason/cancelled_date.

ALTER TABLE sales.invoices
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'invoices_cancelled_by_fkey'
    ) THEN
        ALTER TABLE sales.invoices
            ADD CONSTRAINT invoices_cancelled_by_fkey
            FOREIGN KEY (cancelled_by)
            REFERENCES master.org_users(user_id)
            NOT VALID;
    END IF;
END $$;

UPDATE sales.invoices
SET cancelled_at = cancelled_date::timestamp with time zone
WHERE cancelled_at IS NULL
  AND cancelled_date IS NOT NULL;
