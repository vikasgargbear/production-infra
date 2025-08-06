-- Create tables for new APIs
-- These tables support the newly created APIs for master settings, schemes, loyalty, and enhanced compliance

-- =====================================================
-- MASTER SETTINGS TABLES
-- =====================================================

-- System settings table for master configuration
CREATE TABLE IF NOT EXISTS master.system_settings (
    setting_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    setting_category TEXT NOT NULL CHECK (setting_category IN ('billing', 'inventory', 'compliance', 'general')),
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type TEXT NOT NULL CHECK (setting_type IN ('boolean', 'string', 'number', 'json')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, setting_category, setting_key)
);

-- =====================================================
-- SCHEMES & DISCOUNTS TABLES
-- =====================================================

-- Promotional schemes master table
CREATE TABLE IF NOT EXISTS sales.promotional_schemes (
    scheme_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    scheme_code TEXT UNIQUE NOT NULL,
    scheme_name TEXT NOT NULL,
    scheme_type TEXT NOT NULL CHECK (scheme_type IN (
        'percentage_discount', 'flat_discount', 'buy_x_get_y', 
        'volume_based', 'product_combo', 'bill_value_discount'
    )),
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    -- Discount details
    discount_percentage NUMERIC(5,2),
    discount_amount NUMERIC(15,2),
    
    -- Buy X Get Y details
    buy_quantity INTEGER,
    get_quantity INTEGER,
    
    -- Bill value discount
    min_bill_value NUMERIC(15,2),
    max_discount_amount NUMERIC(15,2),
    
    -- Rules
    max_uses_per_customer INTEGER,
    can_combine BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 1,
    
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Volume slabs for volume-based schemes
CREATE TABLE IF NOT EXISTS sales.scheme_volume_slabs (
    slab_id SERIAL PRIMARY KEY,
    scheme_id INTEGER REFERENCES sales.promotional_schemes(scheme_id) ON DELETE CASCADE,
    min_quantity NUMERIC(15,3) NOT NULL,
    max_quantity NUMERIC(15,3),
    discount_percentage NUMERIC(5,2),
    discount_amount NUMERIC(15,2)
);

-- Products applicable for schemes
CREATE TABLE IF NOT EXISTS sales.scheme_products (
    scheme_id INTEGER REFERENCES sales.promotional_schemes(scheme_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES inventory.products(product_id),
    PRIMARY KEY (scheme_id, product_id)
);

-- Customers applicable for schemes
CREATE TABLE IF NOT EXISTS sales.scheme_customers (
    scheme_id INTEGER REFERENCES sales.promotional_schemes(scheme_id) ON DELETE CASCADE,
    customer_id INTEGER REFERENCES parties.customers(customer_id),
    PRIMARY KEY (scheme_id, customer_id)
);

-- Scheme usage tracking
CREATE TABLE IF NOT EXISTS sales.scheme_usage (
    usage_id SERIAL PRIMARY KEY,
    scheme_id INTEGER REFERENCES sales.promotional_schemes(scheme_id),
    invoice_id INTEGER REFERENCES sales.invoices(invoice_id),
    customer_id INTEGER REFERENCES parties.customers(customer_id),
    usage_date DATE NOT NULL,
    discount_given NUMERIC(15,2),
    free_items_data JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LOYALTY POINTS TABLES
-- =====================================================

-- Loyalty programs master
CREATE TABLE IF NOT EXISTS sales.loyalty_programs (
    program_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    program_name TEXT NOT NULL,
    description TEXT,
    points_per_rupee NUMERIC(5,2) DEFAULT 1.0,
    redemption_ratio NUMERIC(5,2) DEFAULT 0.25,
    min_purchase_amount NUMERIC(15,2),
    min_redemption_points INTEGER DEFAULT 100,
    max_redemption_percentage NUMERIC(5,2) DEFAULT 50,
    points_validity_days INTEGER,
    tier_based BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Loyalty tiers
CREATE TABLE IF NOT EXISTS sales.loyalty_tiers (
    tier_id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES sales.loyalty_programs(program_id) ON DELETE CASCADE,
    tier_name TEXT NOT NULL,
    min_points_required INTEGER NOT NULL,
    points_multiplier NUMERIC(5,2) DEFAULT 1.0,
    additional_benefits TEXT,
    UNIQUE(program_id, tier_name)
);

-- Loyalty points transactions
CREATE TABLE IF NOT EXISTS sales.loyalty_transactions (
    transaction_id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES sales.loyalty_programs(program_id),
    customer_id INTEGER REFERENCES parties.customers(customer_id),
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'expired', 'adjusted', 'bonus')),
    points INTEGER NOT NULL,
    reference_type TEXT CHECK (reference_type IN ('invoice', 'order', 'manual', 'campaign', 'expired')),
    reference_id INTEGER,
    remarks TEXT,
    expiry_date DATE,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add loyalty fields to invoices if not exists
ALTER TABLE sales.invoices 
ADD COLUMN IF NOT EXISTS loyalty_points_used INTEGER,
ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(15,2);

-- =====================================================
-- ENHANCED COMPLIANCE TABLES
-- =====================================================

-- Drug licenses (more detailed than org_licenses)
CREATE TABLE IF NOT EXISTS compliance.drug_licenses (
    license_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    license_type TEXT NOT NULL CHECK (license_type IN ('wholesale', 'retail', 'manufacturing', 'import', 'export')),
    license_number TEXT UNIQUE NOT NULL,
    license_category JSONB, -- ["20B", "21B", "20C", "21C"]
    issuing_authority TEXT NOT NULL,
    issue_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    premises_address TEXT NOT NULL,
    pharmacist_name TEXT NOT NULL,
    pharmacist_registration TEXT NOT NULL,
    pharmacist_qualification TEXT,
    storage_capacity JSONB, -- {"normal": 100, "cold": 20}
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Compliance audits
CREATE TABLE IF NOT EXISTS compliance.compliance_audits (
    audit_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    audit_type TEXT NOT NULL CHECK (audit_type IN ('internal', 'regulatory', 'third_party', 'surprise')),
    audit_date DATE NOT NULL,
    auditor_name TEXT NOT NULL,
    auditor_organization TEXT,
    areas_audited JSONB NOT NULL,
    audit_findings JSONB,
    overall_status TEXT NOT NULL CHECK (overall_status IN ('compliant', 'minor_issues', 'major_issues', 'non_compliant')),
    next_audit_date DATE,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Inspector visits
CREATE TABLE IF NOT EXISTS compliance.inspector_visits (
    visit_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    visit_date DATE NOT NULL,
    inspector_name TEXT NOT NULL,
    inspector_id TEXT,
    inspector_designation TEXT,
    visit_type TEXT NOT NULL CHECK (visit_type IN ('routine', 'surprise', 'follow_up', 'complaint_based')),
    areas_inspected JSONB,
    violations_found JSONB,
    recommendations JSONB,
    follow_up_required BOOLEAN DEFAULT false,
    next_visit_date DATE,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Corrective actions
CREATE TABLE IF NOT EXISTS compliance.corrective_actions (
    action_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    audit_id INTEGER REFERENCES compliance.compliance_audits(audit_id),
    visit_id INTEGER REFERENCES compliance.inspector_visits(visit_id),
    area TEXT NOT NULL,
    issue_description TEXT NOT NULL,
    corrective_action TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
    completed_date DATE,
    completed_by INTEGER,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Compliance alerts
CREATE TABLE IF NOT EXISTS compliance.compliance_alerts (
    alert_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('license_expiry', 'audit_due', 'document_expiry', 'corrective_action_due')),
    alert_date DATE NOT NULL,
    reference_type TEXT NOT NULL,
    reference_id INTEGER NOT NULL,
    alert_message TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    is_active BOOLEAN DEFAULT true,
    is_resolved BOOLEAN DEFAULT false,
    resolved_date DATE,
    resolved_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, reference_type, reference_id, alert_type)
);

-- Compliance documents
CREATE TABLE IF NOT EXISTS compliance.compliance_documents (
    document_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    document_type TEXT NOT NULL,
    document_name TEXT NOT NULL,
    file_data TEXT, -- Base64 encoded
    file_url TEXT,
    expiry_date DATE,
    reminder_days INTEGER DEFAULT 30,
    tags JSONB,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Pharmacist registrations
CREATE TABLE IF NOT EXISTS compliance.pharmacist_registrations (
    registration_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    pharmacist_name TEXT NOT NULL,
    registration_number TEXT UNIQUE NOT NULL,
    qualification TEXT NOT NULL,
    registration_state TEXT NOT NULL,
    registration_date DATE NOT NULL,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Temperature monitoring zones
CREATE TABLE IF NOT EXISTS compliance.temperature_zones (
    zone_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    zone_name TEXT NOT NULL,
    zone_type TEXT NOT NULL CHECK (zone_type IN ('cold_room', 'freezer', 'ambient', 'transport')),
    min_temperature NUMERIC(5,2),
    max_temperature NUMERIC(5,2),
    last_reading TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Expired product destructions
CREATE TABLE IF NOT EXISTS compliance.expired_destructions (
    destruction_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    product_id INTEGER REFERENCES inventory.products(product_id),
    batch_number TEXT NOT NULL,
    quantity_destroyed NUMERIC(15,3) NOT NULL,
    expiry_date DATE NOT NULL,
    destruction_date DATE NOT NULL,
    destruction_method TEXT NOT NULL,
    witness_names TEXT[] NOT NULL,
    destruction_certificate TEXT,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ENHANCED FINANCIAL TABLES
-- =====================================================

-- Bank reconciliations
CREATE TABLE IF NOT EXISTS financial.bank_reconciliations (
    reconciliation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    bank_account TEXT NOT NULL,
    statement_date DATE NOT NULL,
    opening_balance NUMERIC(15,2) NOT NULL,
    closing_balance NUMERIC(15,2) NOT NULL,
    reconciled_by INTEGER,
    reconciliation_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Unmatched transactions for reconciliation
CREATE TABLE IF NOT EXISTS financial.unmatched_transactions (
    transaction_id SERIAL PRIMARY KEY,
    reconciliation_id INTEGER REFERENCES financial.bank_reconciliations(reconciliation_id),
    transaction_date DATE NOT NULL,
    description TEXT,
    amount NUMERIC(15,2) NOT NULL,
    transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Payment allocations
CREATE TABLE IF NOT EXISTS financial.payment_allocations (
    allocation_id SERIAL PRIMARY KEY,
    payment_id INTEGER REFERENCES payments(payment_id),
    invoice_id INTEGER REFERENCES sales.invoices(invoice_id),
    allocated_amount NUMERIC(15,2) NOT NULL,
    allocation_date DATE NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add fields to payments table if not exists
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS allocated_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS unallocated_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS reconciliation_id INTEGER REFERENCES financial.bank_reconciliations(reconciliation_id);

-- =====================================================
-- ENHANCED DELIVERY TABLES
-- =====================================================

-- E-way bills
CREATE TABLE IF NOT EXISTS sales.eway_bills (
    eway_bill_id SERIAL PRIMARY KEY,
    challan_id INTEGER,
    eway_bill_number TEXT UNIQUE NOT NULL,
    supply_type TEXT NOT NULL,
    sub_type TEXT NOT NULL,
    document_type TEXT NOT NULL,
    document_number TEXT NOT NULL,
    document_date DATE NOT NULL,
    from_gstin TEXT,
    to_gstin TEXT,
    transport_mode TEXT NOT NULL,
    transport_distance INTEGER,
    transporter_name TEXT,
    transporter_id TEXT,
    vehicle_number TEXT,
    valid_until TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    generated_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Proof of delivery
CREATE TABLE IF NOT EXISTS sales.proof_of_delivery (
    pod_id SERIAL PRIMARY KEY,
    challan_id INTEGER NOT NULL,
    customer_id INTEGER REFERENCES parties.customers(customer_id),
    delivered_date DATE NOT NULL,
    delivered_time TIME,
    received_by_name TEXT NOT NULL,
    received_by_designation TEXT,
    received_by_phone TEXT,
    delivery_location TEXT,
    delivery_notes TEXT,
    signature_image TEXT, -- Base64
    delivery_photo TEXT, -- Base64
    gps_latitude NUMERIC(10,7),
    gps_longitude NUMERIC(10,7),
    delivery_rating INTEGER CHECK (delivery_rating BETWEEN 1 AND 5),
    created_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Delivery tracking
CREATE TABLE IF NOT EXISTS sales.delivery_tracking (
    tracking_id SERIAL PRIMARY KEY,
    challan_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    location TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    gps_latitude NUMERIC(10,7),
    gps_longitude NUMERIC(10,7),
    notes TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add fields to orders table if not exists
ALTER TABLE sales.orders
ADD COLUMN IF NOT EXISTS eway_bill_number TEXT,
ADD COLUMN IF NOT EXISTS pod_recorded BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_tracking_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_priority TEXT DEFAULT 'normal' CHECK (delivery_priority IN ('low', 'normal', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS delivery_area TEXT;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Master settings indexes
CREATE INDEX IF NOT EXISTS idx_system_settings_org_category ON master.system_settings(org_id, setting_category);

-- Schemes indexes
CREATE INDEX IF NOT EXISTS idx_promotional_schemes_dates ON sales.promotional_schemes(start_date, end_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scheme_usage_customer ON sales.scheme_usage(customer_id);
CREATE INDEX IF NOT EXISTS idx_scheme_usage_date ON sales.scheme_usage(usage_date);

-- Loyalty indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON sales.loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON sales.loyalty_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_expiry ON sales.loyalty_transactions(expiry_date) WHERE expiry_date IS NOT NULL;

-- Compliance indexes
CREATE INDEX IF NOT EXISTS idx_drug_licenses_expiry ON compliance.drug_licenses(expiry_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_active ON compliance.compliance_alerts(org_id, alert_date) WHERE is_active = true AND is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status ON compliance.corrective_actions(org_id, status) WHERE status != 'completed';

-- Delivery indexes
CREATE INDEX IF NOT EXISTS idx_eway_bills_challan ON sales.eway_bills(challan_id);
CREATE INDEX IF NOT EXISTS idx_pod_challan ON sales.proof_of_delivery(challan_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_challan ON sales.delivery_tracking(challan_id);

-- Financial indexes
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON financial.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON financial.payment_allocations(invoice_id);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default master settings for test org
INSERT INTO master.system_settings (org_id, setting_category, setting_key, setting_value, setting_type, description)
VALUES 
    ('ad808530-1ddb-4377-ab20-67bef145d80d', 'billing', 'allow_billing_without_customer', 'false', 'boolean', 'Allow creating invoices without customer selection'),
    ('ad808530-1ddb-4377-ab20-67bef145d80d', 'billing', 'default_cash_customer_name', 'Cash Customer', 'string', 'Default name for cash sales'),
    ('ad808530-1ddb-4377-ab20-67bef145d80d', 'inventory', 'allow_negative_stock', 'false', 'boolean', 'Allow negative stock levels'),
    ('ad808530-1ddb-4377-ab20-67bef145d80d', 'compliance', 'enforce_drug_license_check', 'true', 'boolean', 'Check drug license validity before operations')
ON CONFLICT (org_id, setting_category, setting_key) DO NOTHING;