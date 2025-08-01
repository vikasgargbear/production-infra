-- =============================================
-- GST & TAX MANAGEMENT TABLES
-- =============================================
-- Schema: gst
-- Tables: 12
-- Purpose: GST compliance, returns, and reconciliation
-- =============================================

-- 1. HSN/SAC Master
CREATE TABLE gst.hsn_sac_codes (
    hsn_sac_id SERIAL PRIMARY KEY,
    
    -- Code details
    code TEXT NOT NULL UNIQUE,
    code_type TEXT NOT NULL, -- 'hsn' or 'sac'
    description TEXT NOT NULL,
    
    -- GST rates
    igst_rate NUMERIC(5,2) NOT NULL,
    cgst_rate NUMERIC(5,2) NOT NULL,
    sgst_rate NUMERIC(5,2) NOT NULL,
    cess_rate NUMERIC(5,2) DEFAULT 0,
    
    -- Validity
    effective_from DATE NOT NULL DEFAULT '2017-07-01',
    effective_until DATE,
    
    -- Chapter and section
    chapter_code TEXT,
    chapter_name TEXT,
    section_name TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. GST Rates (Product specific overrides)
CREATE TABLE gst.gst_rates (
    rate_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Product reference
    product_id INTEGER REFERENCES inventory.products(product_id),
    product_category_id INTEGER REFERENCES inventory.product_categories(category_id),
    
    -- GST rates
    igst_rate NUMERIC(5,2) NOT NULL,
    cgst_rate NUMERIC(5,2) NOT NULL,
    sgst_rate NUMERIC(5,2) NOT NULL,
    cess_rate NUMERIC(5,2) DEFAULT 0,
    
    -- Validity
    effective_from DATE NOT NULL,
    effective_until DATE,
    
    -- Notification reference
    notification_number TEXT,
    notification_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    CONSTRAINT product_or_category CHECK (
        (product_id IS NOT NULL AND product_category_id IS NULL) OR
        (product_id IS NULL AND product_category_id IS NOT NULL)
    )
);

-- 3. GSTR-1 Data (Outward supplies)
CREATE TABLE gst.gstr1_data (
    gstr1_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Return period
    return_period TEXT NOT NULL, -- MMYYYY format
    financial_year TEXT NOT NULL,
    
    -- B2B supplies
    b2b_supplies JSONB DEFAULT '[]',
    b2b_invoice_count INTEGER DEFAULT 0,
    b2b_taxable_value NUMERIC(15,2) DEFAULT 0,
    b2b_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- B2C Large (>2.5 lakh)
    b2cl_supplies JSONB DEFAULT '[]',
    b2cl_invoice_count INTEGER DEFAULT 0,
    b2cl_taxable_value NUMERIC(15,2) DEFAULT 0,
    b2cl_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- B2C Small (<=2.5 lakh)
    b2cs_taxable_value NUMERIC(15,2) DEFAULT 0,
    b2cs_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Credit/Debit notes
    cdn_documents JSONB DEFAULT '[]',
    cdn_count INTEGER DEFAULT 0,
    cdn_taxable_value NUMERIC(15,2) DEFAULT 0,
    cdn_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Exports
    exp_supplies JSONB DEFAULT '[]',
    exp_invoice_count INTEGER DEFAULT 0,
    exp_taxable_value NUMERIC(15,2) DEFAULT 0,
    
    -- Nil rated supplies
    nil_rated_supplies JSONB DEFAULT '{}',
    
    -- HSN summary
    hsn_summary JSONB DEFAULT '[]',
    
    -- Document summary
    doc_summary JSONB DEFAULT '{}',
    
    -- Totals
    total_taxable_value NUMERIC(15,2) DEFAULT 0,
    total_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Filing status
    filing_status TEXT DEFAULT 'draft', -- 'draft', 'ready', 'filed', 'amended'
    filed_date DATE,
    arn_number TEXT, -- Acknowledgment reference number
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, return_period)
);

-- 4. GSTR-2A Data (Auto-populated inward supplies)
CREATE TABLE gst.gstr2a_data (
    gstr2a_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Return period
    return_period TEXT NOT NULL,
    
    -- Download details
    downloaded_date DATE NOT NULL,
    download_status TEXT DEFAULT 'success',
    
    -- B2B invoices
    b2b_invoices JSONB DEFAULT '[]',
    b2b_count INTEGER DEFAULT 0,
    b2b_taxable_value NUMERIC(15,2) DEFAULT 0,
    b2b_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Credit/Debit notes
    cdn_documents JSONB DEFAULT '[]',
    cdn_count INTEGER DEFAULT 0,
    
    -- ISD credits
    isd_credits JSONB DEFAULT '[]',
    
    -- Reconciliation status
    reconciliation_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
    matched_invoices INTEGER DEFAULT 0,
    unmatched_invoices INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, return_period)
);

-- 5. GSTR-2B Data (Final ITC statement)
CREATE TABLE gst.gstr2b_data (
    gstr2b_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Return period
    return_period TEXT NOT NULL,
    generation_date DATE NOT NULL,
    
    -- ITC available
    total_itc_available NUMERIC(15,2) DEFAULT 0,
    igst_itc NUMERIC(15,2) DEFAULT 0,
    cgst_itc NUMERIC(15,2) DEFAULT 0,
    sgst_itc NUMERIC(15,2) DEFAULT 0,
    cess_itc NUMERIC(15,2) DEFAULT 0,
    
    -- ITC unavailable
    itc_unavailable NUMERIC(15,2) DEFAULT 0,
    
    -- Import of goods
    import_goods_itc NUMERIC(15,2) DEFAULT 0,
    
    -- ISD credits
    isd_itc NUMERIC(15,2) DEFAULT 0,
    
    -- Ineligible ITC
    ineligible_itc NUMERIC(15,2) DEFAULT 0,
    
    -- Reversal
    itc_reversal NUMERIC(15,2) DEFAULT 0,
    
    -- Net ITC
    net_itc NUMERIC(15,2) DEFAULT 0,
    
    -- Status
    download_status TEXT DEFAULT 'pending',
    downloaded_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, return_period)
);

-- 6. GSTR-3B Summary
CREATE TABLE gst.gstr3b_data (
    gstr3b_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Return period
    return_period TEXT NOT NULL,
    
    -- 3.1 Outward supplies
    outward_taxable_supplies NUMERIC(15,2) DEFAULT 0,
    outward_zero_rated NUMERIC(15,2) DEFAULT 0,
    outward_nil_rated NUMERIC(15,2) DEFAULT 0,
    inward_nil_rated NUMERIC(15,2) DEFAULT 0,
    
    -- 3.1 Tax
    total_output_igst NUMERIC(15,2) DEFAULT 0,
    total_output_cgst NUMERIC(15,2) DEFAULT 0,
    total_output_sgst NUMERIC(15,2) DEFAULT 0,
    total_output_cess NUMERIC(15,2) DEFAULT 0,
    
    -- 4 ITC
    import_goods_igst NUMERIC(15,2) DEFAULT 0,
    import_service_igst NUMERIC(15,2) DEFAULT 0,
    inward_supplies_igst NUMERIC(15,2) DEFAULT 0,
    inward_supplies_cgst NUMERIC(15,2) DEFAULT 0,
    inward_supplies_sgst NUMERIC(15,2) DEFAULT 0,
    itc_reversal_igst NUMERIC(15,2) DEFAULT 0,
    itc_reversal_cgst NUMERIC(15,2) DEFAULT 0,
    itc_reversal_sgst NUMERIC(15,2) DEFAULT 0,
    
    -- 5 Exempt supplies
    inter_state_supplies NUMERIC(15,2) DEFAULT 0,
    intra_state_supplies NUMERIC(15,2) DEFAULT 0,
    
    -- 6 Payment of tax
    tax_payable_igst NUMERIC(15,2) DEFAULT 0,
    tax_payable_cgst NUMERIC(15,2) DEFAULT 0,
    tax_payable_sgst NUMERIC(15,2) DEFAULT 0,
    tax_payable_cess NUMERIC(15,2) DEFAULT 0,
    
    tax_paid_cash_igst NUMERIC(15,2) DEFAULT 0,
    tax_paid_cash_cgst NUMERIC(15,2) DEFAULT 0,
    tax_paid_cash_sgst NUMERIC(15,2) DEFAULT 0,
    tax_paid_cash_cess NUMERIC(15,2) DEFAULT 0,
    
    -- Interest and late fee
    interest_payable NUMERIC(15,2) DEFAULT 0,
    late_fee NUMERIC(15,2) DEFAULT 0,
    
    -- Filing details
    filing_status TEXT DEFAULT 'draft',
    filed_date DATE,
    arn_number TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, return_period)
);

-- 7. GST Reconciliation
CREATE TABLE gst.gst_reconciliation (
    reconciliation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Reconciliation details
    reconciliation_type TEXT NOT NULL, -- 'gstr1_vs_books', 'gstr2a_vs_books', 'gstr3b_vs_books'
    period TEXT NOT NULL,
    
    -- Data comparison
    books_data JSONB NOT NULL,
    gst_return_data JSONB NOT NULL,
    
    -- Variances
    invoice_count_variance INTEGER DEFAULT 0,
    taxable_value_variance NUMERIC(15,2) DEFAULT 0,
    tax_variance NUMERIC(15,2) DEFAULT 0,
    
    -- Reconciliation items
    matched_items JSONB DEFAULT '[]',
    unmatched_in_books JSONB DEFAULT '[]',
    unmatched_in_return JSONB DEFAULT '[]',
    
    -- Status
    reconciliation_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'variance'
    
    -- Actions taken
    actions_taken JSONB DEFAULT '[]',
    
    -- Approval
    reviewed_by INTEGER REFERENCES master.org_users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 8. E-Way Bills
CREATE TABLE gst.eway_bills (
    eway_bill_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- E-way bill number
    eway_bill_number TEXT UNIQUE,
    eway_bill_date DATE NOT NULL,
    
    -- Reference
    document_type TEXT NOT NULL, -- 'invoice', 'challan', 'credit_note'
    document_id INTEGER NOT NULL,
    document_number TEXT NOT NULL,
    
    -- Supply details
    supply_type TEXT NOT NULL, -- 'outward', 'inward'
    sub_supply_type TEXT NOT NULL, -- 'supply', 'return', 'job_work', etc.
    
    -- Party details
    from_gstin TEXT NOT NULL,
    from_address TEXT NOT NULL,
    from_place TEXT NOT NULL,
    from_pincode TEXT NOT NULL,
    from_state_code TEXT NOT NULL,
    
    to_gstin TEXT,
    to_address TEXT NOT NULL,
    to_place TEXT NOT NULL,
    to_pincode TEXT NOT NULL,
    to_state_code TEXT NOT NULL,
    
    -- Value details
    total_value NUMERIC(15,2) NOT NULL,
    taxable_value NUMERIC(15,2) NOT NULL,
    cgst_value NUMERIC(15,2) DEFAULT 0,
    sgst_value NUMERIC(15,2) DEFAULT 0,
    igst_value NUMERIC(15,2) DEFAULT 0,
    cess_value NUMERIC(15,2) DEFAULT 0,
    
    -- Transport details
    transport_mode TEXT NOT NULL, -- 'road', 'rail', 'air', 'ship'
    transport_distance INTEGER,
    transporter_name TEXT,
    transporter_id TEXT,
    transport_doc_number TEXT,
    transport_doc_date DATE,
    vehicle_number TEXT,
    vehicle_type TEXT,
    
    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Status
    eway_bill_status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'expired'
    cancellation_reason TEXT,
    cancelled_date TIMESTAMP WITH TIME ZONE,
    
    -- Extension
    extended BOOLEAN DEFAULT FALSE,
    extension_reason TEXT,
    extended_validity TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    CHECK (document_type IN ('invoice', 'challan', 'credit_note')),
    CHECK (supply_type IN ('outward', 'inward')),
    CHECK (transport_mode IN ('road', 'rail', 'air', 'ship'))
);

-- 9. GST Liability
CREATE TABLE gst.gst_liability (
    liability_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Period
    tax_period TEXT NOT NULL, -- MMYYYY
    due_date DATE NOT NULL,
    
    -- Output tax
    igst_liability NUMERIC(15,2) DEFAULT 0,
    cgst_liability NUMERIC(15,2) DEFAULT 0,
    sgst_liability NUMERIC(15,2) DEFAULT 0,
    cess_liability NUMERIC(15,2) DEFAULT 0,
    
    -- Input tax credit
    igst_itc_available NUMERIC(15,2) DEFAULT 0,
    cgst_itc_available NUMERIC(15,2) DEFAULT 0,
    sgst_itc_available NUMERIC(15,2) DEFAULT 0,
    cess_itc_available NUMERIC(15,2) DEFAULT 0,
    
    -- ITC utilized
    igst_itc_utilized NUMERIC(15,2) DEFAULT 0,
    cgst_itc_utilized NUMERIC(15,2) DEFAULT 0,
    sgst_itc_utilized NUMERIC(15,2) DEFAULT 0,
    cess_itc_utilized NUMERIC(15,2) DEFAULT 0,
    
    -- Cash payment required
    igst_cash_required NUMERIC(15,2) DEFAULT 0,
    cgst_cash_required NUMERIC(15,2) DEFAULT 0,
    sgst_cash_required NUMERIC(15,2) DEFAULT 0,
    cess_cash_required NUMERIC(15,2) DEFAULT 0,
    
    -- Interest and late fee
    interest_amount NUMERIC(15,2) DEFAULT 0,
    late_fee NUMERIC(15,2) DEFAULT 0,
    
    -- Total liability
    total_liability NUMERIC(15,2) DEFAULT 0,
    balance_payable NUMERIC(15,2) DEFAULT 0,
    
    -- Payment status
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid'
    paid_amount NUMERIC(15,2) DEFAULT 0,
    payment_date DATE,
    payment_reference TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, tax_period)
);

-- 10. GST Credit Ledger
CREATE TABLE gst.gst_credit_ledger (
    ledger_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL, -- 'opening_balance', 'itc_availed', 'itc_utilized', 'itc_reversed', 'refund'
    
    -- Reference
    reference_type TEXT,
    reference_id INTEGER,
    reference_number TEXT,
    
    -- Description
    description TEXT NOT NULL,
    
    -- Amounts (Dr/Cr)
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Running balance
    igst_balance NUMERIC(15,2) DEFAULT 0,
    cgst_balance NUMERIC(15,2) DEFAULT 0,
    sgst_balance NUMERIC(15,2) DEFAULT 0,
    cess_balance NUMERIC(15,2) DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 11. GST Audit Trail
CREATE TABLE gst.gst_audit_trail (
    audit_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Activity details
    activity_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activity_type TEXT NOT NULL, -- 'return_filed', 'return_amended', 'payment_made', 'refund_claimed'
    
    -- Reference
    return_type TEXT,
    return_period TEXT,
    reference_number TEXT,
    
    -- Details
    activity_description TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    
    -- User
    performed_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    ip_address INET,
    user_agent TEXT,
    
    -- Status
    activity_status TEXT DEFAULT 'success',
    error_message TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. GST Compliance Calendar
CREATE TABLE gst.compliance_calendar (
    calendar_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Compliance item
    compliance_type TEXT NOT NULL, -- 'gstr1', 'gstr3b', 'annual_return', 'tds_return'
    period TEXT NOT NULL,
    
    -- Due dates
    due_date DATE NOT NULL,
    extended_due_date DATE,
    
    -- Status
    compliance_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'overdue'
    completed_date DATE,
    
    -- Reminders
    reminder_days INTEGER[] DEFAULT '{7,3,1}',
    reminders_sent INTEGER DEFAULT 0,
    last_reminder_date DATE,
    
    -- Responsible person
    assigned_to INTEGER REFERENCES master.org_users(user_id),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, compliance_type, period)
);

-- Create indexes for performance
CREATE INDEX idx_hsn_sac_code ON gst.hsn_sac_codes(code);
CREATE INDEX idx_gst_rates_product ON gst.gst_rates(product_id);
CREATE INDEX idx_gstr1_period ON gst.gstr1_data(return_period);
CREATE INDEX idx_gstr2a_period ON gst.gstr2a_data(return_period);
CREATE INDEX idx_gstr3b_period ON gst.gstr3b_data(return_period);
CREATE INDEX idx_eway_bills_document ON gst.eway_bills(document_type, document_id);
CREATE INDEX idx_eway_bills_number ON gst.eway_bills(eway_bill_number);
CREATE INDEX idx_gst_liability_period ON gst.gst_liability(tax_period);
CREATE INDEX idx_gst_credit_ledger_date ON gst.gst_credit_ledger(transaction_date);
CREATE INDEX idx_compliance_calendar_due ON gst.compliance_calendar(due_date);

-- Add comments
COMMENT ON TABLE gst.hsn_sac_codes IS 'HSN/SAC master with GST rates';
COMMENT ON TABLE gst.gstr1_data IS 'GSTR-1 outward supply return data';
COMMENT ON TABLE gst.gstr2a_data IS 'GSTR-2A auto-populated inward supplies';
COMMENT ON TABLE gst.gstr3b_data IS 'GSTR-3B summary return data';
COMMENT ON TABLE gst.eway_bills IS 'E-way bill generation and tracking';
COMMENT ON TABLE gst.gst_liability IS 'Monthly GST liability calculation';
COMMENT ON TABLE gst.compliance_calendar IS 'GST compliance due dates and tracking';