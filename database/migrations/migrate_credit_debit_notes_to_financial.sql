-- =============================================
-- FINANCIAL SCHEMA CONSOLIDATION MIGRATION
-- =============================================
-- Purpose: Move credit_notes and debit_notes from sales to financial schema
-- Date: 2026-02-04
-- =============================================

-- IMPORTANT: Run this in a transaction and test in staging first!
BEGIN;

-- =============================================
-- STEP 1: Create credit_notes in financial schema
-- =============================================
CREATE TABLE IF NOT EXISTS financial.credit_notes (
    credit_note_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id),
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Document details
    credit_note_number TEXT NOT NULL,
    credit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Customer reference
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Reference to original document (optional)
    reference_type TEXT CHECK (reference_type IN ('INVOICE', 'RETURN', 'ADJUSTMENT', 'OTHER')),
    reference_id INTEGER,
    reference_number TEXT,
    
    -- Amounts
    credit_amount NUMERIC(15,2) NOT NULL CHECK (credit_amount > 0),
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL,
    
    -- Reason and details
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'SALES_RETURN', 'DAMAGED_GOODS', 'EXPIRED_GOODS', 
        'WRONG_BILLING', 'RATE_DIFFERENCE', 'QUALITY_ISSUE',
        'SHORT_SUPPLY', 'DISCOUNT_ADJUSTMENT', 'OTHER'
    )),
    reason TEXT NOT NULL,
    notes TEXT,
    
    -- GST details
    is_gst_applicable BOOLEAN DEFAULT true,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    igst_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status and workflow
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled', 'applied')),
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date TIMESTAMP WITH TIME ZONE,
    
    -- Application tracking
    applied_amount NUMERIC(15,2) DEFAULT 0,
    remaining_amount NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - COALESCE(applied_amount, 0)) STORED,
    
    -- Items detail
    items_detail JSONB,
    
    -- Metadata
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_financial_credit_note_number UNIQUE (org_id, credit_note_number)
);

-- =============================================
-- STEP 2: Create debit_notes in financial schema
-- =============================================
CREATE TABLE IF NOT EXISTS financial.debit_notes (
    debit_note_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id),
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Document details
    debit_note_number TEXT NOT NULL,
    debit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Customer reference
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Reference to original document
    reference_type TEXT CHECK (reference_type IN ('INVOICE', 'INTEREST', 'PENALTY', 'ADJUSTMENT', 'OTHER')),
    reference_id INTEGER,
    reference_number TEXT,
    
    -- Amounts
    debit_amount NUMERIC(15,2) NOT NULL CHECK (debit_amount > 0),
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL,
    
    -- Reason and details
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'RATE_CORRECTION', 'QUANTITY_CORRECTION', 'TAX_CORRECTION',
        'FREIGHT_CHARGES', 'LOADING_CHARGES', 'INTEREST_CHARGES',
        'PENALTY_CHARGES', 'SERVICE_CHARGES', 'OTHER'
    )),
    reason TEXT NOT NULL,
    notes TEXT,
    
    -- GST details
    is_gst_applicable BOOLEAN DEFAULT true,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    igst_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status and workflow
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled', 'paid')),
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date TIMESTAMP WITH TIME ZONE,
    
    -- Payment tracking
    paid_amount NUMERIC(15,2) DEFAULT 0,
    payment_status TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN paid_amount >= total_amount THEN 'paid'
            WHEN paid_amount > 0 THEN 'partial'
            ELSE 'pending'
        END
    ) STORED,
    
    -- Items detail
    items_detail JSONB,
    
    -- Metadata
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_financial_debit_note_number UNIQUE (org_id, debit_note_number)
);

-- =============================================
-- STEP 3: Migrate data from sales to financial
-- =============================================

-- Insert credit notes (if sales.credit_notes exists and has data)
INSERT INTO financial.credit_notes (
    credit_note_id, org_id, branch_id, credit_note_number, credit_note_date,
    customer_id, reference_type, reference_id, reference_number,
    credit_amount, tax_amount, total_amount, reason_code, reason, notes,
    is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
    status, approved_by, approved_date, applied_amount, items_detail,
    created_by, created_at, updated_at
)
SELECT 
    credit_note_id, org_id, branch_id, credit_note_number, credit_note_date,
    customer_id, reference_type, reference_id, reference_number,
    credit_amount, tax_amount, total_amount, reason_code, reason, notes,
    is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
    status, approved_by, approved_date, applied_amount, items_detail,
    created_by, created_at, updated_at
FROM sales.credit_notes
ON CONFLICT (org_id, credit_note_number) DO NOTHING;

-- Insert debit notes (if sales.debit_notes exists and has data)
INSERT INTO financial.debit_notes (
    debit_note_id, org_id, branch_id, debit_note_number, debit_note_date,
    customer_id, reference_type, reference_id, reference_number,
    debit_amount, tax_amount, total_amount, reason_code, reason, notes,
    is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
    status, approved_by, approved_date, paid_amount, items_detail,
    created_by, created_at, updated_at
)
SELECT 
    debit_note_id, org_id, branch_id, debit_note_number, debit_note_date,
    customer_id, reference_type, reference_id, reference_number,
    debit_amount, tax_amount, total_amount, reason_code, reason, notes,
    is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
    status, approved_by, approved_date, paid_amount, items_detail,
    created_by, created_at, updated_at
FROM sales.debit_notes
ON CONFLICT (org_id, debit_note_number) DO NOTHING;

-- =============================================
-- STEP 4: Reset sequences
-- =============================================
SELECT setval('financial.credit_notes_credit_note_id_seq', 
    COALESCE((SELECT MAX(credit_note_id) FROM financial.credit_notes), 1));
SELECT setval('financial.debit_notes_debit_note_id_seq', 
    COALESCE((SELECT MAX(debit_note_id) FROM financial.debit_notes), 1));

-- =============================================
-- STEP 5: Create indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_fin_credit_notes_customer ON financial.credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_fin_credit_notes_status ON financial.credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_fin_credit_notes_date ON financial.credit_notes(credit_note_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_credit_notes_org ON financial.credit_notes(org_id);

CREATE INDEX IF NOT EXISTS idx_fin_debit_notes_customer ON financial.debit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_fin_debit_notes_status ON financial.debit_notes(status);
CREATE INDEX IF NOT EXISTS idx_fin_debit_notes_date ON financial.debit_notes(debit_note_date DESC);
CREATE INDEX IF NOT EXISTS idx_fin_debit_notes_org ON financial.debit_notes(org_id);

-- =============================================
-- STEP 6: Add update triggers
-- =============================================
CREATE TRIGGER update_financial_credit_notes_timestamp
    BEFORE UPDATE ON financial.credit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_financial_debit_notes_timestamp
    BEFORE UPDATE ON financial.debit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =============================================
-- STEP 7: Grant permissions
-- =============================================
GRANT ALL ON financial.credit_notes TO postgres;
GRANT ALL ON financial.debit_notes TO postgres;
GRANT USAGE ON SEQUENCE financial.credit_notes_credit_note_id_seq TO postgres;
GRANT USAGE ON SEQUENCE financial.debit_notes_debit_note_id_seq TO postgres;

-- Comments
COMMENT ON TABLE financial.credit_notes IS 'Credit notes issued to customers (moved from sales schema)';
COMMENT ON TABLE financial.debit_notes IS 'Debit notes issued to customers (moved from sales schema)';

COMMIT;

-- =============================================
-- VERIFICATION QUERY (run after migration)
-- =============================================
-- SELECT 
--     'sales.credit_notes' as source,
--     COUNT(*) as count 
-- FROM sales.credit_notes
-- UNION ALL
-- SELECT 
--     'financial.credit_notes' as source,
--     COUNT(*) as count 
-- FROM financial.credit_notes;
