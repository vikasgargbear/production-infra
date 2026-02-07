-- Migration: Fix financial.debit_notes to support supplier debit notes
-- Date: 2026-02-06
-- Context: Purchase returns create debit notes against suppliers, but the table
--          only had customer_id (NOT NULL) with FK to parties.customers.
--          Also expands CHECK constraints for reference_type and reason_code.

-- 1. Make customer_id nullable (was NOT NULL)
ALTER TABLE financial.debit_notes ALTER COLUMN customer_id DROP NOT NULL;

-- 2. Add supplier_id column with FK to parties.suppliers
ALTER TABLE financial.debit_notes ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES parties.suppliers(supplier_id);

-- 3. At least one party must be set (customer or supplier)
ALTER TABLE financial.debit_notes ADD CONSTRAINT debit_notes_party_check
  CHECK (customer_id IS NOT NULL OR supplier_id IS NOT NULL);

-- 4. Expand reference_type to allow PURCHASE_RETURN
ALTER TABLE financial.debit_notes DROP CONSTRAINT IF EXISTS debit_notes_reference_type_check;
ALTER TABLE financial.debit_notes ADD CONSTRAINT debit_notes_reference_type_check
  CHECK (reference_type IN ('INVOICE','INTEREST','PENALTY','ADJUSTMENT','PURCHASE_RETURN','OTHER'));

-- 5. Expand reason_code to allow QUALITY_ISSUE and PURCHASE_RETURN
ALTER TABLE financial.debit_notes DROP CONSTRAINT IF EXISTS debit_notes_reason_code_check;
ALTER TABLE financial.debit_notes ADD CONSTRAINT debit_notes_reason_code_check
  CHECK (reason_code IN ('RATE_CORRECTION','QUANTITY_CORRECTION','TAX_CORRECTION','FREIGHT_CHARGES',
    'LOADING_CHARGES','INTEREST_CHARGES','PENALTY_CHARGES','SERVICE_CHARGES',
    'QUALITY_ISSUE','PURCHASE_RETURN','OTHER'));

-- 6. Index for supplier lookup
CREATE INDEX IF NOT EXISTS idx_fin_debit_notes_supplier
  ON financial.debit_notes(supplier_id) WHERE supplier_id IS NOT NULL;

-- 7. Add supplier_outstanding to tenant-aware tables (security fix)
-- This is handled in application code (tenant_service.py), but adding a comment for tracking
-- TENANT_TABLES += 'supplier_outstanding'
