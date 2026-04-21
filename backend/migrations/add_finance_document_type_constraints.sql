-- Enforce canonical document_type values for finance outstanding ledgers.
-- NOT VALID avoids blocking deploys with legacy rows while still enforcing
-- the constraint for new/updated rows.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customer_outstanding_document_type_allowed'
    ) THEN
        ALTER TABLE financial.customer_outstanding
            ADD CONSTRAINT customer_outstanding_document_type_allowed
            CHECK (document_type IN ('INVOICE', 'credit_note', 'payment'))
            NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'supplier_outstanding_document_type_allowed'
    ) THEN
        ALTER TABLE financial.supplier_outstanding
            ADD CONSTRAINT supplier_outstanding_document_type_allowed
            CHECK (document_type IN ('invoice', 'debit_note', 'payment'))
            NOT VALID;
    END IF;
END $$;
