-- Fix credit_notes constraints to match actual usage
-- Run this on Railway database

-- 1. Fix reason_code constraint
ALTER TABLE financial.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_reason_code_check;

ALTER TABLE financial.credit_notes 
ADD CONSTRAINT credit_notes_reason_code_check 
CHECK (reason_code IN (
    'NOT_REQUIRED', 'EXPIRED', 'WRONG_ITEM', 'QUALITY_ISSUE',
    'SHORT_EXPIRY', 'BATCH_RECALL', 'DAMAGED_IN_TRANSIT', 'DAMAGED', 'OTHER',
    'SALES_RETURN', 'DAMAGED_GOODS', 'EXPIRED_GOODS', 
    'WRONG_BILLING', 'RATE_DIFFERENCE', 'SHORT_SUPPLY', 'DISCOUNT_ADJUSTMENT'
));

-- 2. Fix reference_type constraint (code uses 'sales_return')
ALTER TABLE financial.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_reference_type_check;

ALTER TABLE financial.credit_notes 
ADD CONSTRAINT credit_notes_reference_type_check 
CHECK (reference_type IN ('INVOICE', 'RETURN', 'ADJUSTMENT', 'OTHER', 'sales_return'));

