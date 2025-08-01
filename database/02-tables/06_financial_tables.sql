-- =============================================
-- FINANCIAL MANAGEMENT TABLES
-- =============================================
-- Schema: financial
-- Tables: 15
-- Purpose: Payments, accounting, credit management
-- =============================================

-- 1. Payment Methods
CREATE TABLE financial.payment_methods (
    payment_method_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Method details
    method_code TEXT NOT NULL,
    method_name TEXT NOT NULL,
    method_type TEXT NOT NULL, -- 'cash', 'cheque', 'bank_transfer', 'card', 'upi', 'wallet'
    
    -- Configuration
    requires_reference BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT FALSE,
    
    -- Bank account linkage
    default_bank_account_id INTEGER REFERENCES master.org_bank_accounts(bank_account_id),
    
    -- Processing
    processing_days INTEGER DEFAULT 0, -- Days to clear
    
    -- Charges
    transaction_charge_percent NUMERIC(5,2) DEFAULT 0,
    transaction_charge_fixed NUMERIC(15,2) DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, method_code)
);

-- 2. Payments (Unified payment table)
CREATE TABLE financial.payments (
    payment_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Payment identification
    payment_number TEXT NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_type TEXT NOT NULL, -- 'receipt', 'payment', 'contra', 'journal'
    
    -- Party details
    party_type TEXT NOT NULL, -- 'customer', 'supplier', 'bank', 'cash', 'expense'
    party_id INTEGER, -- References customer_id or supplier_id
    party_name TEXT NOT NULL, -- Denormalized
    
    -- Payment details
    payment_amount NUMERIC(15,2) NOT NULL,
    payment_method_id INTEGER NOT NULL REFERENCES financial.payment_methods(payment_method_id),
    
    -- Reference details
    reference_number TEXT, -- Cheque/transaction number
    reference_date DATE,
    
    -- Bank details
    bank_account_id INTEGER REFERENCES master.org_bank_accounts(bank_account_id),
    deposited_at_bank TEXT,
    
    -- Status
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'processed', 'cleared', 'bounced', 'cancelled'
    clearance_date DATE,
    
    -- Approval
    requires_approval BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Allocation details
    allocation_status TEXT DEFAULT 'unallocated', -- 'unallocated', 'partial', 'full'
    allocated_amount NUMERIC(15,2) DEFAULT 0,
    unallocated_amount NUMERIC(15,2),
    
    -- Notes
    narration TEXT,
    internal_notes TEXT,
    
    -- PDC tracking
    is_pdc BOOLEAN DEFAULT FALSE, -- Post-dated cheque
    pdc_status TEXT, -- 'pending', 'presented', 'cleared', 'bounced'
    
    -- Cancellation
    is_cancelled BOOLEAN DEFAULT FALSE,
    cancellation_reason TEXT,
    cancelled_by INTEGER REFERENCES master.org_users(user_id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, payment_number)
);

-- 3. Payment Allocations
CREATE TABLE financial.payment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL REFERENCES financial.payments(payment_id) ON DELETE CASCADE,
    
    -- What this payment is allocated against
    reference_type TEXT NOT NULL, -- 'invoice', 'debit_note', 'credit_note', 'advance'
    reference_id INTEGER NOT NULL,
    reference_number TEXT NOT NULL,
    
    -- Amounts
    allocated_amount NUMERIC(15,2) NOT NULL,
    
    -- Discount if any
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Write-off
    write_off_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status
    allocation_status TEXT DEFAULT 'active', -- 'active', 'reversed'
    
    -- Reversal
    reversed_by INTEGER REFERENCES master.org_users(user_id),
    reversed_at TIMESTAMP WITH TIME ZONE,
    reversal_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 4. Customer Outstanding
CREATE TABLE financial.customer_outstanding (
    outstanding_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Document reference
    document_type TEXT NOT NULL, -- 'invoice', 'debit_note', 'payment', 'credit_note'
    document_id INTEGER NOT NULL,
    document_number TEXT NOT NULL,
    document_date DATE NOT NULL,
    
    -- Amounts
    original_amount NUMERIC(15,2) NOT NULL,
    outstanding_amount NUMERIC(15,2) NOT NULL,
    paid_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Due date and aging
    due_date DATE,
    days_overdue INTEGER DEFAULT 0, -- Will be calculated via trigger/function
    
    -- Aging buckets
    aging_bucket TEXT DEFAULT 'current', -- Will be calculated via trigger/function
    
    -- Status
    status TEXT DEFAULT 'open', -- 'open', 'partial', 'paid', 'written_off'
    
    -- Collection tracking
    promised_date DATE,
    follow_up_date DATE,
    collection_notes TEXT,
    
    -- Write-off
    write_off_amount NUMERIC(15,2) DEFAULT 0,
    write_off_date DATE,
    write_off_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Supplier Outstanding
CREATE TABLE financial.supplier_outstanding (
    outstanding_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    
    -- Document reference
    document_type TEXT NOT NULL, -- 'invoice', 'credit_note', 'payment', 'debit_note'
    document_id INTEGER NOT NULL,
    document_number TEXT NOT NULL,
    document_date DATE NOT NULL,
    
    -- Amounts
    original_amount NUMERIC(15,2) NOT NULL,
    outstanding_amount NUMERIC(15,2) NOT NULL,
    paid_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Due date
    due_date DATE,
    days_until_due INTEGER DEFAULT 0, -- Will be calculated via trigger/function
    
    -- Status
    status TEXT DEFAULT 'open', -- 'open', 'partial', 'paid'
    
    -- Payment planning
    planned_payment_date DATE,
    payment_priority TEXT DEFAULT 'normal', -- 'high', 'normal', 'low'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Journal Entries
CREATE TABLE financial.journal_entries (
    journal_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Journal identification
    journal_number TEXT NOT NULL,
    journal_date DATE NOT NULL,
    journal_type TEXT NOT NULL, -- 'manual', 'sales', 'purchase', 'payment', 'receipt', 'contra'
    
    -- Reference
    reference_type TEXT,
    reference_id INTEGER,
    reference_number TEXT,
    
    -- Status
    entry_status TEXT DEFAULT 'draft', -- 'draft', 'posted', 'cancelled'
    
    -- Posting
    posted_by INTEGER REFERENCES master.org_users(user_id),
    posted_at TIMESTAMP WITH TIME ZONE,
    
    -- Reversal
    is_reversal BOOLEAN DEFAULT FALSE,
    reversal_of_journal_id INTEGER REFERENCES financial.journal_entries(journal_id),
    
    -- Notes
    narration TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, journal_number)
);

-- 7. Journal Entry Lines
CREATE TABLE financial.journal_entry_lines (
    line_id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL REFERENCES financial.journal_entries(journal_id) ON DELETE CASCADE,
    
    -- Account
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    
    -- Amounts (one must be zero)
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Party reference (if applicable)
    party_type TEXT,
    party_id INTEGER,
    
    -- Cost center
    cost_center_id INTEGER,
    
    -- Line description
    line_narration TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Validation
    CONSTRAINT valid_amounts CHECK (
        (debit_amount = 0 AND credit_amount > 0) OR 
        (debit_amount > 0 AND credit_amount = 0)
    )
);

-- 8. Chart of Accounts
CREATE TABLE financial.chart_of_accounts (
    account_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Account hierarchy
    parent_account_id INTEGER REFERENCES financial.chart_of_accounts(account_id),
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    
    -- Account classification
    account_type TEXT NOT NULL, -- 'asset', 'liability', 'equity', 'revenue', 'expense'
    account_subtype TEXT,
    
    -- Properties
    is_group BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_system_account BOOLEAN DEFAULT FALSE, -- Cannot be deleted
    
    -- Nature
    normal_balance TEXT NOT NULL, -- 'debit' or 'credit'
    
    -- Current balance
    current_balance NUMERIC(15,2) DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, account_code)
);

-- 9. Bank Reconciliation
CREATE TABLE financial.bank_reconciliations (
    reconciliation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    bank_account_id INTEGER NOT NULL REFERENCES master.org_bank_accounts(bank_account_id),
    
    -- Reconciliation period
    reconciliation_date DATE NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    
    -- Bank statement
    statement_balance NUMERIC(15,2) NOT NULL,
    statement_date DATE NOT NULL,
    
    -- Book balance
    book_balance NUMERIC(15,2) NOT NULL,
    
    -- Reconciliation items
    uncleared_deposits NUMERIC(15,2) DEFAULT 0,
    uncleared_payments NUMERIC(15,2) DEFAULT 0,
    
    -- Adjusted balance
    adjusted_book_balance NUMERIC(15,2),
    difference NUMERIC(15,2),
    
    -- Status
    reconciliation_status TEXT DEFAULT 'draft', -- 'draft', 'completed', 'approved'
    
    -- Approval
    completed_by INTEGER REFERENCES master.org_users(user_id),
    completed_at TIMESTAMP WITH TIME ZONE,
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 10. Bank Reconciliation Items
CREATE TABLE financial.bank_reconciliation_items (
    item_id SERIAL PRIMARY KEY,
    reconciliation_id INTEGER NOT NULL REFERENCES financial.bank_reconciliations(reconciliation_id) ON DELETE CASCADE,
    
    -- Transaction reference
    transaction_type TEXT NOT NULL, -- 'payment', 'deposit', 'bank_charge', 'bank_interest'
    transaction_id INTEGER,
    transaction_date DATE NOT NULL,
    transaction_amount NUMERIC(15,2) NOT NULL,
    
    -- Reconciliation status
    is_reconciled BOOLEAN DEFAULT FALSE,
    reconciled_amount NUMERIC(15,2),
    
    -- Bank statement reference
    statement_reference TEXT,
    statement_date DATE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Expense Categories
CREATE TABLE financial.expense_categories (
    category_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Category hierarchy
    parent_category_id INTEGER REFERENCES financial.expense_categories(category_id),
    category_code TEXT NOT NULL,
    category_name TEXT NOT NULL,
    
    -- Account linkage
    expense_account_id INTEGER REFERENCES financial.chart_of_accounts(account_id),
    
    -- Budget
    monthly_budget NUMERIC(15,2),
    quarterly_budget NUMERIC(15,2),
    annual_budget NUMERIC(15,2),
    
    -- Approval requirements
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_limit NUMERIC(15,2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, category_code)
);

-- 12. Expense Claims
CREATE TABLE financial.expense_claims (
    claim_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Claim details
    claim_number TEXT NOT NULL,
    claim_date DATE NOT NULL,
    
    -- Employee
    employee_id INTEGER NOT NULL REFERENCES master.org_users(user_id),
    department TEXT,
    
    -- Period
    expense_from_date DATE,
    expense_to_date DATE,
    
    -- Amounts
    total_amount NUMERIC(15,2) NOT NULL,
    approved_amount NUMERIC(15,2),
    advance_amount NUMERIC(15,2) DEFAULT 0,
    payable_amount NUMERIC(15,2),
    
    -- Status
    claim_status TEXT DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'rejected', 'paid'
    
    -- Approval workflow
    submitted_date DATE,
    current_approver_id INTEGER REFERENCES master.org_users(user_id),
    approval_history JSONB DEFAULT '[]',
    
    -- Payment
    payment_status TEXT DEFAULT 'pending',
    payment_id INTEGER REFERENCES financial.payments(payment_id),
    paid_date DATE,
    
    -- Notes
    purpose TEXT,
    notes TEXT,
    rejection_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, claim_number)
);

-- 13. Expense Claim Items
CREATE TABLE financial.expense_claim_items (
    claim_item_id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL REFERENCES financial.expense_claims(claim_id) ON DELETE CASCADE,
    
    -- Expense details
    expense_date DATE NOT NULL,
    category_id INTEGER NOT NULL REFERENCES financial.expense_categories(category_id),
    
    -- Description
    expense_description TEXT NOT NULL,
    
    -- Amounts
    claimed_amount NUMERIC(15,2) NOT NULL,
    approved_amount NUMERIC(15,2),
    
    -- Supporting documents
    bill_number TEXT,
    bill_date DATE,
    vendor_name TEXT,
    
    -- Attachment
    attachment_path TEXT,
    
    -- Status
    item_status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    
    -- Notes
    notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. PDC Management (Post-dated cheques)
CREATE TABLE financial.pdc_management (
    pdc_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES financial.payments(payment_id),
    
    -- PDC details
    cheque_number TEXT NOT NULL,
    cheque_date DATE NOT NULL,
    bank_name TEXT NOT NULL,
    
    -- Party
    party_type TEXT NOT NULL, -- 'customer' or 'supplier'
    party_id INTEGER NOT NULL,
    party_name TEXT NOT NULL,
    
    -- Amount
    cheque_amount NUMERIC(15,2) NOT NULL,
    
    -- Type
    pdc_type TEXT NOT NULL, -- 'received' or 'issued'
    
    -- Status tracking
    pdc_status TEXT DEFAULT 'pending', -- 'pending', 'deposited', 'cleared', 'bounced', 'cancelled'
    deposit_date DATE,
    clearance_date DATE,
    
    -- Bounce handling
    bounce_count INTEGER DEFAULT 0,
    bounce_charges NUMERIC(15,2) DEFAULT 0,
    bounce_reason TEXT,
    
    -- Location
    cheque_location TEXT DEFAULT 'in_hand', -- 'in_hand', 'deposited', 'returned'
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, cheque_number, bank_name)
);

-- 15. Cash Flow Forecast
CREATE TABLE financial.cash_flow_forecast (
    forecast_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Forecast period
    forecast_date DATE NOT NULL,
    forecast_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    
    -- Opening balance
    opening_balance NUMERIC(15,2) NOT NULL,
    
    -- Inflows
    customer_collections NUMERIC(15,2) DEFAULT 0,
    other_income NUMERIC(15,2) DEFAULT 0,
    total_inflows NUMERIC(15,2) DEFAULT 0,
    
    -- Outflows
    supplier_payments NUMERIC(15,2) DEFAULT 0,
    salary_payments NUMERIC(15,2) DEFAULT 0,
    other_expenses NUMERIC(15,2) DEFAULT 0,
    total_outflows NUMERIC(15,2) DEFAULT 0,
    
    -- Closing balance
    projected_closing_balance NUMERIC(15,2),
    minimum_required_balance NUMERIC(15,2),
    surplus_deficit NUMERIC(15,2),
    
    -- Actuals (updated later)
    actual_inflows NUMERIC(15,2),
    actual_outflows NUMERIC(15,2),
    actual_closing_balance NUMERIC(15,2),
    variance NUMERIC(15,2),
    
    -- Status
    forecast_status TEXT DEFAULT 'projected', -- 'projected', 'actual'
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, forecast_date)
);

-- Create indexes for performance
CREATE INDEX idx_payments_party ON financial.payments(party_type, party_id);
CREATE INDEX idx_payments_date ON financial.payments(payment_date);
CREATE INDEX idx_payments_status ON financial.payments(payment_status);
CREATE INDEX idx_payment_allocations_reference ON financial.payment_allocations(reference_type, reference_id);
CREATE INDEX idx_customer_outstanding_customer ON financial.customer_outstanding(customer_id);
CREATE INDEX idx_customer_outstanding_status ON financial.customer_outstanding(status);
CREATE INDEX idx_customer_outstanding_aging ON financial.customer_outstanding(aging_bucket);
CREATE INDEX idx_supplier_outstanding_supplier ON financial.supplier_outstanding(supplier_id);
CREATE INDEX idx_journal_entries_date ON financial.journal_entries(journal_date);
CREATE INDEX idx_journal_entries_reference ON financial.journal_entries(reference_type, reference_id);
CREATE INDEX idx_expense_claims_employee ON financial.expense_claims(employee_id);
CREATE INDEX idx_expense_claims_status ON financial.expense_claims(claim_status);
CREATE INDEX idx_pdc_cheque_date ON financial.pdc_management(cheque_date);
CREATE INDEX idx_pdc_status ON financial.pdc_management(pdc_status);

-- Add comments
COMMENT ON TABLE financial.payments IS 'Unified payment and receipt management';
COMMENT ON TABLE financial.customer_outstanding IS 'Customer receivables with aging analysis';
COMMENT ON TABLE financial.journal_entries IS 'Double-entry bookkeeping journal entries';
COMMENT ON TABLE financial.pdc_management IS 'Post-dated cheque tracking and management';
COMMENT ON TABLE financial.cash_flow_forecast IS 'Cash flow projections and actuals';