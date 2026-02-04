-- Migration: Add return_method column to sales.sales_returns
-- Purpose: Track the resolution type (credit_note, replacement, refund, no_adjustment)
-- Date: 2026-02-04

-- Add return_method column with CHECK constraint
ALTER TABLE sales.sales_returns 
ADD COLUMN IF NOT EXISTS return_method VARCHAR(20) DEFAULT 'credit_note'
CHECK (return_method IN ('credit_note', 'replacement', 'refund', 'no_adjustment'));

-- Add index for efficient filtering by return_method
CREATE INDEX IF NOT EXISTS idx_sales_returns_return_method 
ON sales.sales_returns(return_method);

-- Comment for documentation
COMMENT ON COLUMN sales.sales_returns.return_method IS 
'Resolution method: credit_note (add to customer credit), replacement (issue new goods), refund (cash/bank transfer), no_adjustment (inventory only)';
