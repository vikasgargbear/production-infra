-- =============================================
-- MASTER DATA MANAGEMENT TABLES
-- =============================================
-- Schema: master
-- Tables: 12
-- Purpose: Core organizational and configuration data
-- =============================================

-- 1. Organizations (Multi-tenant root)
CREATE TABLE master.organizations (
    org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Information
    org_code TEXT NOT NULL UNIQUE,
    org_name TEXT NOT NULL,
    legal_name TEXT NOT NULL,
    
    -- Business Details
    business_type TEXT NOT NULL DEFAULT 'pharmaceutical_distributor',
    establishment_date DATE,
    
    -- Regulatory Information
    gst_number TEXT UNIQUE,
    pan_number TEXT,
    drug_license_number TEXT,
    drug_license_validity DATE,
    fssai_number TEXT,
    
    -- Contact Information
    registered_address JSONB NOT NULL,
    correspondence_address JSONB,
    contact_numbers JSONB,
    email_addresses JSONB,
    website TEXT,
    
    -- Business Configuration
    financial_year_start INTEGER DEFAULT 4, -- April
    currency_code TEXT DEFAULT 'INR',
    date_format TEXT DEFAULT 'DD/MM/YYYY',
    time_zone TEXT DEFAULT 'Asia/Kolkata',
    
    -- Subscription & Limits
    subscription_plan TEXT DEFAULT 'standard',
    subscription_status TEXT DEFAULT 'active',
    subscription_valid_until DATE,
    user_limit INTEGER DEFAULT 10,
    branch_limit INTEGER DEFAULT 1,
    
    -- Settings
    business_settings JSONB DEFAULT '{}',
    feature_flags JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    
    CONSTRAINT valid_gst CHECK (gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
    CONSTRAINT valid_pan CHECK (pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
);

-- 2. Organization Branches/Locations
CREATE TABLE master.org_branches (
    branch_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Branch Identification
    branch_code TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    branch_type TEXT NOT NULL DEFAULT 'warehouse', -- 'warehouse', 'office', 'retail', 'both'
    
    -- Location Details
    address JSONB NOT NULL,
    google_maps_link TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Contact Information
    branch_phone TEXT,
    branch_email TEXT,
    branch_manager_id INTEGER,
    
    -- Regulatory
    branch_gst_number TEXT,
    drug_license_number TEXT,
    drug_license_validity DATE,
    
    -- Operational Details
    is_billing_location BOOLEAN DEFAULT false,
    is_shipping_location BOOLEAN DEFAULT true,
    is_default_location BOOLEAN DEFAULT false,
    storage_capacity JSONB, -- {"area_sqft": 5000, "racks": 50, "cold_storage": true}
    
    -- Working Hours
    working_hours JSONB, -- {"monday": {"open": "09:00", "close": "18:00"}, ...}
    holidays JSONB DEFAULT '[]',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    operational_since DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, branch_code)
);

-- 3. Organization Users
CREATE TABLE master.org_users (
    user_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    auth_user_id UUID UNIQUE, -- Supabase auth.users reference
    
    -- User Identification
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    employee_code TEXT,
    
    -- Personal Information
    first_name TEXT NOT NULL,
    last_name TEXT,
    full_name TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN last_name IS NOT NULL THEN first_name || ' ' || last_name
            ELSE first_name
        END
    ) STORED,
    
    -- Role and Permissions
    role_id INTEGER,
    is_admin BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '{}',
    
    -- Assignment
    branch_ids INTEGER[] DEFAULT '{}',
    department_id INTEGER,
    reporting_to_id INTEGER REFERENCES master.org_users(user_id),
    
    -- Authentication
    last_login TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Preferences
    ui_preferences JSONB DEFAULT '{}',
    notification_preferences JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_online BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    
    UNIQUE(org_id, username),
    UNIQUE(org_id, email)
);

-- 4. Roles and Permissions
CREATE TABLE master.roles (
    role_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Role Definition
    role_code TEXT NOT NULL,
    role_name TEXT NOT NULL,
    role_description TEXT,
    
    -- Hierarchy
    parent_role_id INTEGER REFERENCES master.roles(role_id),
    role_level INTEGER NOT NULL DEFAULT 1,
    
    -- Permissions
    permissions JSONB NOT NULL DEFAULT '{}',
    -- Example: {"sales": {"view": true, "create": true, "edit": true, "delete": false}}
    
    -- Module Access
    allowed_modules TEXT[] DEFAULT '{}',
    restricted_features TEXT[] DEFAULT '{}',
    
    -- Data Access
    data_access_level TEXT DEFAULT 'own', -- 'own', 'branch', 'organization'
    
    -- Status
    is_system_role BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, role_code)
);

-- 5. Departments
CREATE TABLE master.departments (
    department_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Department Details
    department_code TEXT NOT NULL,
    department_name TEXT NOT NULL,
    department_type TEXT, -- 'sales', 'purchase', 'accounts', 'warehouse', 'admin'
    
    -- Hierarchy
    parent_department_id INTEGER REFERENCES master.departments(department_id),
    
    -- Management
    department_head_id INTEGER REFERENCES master.org_users(user_id),
    
    -- Configuration
    cost_center_code TEXT,
    budget_allocated NUMERIC(15,2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, department_code)
);

-- 6. Organization Bank Accounts
CREATE TABLE master.org_bank_accounts (
    bank_account_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    
    -- Account Details
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_type TEXT NOT NULL, -- 'current', 'savings', 'cash_credit', 'overdraft'
    
    -- Bank Information
    bank_name TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    swift_code TEXT,
    
    -- Contact Details
    bank_address JSONB,
    bank_contact_number TEXT,
    relationship_manager TEXT,
    
    -- Account Configuration
    currency_code TEXT DEFAULT 'INR',
    overdraft_limit NUMERIC(15,2),
    
    -- Integration
    is_default_account BOOLEAN DEFAULT false,
    is_payment_account BOOLEAN DEFAULT true,
    is_receipt_account BOOLEAN DEFAULT true,
    
    -- For reconciliation
    last_reconciled_date DATE,
    last_statement_date DATE,
    current_balance NUMERIC(15,2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    account_opened_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, account_number),
    CONSTRAINT valid_ifsc CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$')
);

-- 7. Addresses (Reusable address book)
CREATE TABLE master.addresses (
    address_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Address Ownership
    entity_type TEXT NOT NULL, -- 'organization', 'branch', 'customer', 'supplier', 'employee'
    entity_id INTEGER NOT NULL,
    address_type TEXT NOT NULL, -- 'billing', 'shipping', 'registered', 'correspondence'
    
    -- Address Details
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    landmark TEXT,
    city TEXT NOT NULL,
    state_code TEXT NOT NULL, -- GST state codes
    state_name TEXT NOT NULL,
    country TEXT DEFAULT 'India',
    pincode TEXT NOT NULL,
    
    -- Geo Location
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    google_plus_code TEXT,
    
    -- Contact at Address
    contact_person TEXT,
    contact_number TEXT,
    contact_email TEXT,
    
    -- Delivery Instructions
    delivery_instructions TEXT,
    
    -- Status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_pincode CHECK (pincode ~ '^[1-9][0-9]{5}$')
);

-- 8. Employees (For internal tracking)
CREATE TABLE master.employees (
    employee_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES master.org_users(user_id),
    
    -- Employee Information
    employee_code TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    full_name TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN last_name IS NOT NULL THEN first_name || ' ' || last_name
            ELSE first_name
        END
    ) STORED,
    
    -- Personal Details
    date_of_birth DATE,
    gender TEXT,
    marital_status TEXT,
    blood_group TEXT,
    
    -- Contact Information
    personal_email TEXT,
    personal_mobile TEXT NOT NULL,
    emergency_contact JSONB,
    permanent_address JSONB,
    current_address JSONB,
    
    -- Employment Details
    designation TEXT NOT NULL,
    department_id INTEGER REFERENCES master.departments(department_id),
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    joining_date DATE NOT NULL,
    probation_end_date DATE,
    confirmation_date DATE,
    
    -- Documents
    pan_number TEXT,
    aadhar_number TEXT,
    driving_license TEXT,
    passport_number TEXT,
    
    -- Bank Details (for salary)
    bank_account_details JSONB,
    
    -- Employment Status
    employment_status TEXT DEFAULT 'active', -- 'active', 'resigned', 'terminated', 'retired'
    resignation_date DATE,
    last_working_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, employee_code)
);

-- 9. Doctors (For prescription tracking)
CREATE TABLE master.doctors (
    doctor_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Doctor Information
    doctor_code TEXT NOT NULL,
    doctor_name TEXT NOT NULL,
    qualification TEXT,
    specialization TEXT,
    registration_number TEXT,
    
    -- Contact Information
    clinic_name TEXT,
    clinic_address JSONB,
    phone_numbers TEXT[],
    email TEXT,
    
    -- Professional Details
    years_of_practice INTEGER,
    associated_hospitals TEXT[],
    
    -- Business Relationship
    commission_rate NUMERIC(5,2),
    credit_limit NUMERIC(15,2),
    payment_terms_days INTEGER DEFAULT 30,
    
    -- Preferences
    preferred_brands TEXT[],
    prescription_pattern JSONB,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    blacklisted BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, doctor_code)
);

-- 10. Number Series Configuration
CREATE TABLE master.number_series (
    series_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    
    -- Series Definition
    document_type TEXT NOT NULL, -- 'order', 'invoice', 'purchase', 'payment', etc.
    series_code TEXT NOT NULL,
    series_description TEXT,
    
    -- Format Configuration
    prefix TEXT,
    suffix TEXT,
    separator TEXT DEFAULT '/',
    
    -- Numbering
    current_number INTEGER NOT NULL DEFAULT 0,
    start_number INTEGER NOT NULL DEFAULT 1,
    increment_by INTEGER NOT NULL DEFAULT 1,
    
    -- Reset Configuration
    reset_frequency TEXT, -- 'never', 'daily', 'monthly', 'yearly', 'financial_year'
    last_reset_date DATE,
    
    -- Format Example
    preview_format TEXT, -- 'INV/2024-25/00001'
    
    -- Status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, document_type, series_code)
);

-- 11. Currencies and Exchange Rates
CREATE TABLE master.currencies (
    currency_id SERIAL PRIMARY KEY,
    
    -- Currency Details
    currency_code TEXT NOT NULL UNIQUE, -- 'INR', 'USD', 'EUR'
    currency_name TEXT NOT NULL,
    currency_symbol TEXT NOT NULL,
    
    -- Decimal Configuration
    decimal_places INTEGER DEFAULT 2,
    decimal_separator TEXT DEFAULT '.',
    thousand_separator TEXT DEFAULT ',',
    
    -- Display Format
    symbol_position TEXT DEFAULT 'before', -- 'before', 'after'
    format_pattern TEXT, -- '₹ #,##,##0.00'
    
    -- Status
    is_base_currency BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Exchange Rates
CREATE TABLE master.exchange_rates (
    rate_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Currency Pair
    from_currency_code TEXT NOT NULL,
    to_currency_code TEXT NOT NULL,
    
    -- Rate Information
    exchange_rate NUMERIC(15,6) NOT NULL,
    inverse_rate NUMERIC(15,6),
    
    -- Validity
    effective_from DATE NOT NULL,
    effective_until DATE,
    
    -- Source
    rate_source TEXT, -- 'manual', 'rbi', 'market'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, from_currency_code, to_currency_code, effective_from)
);

-- Create indexes for performance
CREATE INDEX idx_organizations_active ON master.organizations(is_active);
CREATE INDEX idx_org_branches_org ON master.org_branches(org_id);
CREATE INDEX idx_org_users_org ON master.org_users(org_id);
CREATE INDEX idx_org_users_auth ON master.org_users(auth_user_id);
CREATE INDEX idx_addresses_entity ON master.addresses(entity_type, entity_id);
CREATE INDEX idx_employees_org ON master.employees(org_id);
CREATE INDEX idx_doctors_org ON master.doctors(org_id);

-- Add comments for documentation
COMMENT ON TABLE master.organizations IS 'Multi-tenant root - all data is scoped to an organization';
COMMENT ON TABLE master.org_branches IS 'Physical locations/branches of the organization';
COMMENT ON TABLE master.org_users IS 'Users with access to the system';
COMMENT ON TABLE master.addresses IS 'Reusable address book for all entities';