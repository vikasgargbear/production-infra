-- ============================================================================
-- Phase 4: Consolidate Allocations
-- 
-- This migration:
-- 1. Adds source_type column to payment_allocations to distinguish payment vs credit note allocations
-- 2. Migrates data from sales.credit_note_applications into payment_allocations
-- 3. Renames payment_allocations to allocations (unified table)
-- 4. Drops the old credit_note_applications table
--
-- Run this AFTER Phase 1-3 migrations are complete
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add source_type column to track allocation source
-- ============================================================================
-- This column distinguishes whether the allocation came from a payment or credit note

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'financial' 
        AND table_name = 'payment_allocations'
        AND column_name = 'source_type'
    ) THEN
        ALTER TABLE financial.payment_allocations 
        ADD COLUMN source_type TEXT DEFAULT 'payment' NOT NULL;
        
        COMMENT ON COLUMN financial.payment_allocations.source_type IS 
            'Source of allocation: payment, credit_note';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add credit_note_id column for credit note allocations
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'financial' 
        AND table_name = 'payment_allocations'
        AND column_name = 'credit_note_id'
    ) THEN
        ALTER TABLE financial.payment_allocations 
        ADD COLUMN credit_note_id INTEGER;
        
        COMMENT ON COLUMN financial.payment_allocations.credit_note_id IS 
            'Reference to credit note if source_type is credit_note';
    END IF;
END $$;

-- Make payment_id nullable for credit note allocations
ALTER TABLE financial.payment_allocations 
    ALTER COLUMN payment_id DROP NOT NULL;

-- ============================================================================
-- STEP 3: Migrate credit_note_applications data
-- ============================================================================

-- Check if there's data to migrate
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM sales.credit_note_applications;
    
    IF v_count > 0 THEN
        RAISE NOTICE 'Migrating % credit note applications...', v_count;
        
        -- Insert credit note applications into payment_allocations
        INSERT INTO financial.payment_allocations (
            payment_id,
            credit_note_id,
            reference_type,
            reference_id,
            reference_number,
            allocated_amount,
            allocation_status,
            source_type,
            created_at,
            created_by
        )
        SELECT 
            NULL as payment_id,  -- No payment, it's a credit note
            cna.credit_note_id,
            'invoice' as reference_type,
            cna.invoice_id as reference_id,
            i.invoice_number as reference_number,
            cna.applied_amount as allocated_amount,
            'active' as allocation_status,
            'credit_note' as source_type,
            cna.created_at,
            cna.created_by
        FROM sales.credit_note_applications cna
        JOIN sales.invoices i ON cna.invoice_id = i.invoice_id
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE 'Migration complete.';
    ELSE
        RAISE NOTICE 'No credit note applications to migrate.';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Rename table to financial.allocations
-- ============================================================================

ALTER TABLE financial.payment_allocations RENAME TO allocations;

-- Update sequence name
ALTER SEQUENCE financial.payment_allocations_allocation_id_seq 
    RENAME TO allocations_allocation_id_seq;

-- ============================================================================
-- STEP 5: Update indexes with new names
-- ============================================================================

-- Drop old indexes if they exist
DROP INDEX IF EXISTS financial.idx_payment_allocations_payment;
DROP INDEX IF EXISTS financial.idx_payment_allocations_reference;
DROP INDEX IF EXISTS financial.idx_payment_allocations_invoice;
DROP INDEX IF EXISTS financial.idx_payment_allocations_date;

-- Create new indexes
CREATE INDEX IF NOT EXISTS idx_allocations_payment 
    ON financial.allocations(payment_id) WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_credit_note 
    ON financial.allocations(credit_note_id) WHERE credit_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_reference 
    ON financial.allocations(reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_allocations_source_type 
    ON financial.allocations(source_type);

-- ============================================================================
-- STEP 6: Add constraint for source type validation
-- ============================================================================

ALTER TABLE financial.allocations
    ADD CONSTRAINT chk_allocation_source CHECK (
        (source_type = 'payment' AND payment_id IS NOT NULL) OR
        (source_type = 'credit_note' AND credit_note_id IS NOT NULL)
    );

-- ============================================================================
-- STEP 7: Update foreign key for credit notes (after they're in financial schema)
-- ============================================================================

-- This should only be run AFTER credit_notes are moved to financial schema
-- Uncomment after running Phase 1 migration:
-- ALTER TABLE financial.allocations
--     ADD CONSTRAINT fk_allocations_credit_note 
--     FOREIGN KEY (credit_note_id) REFERENCES financial.credit_notes(credit_note_id);

-- ============================================================================
-- STEP 8: Mark old table for deprecation (don't drop yet for safety)
-- ============================================================================

COMMENT ON TABLE sales.credit_note_applications IS 
    'DEPRECATED - Use financial.allocations with source_type=credit_note. Data migrated.';

-- Verify migration
SELECT 
    'financial.allocations (payment)' as source,
    COUNT(*) as count
FROM financial.allocations
WHERE source_type = 'payment'
UNION ALL
SELECT 
    'financial.allocations (credit_note)' as source,
    COUNT(*) as count
FROM financial.allocations
WHERE source_type = 'credit_note';

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================
-- 
-- 1. Update backend code to use 'financial.allocations' instead of 'payment_allocations'
-- 2. Update any triggers referencing payment_allocations
-- 3. Update RLS policies for the new table name
-- 4. After verification, drop old table:
--    DROP TABLE sales.credit_note_applications CASCADE;
--
-- ============================================================================

-- ============================================================================
-- OPTIONAL: Create backward-compatible view
-- This allows existing code to continue working while migrating to new table name
-- ============================================================================

CREATE OR REPLACE VIEW financial.payment_allocations AS
SELECT 
    allocation_id,
    payment_id,
    reference_type,
    reference_id,
    reference_number,
    allocated_amount,
    discount_amount,
    write_off_amount,
    allocation_status,
    reversed_by,
    reversed_at,
    reversal_reason,
    created_at,
    created_by,
    source_type,
    credit_note_id
FROM financial.allocations
WHERE source_type = 'payment' OR payment_id IS NOT NULL;

COMMENT ON VIEW financial.payment_allocations IS 
    'Backward compatibility view - use financial.allocations directly for new code';
