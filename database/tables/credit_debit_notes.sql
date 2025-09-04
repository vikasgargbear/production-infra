-- Credit Notes and Debit Notes Tables for Financial Adjustments
-- Credit Note: Reduces what customer owes (issued when we owe customer)
-- Debit Note: Increases what customer owes (issued when customer owes more)

-- Credit Notes Table (When we owe customer - returns, overcharges, etc.)
CREATE TABLE IF NOT EXISTS sales.credit_notes (
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
    reference_id INTEGER, -- Can be invoice_id, return_id, etc.
    reference_number TEXT, -- Original invoice number, return number, etc.
    
    -- Amounts
    credit_amount NUMERIC(15,2) NOT NULL CHECK (credit_amount > 0),
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL, -- credit_amount + tax_amount
    
    -- Reason and details
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'SALES_RETURN', 'DAMAGED_GOODS', 'EXPIRED_GOODS', 
        'WRONG_BILLING', 'RATE_DIFFERENCE', 'QUALITY_ISSUE',
        'SHORT_SUPPLY', 'DISCOUNT_ADJUSTMENT', 'OTHER'
    )),
    reason TEXT NOT NULL,
    notes TEXT,
    
    -- GST details (if applicable)
    is_gst_applicable BOOLEAN DEFAULT true,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    igst_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status and workflow
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'cancelled', 'applied')),
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date TIMESTAMP WITH TIME ZONE,
    
    -- Application tracking (how the credit was used)
    applied_amount NUMERIC(15,2) DEFAULT 0, -- Amount already applied to invoices
    remaining_amount NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - COALESCE(applied_amount, 0)) STORED,
    
    -- Items detail (for detailed credit notes)
    items_detail JSONB,
    
    -- Metadata
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint
    CONSTRAINT unique_credit_note_number UNIQUE (org_id, credit_note_number)
);

-- Debit Notes Table (When customer owes more - additional charges, interest, etc.)
CREATE TABLE IF NOT EXISTS sales.debit_notes (
    debit_note_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id),
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Document details
    debit_note_number TEXT NOT NULL,
    debit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Customer reference
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Reference to original document (optional)
    reference_type TEXT CHECK (reference_type IN ('INVOICE', 'INTEREST', 'PENALTY', 'ADJUSTMENT', 'OTHER')),
    reference_id INTEGER, -- Can be invoice_id, etc.
    reference_number TEXT, -- Original invoice number, etc.
    
    -- Amounts
    debit_amount NUMERIC(15,2) NOT NULL CHECK (debit_amount > 0),
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2) NOT NULL, -- debit_amount + tax_amount
    
    -- Reason and details
    reason_code TEXT NOT NULL CHECK (reason_code IN (
        'RATE_CORRECTION', 'QUANTITY_CORRECTION', 'TAX_CORRECTION',
        'FREIGHT_CHARGES', 'LOADING_CHARGES', 'INTEREST_CHARGES',
        'PENALTY_CHARGES', 'SERVICE_CHARGES', 'OTHER'
    )),
    reason TEXT NOT NULL,
    notes TEXT,
    
    -- GST details (if applicable)
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
    
    -- Items detail (for detailed debit notes)
    items_detail JSONB,
    
    -- Metadata
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint
    CONSTRAINT unique_debit_note_number UNIQUE (org_id, debit_note_number)
);

-- Credit Note Applications (Track how credit notes are applied to invoices)
CREATE TABLE IF NOT EXISTS sales.credit_note_applications (
    application_id SERIAL PRIMARY KEY,
    credit_note_id INTEGER NOT NULL REFERENCES sales.credit_notes(credit_note_id),
    invoice_id INTEGER NOT NULL REFERENCES sales.invoices(invoice_id),
    applied_amount NUMERIC(15,2) NOT NULL CHECK (applied_amount > 0),
    application_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate applications
    CONSTRAINT unique_credit_application UNIQUE (credit_note_id, invoice_id)
);

-- Indexes for performance
CREATE INDEX idx_credit_notes_customer ON sales.credit_notes(customer_id);
CREATE INDEX idx_credit_notes_status ON sales.credit_notes(status);
CREATE INDEX idx_credit_notes_date ON sales.credit_notes(credit_note_date DESC);
CREATE INDEX idx_credit_notes_reference ON sales.credit_notes(reference_type, reference_id);

CREATE INDEX idx_debit_notes_customer ON sales.debit_notes(customer_id);
CREATE INDEX idx_debit_notes_status ON sales.debit_notes(status);
CREATE INDEX idx_debit_notes_date ON sales.debit_notes(debit_note_date DESC);
CREATE INDEX idx_debit_notes_reference ON sales.debit_notes(reference_type, reference_id);

CREATE INDEX idx_credit_applications_invoice ON sales.credit_note_applications(invoice_id);

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_credit_notes_timestamp
    BEFORE UPDATE ON sales.credit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_debit_notes_timestamp
    BEFORE UPDATE ON sales.debit_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Grant permissions
GRANT ALL ON sales.credit_notes TO postgres;
GRANT ALL ON sales.debit_notes TO postgres;
GRANT ALL ON sales.credit_note_applications TO postgres;
GRANT USAGE ON SEQUENCE sales.credit_notes_credit_note_id_seq TO postgres;
GRANT USAGE ON SEQUENCE sales.debit_notes_debit_note_id_seq TO postgres;
GRANT USAGE ON SEQUENCE sales.credit_note_applications_application_id_seq TO postgres;

-- Comments for documentation
COMMENT ON TABLE sales.credit_notes IS 'Credit notes issued to customers for returns, overcharges, etc.';
COMMENT ON TABLE sales.debit_notes IS 'Debit notes issued to customers for additional charges';
COMMENT ON TABLE sales.credit_note_applications IS 'Track how credit notes are applied to invoices';

COMMENT ON COLUMN sales.credit_notes.remaining_amount IS 'Auto-calculated: total_amount - applied_amount';
COMMENT ON COLUMN sales.debit_notes.payment_status IS 'Auto-calculated based on paid_amount vs total_amount';