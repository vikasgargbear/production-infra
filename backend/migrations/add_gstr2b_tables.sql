-- GSTR-2B Reconciliation Tables
-- Run this migration to add GSTR-2B storage and reconciliation support

-- Create GST schema if not exists
CREATE SCHEMA IF NOT EXISTS gst;

-- GSTR-2B Uploads - Stores uploaded files and metadata
CREATE TABLE IF NOT EXISTS gst.gstr2b_uploads (
    upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    return_period VARCHAR(7) NOT NULL, -- "2024-01" format
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    uploaded_by UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gstin VARCHAR(15) NOT NULL,
    total_invoices INT DEFAULT 0,
    total_itc_available DECIMAL(15,2) DEFAULT 0,
    total_suppliers INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing', -- processing, completed, error
    error_message TEXT,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    matched_count INT DEFAULT 0,
    mismatched_count INT DEFAULT 0,
    missing_count INT DEFAULT 0,
    extra_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GSTR-2B Invoices - Individual invoices from GSTR-2B for reconciliation
CREATE TABLE IF NOT EXISTS gst.gstr2b_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID REFERENCES gst.gstr2b_uploads(upload_id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    return_period VARCHAR(7) NOT NULL,
    -- Supplier details from GSTR-2B
    supplier_gstin VARCHAR(15) NOT NULL,
    supplier_name VARCHAR(255),
    supplier_trade_name VARCHAR(255),
    -- Invoice details from GSTR-2B
    invoice_number VARCHAR(100) NOT NULL,
    invoice_date DATE,
    invoice_type VARCHAR(20) DEFAULT 'B2B', -- B2B, B2BA, CDNR, CDNRA, ISD, ISDA, IMPG, IMPGSEZ
    invoice_value DECIMAL(15,2),
    taxable_value DECIMAL(15,2),
    igst DECIMAL(15,2) DEFAULT 0,
    cgst DECIMAL(15,2) DEFAULT 0,
    sgst DECIMAL(15,2) DEFAULT 0,
    cess DECIMAL(15,2) DEFAULT 0,
    total_tax DECIMAL(15,2) GENERATED ALWAYS AS (igst + cgst + sgst + cess) STORED,
    itc_available DECIMAL(15,2),
    -- Place of supply
    pos VARCHAR(2), -- State code
    reverse_charge VARCHAR(1) DEFAULT 'N', -- Y/N
    -- Reconciliation fields
    matched_invoice_id UUID, -- Links to procurement.supplier_invoices
    match_status VARCHAR(20) DEFAULT 'pending', -- pending, matched, mismatched, missing
    mismatch_type VARCHAR(50), -- amount, invoice_number, date, gstin, etc
    mismatch_details JSONB, -- Details of what mismatched
    our_invoice_number VARCHAR(100), -- Our corresponding invoice number if found
    our_invoice_amount DECIMAL(15,2), -- Our recorded amount
    amount_difference DECIMAL(15,2), -- Difference if any
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gstr2b_uploads_org_period ON gst.gstr2b_uploads(org_id, return_period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_upload ON gst.gstr2b_invoices(upload_id);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_org_period ON gst.gstr2b_invoices(org_id, return_period);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_supplier ON gst.gstr2b_invoices(supplier_gstin);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_match_status ON gst.gstr2b_invoices(match_status);
CREATE INDEX IF NOT EXISTS idx_gstr2b_invoices_invoice_number ON gst.gstr2b_invoices(invoice_number);

-- Add comments
COMMENT ON TABLE gst.gstr2b_uploads IS 'Stores GSTR-2B file uploads with reconciliation summary';
COMMENT ON TABLE gst.gstr2b_invoices IS 'Individual invoices from GSTR-2B for reconciliation against purchases';
COMMENT ON COLUMN gst.gstr2b_invoices.match_status IS 'pending=not reconciled, matched=found exact match, mismatched=found but differs, missing=not in our books';
