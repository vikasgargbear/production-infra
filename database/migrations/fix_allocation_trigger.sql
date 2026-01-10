-- Remove allocation triggers from financial module
-- Operational invoice creation should NOT trigger financial module updates
-- Finance module manages its own allocations independently

-- 1. Drop the allocation update trigger
DROP TRIGGER IF EXISTS trg_update_allocation_status ON financial.payment_allocations;

-- 2. Drop the validation trigger  
DROP TRIGGER IF EXISTS trg_validate_payment_allocation ON financial.payment_allocations;

-- 3. Drop the functions (optional - keeps them but unused)
-- DROP FUNCTION IF EXISTS financial.update_allocation_status();
-- DROP FUNCTION IF EXISTS financial.validate_payment_allocation();

-- 4. Remove allocated_amount and unallocated_amount columns from sales.invoices
-- These are finance-specific and should not exist in operational invoice table
ALTER TABLE sales.invoices DROP COLUMN IF EXISTS allocated_amount CASCADE;
ALTER TABLE sales.invoices DROP COLUMN IF EXISTS unallocated_amount CASCADE;

-- Done: Operations and Finance are now completely separated
-- Finance module will handle allocations through its own API, not through triggers
