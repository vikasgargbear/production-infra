-- Fix credit_notes reason_code constraint to include all return reasons
-- Run this on Railway database

ALTER TABLE financial.credit_notes 
DROP CONSTRAINT IF EXISTS credit_notes_reason_code_check;

ALTER TABLE financial.credit_notes 
ADD CONSTRAINT credit_notes_reason_code_check 
CHECK (reason_code IN (
    -- Return reasons (from useReturnReasons.ts)
    'NOT_REQUIRED', 'EXPIRED', 'WRONG_ITEM', 'QUALITY_ISSUE',
    'SHORT_EXPIRY', 'BATCH_RECALL', 'DAMAGED_IN_TRANSIT', 'DAMAGED', 'OTHER',
    -- Additional credit note reasons
    'SALES_RETURN', 'DAMAGED_GOODS', 'EXPIRED_GOODS', 
    'WRONG_BILLING', 'RATE_DIFFERENCE', 'SHORT_SUPPLY', 'DISCOUNT_ADJUSTMENT'
));
