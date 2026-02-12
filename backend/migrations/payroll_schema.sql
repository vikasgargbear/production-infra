-- ============================================================================
-- PAYROLL MODULE - Database Schema
-- Creates payroll schema with 7 tables for Indian pharma SME payroll
-- ============================================================================

-- Create schema
CREATE SCHEMA IF NOT EXISTS payroll;

-- ============================================================================
-- 1. SALARY STRUCTURES - CTC breakdown per employee
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.salary_structures (
    salary_structure_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES master.employees(employee_id),

    -- CTC Components (monthly amounts)
    basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra NUMERIC(12,2) NOT NULL DEFAULT 0,
    dearness_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    conveyance_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Statutory deduction rates
    pf_applicable BOOLEAN NOT NULL DEFAULT true,
    pf_percent NUMERIC(5,2) NOT NULL DEFAULT 12.00,  -- Employee PF %
    esi_applicable BOOLEAN NOT NULL DEFAULT false,
    professional_tax_applicable BOOLEAN NOT NULL DEFAULT true,

    -- Computed fields
    gross_salary NUMERIC(12,2) GENERATED ALWAYS AS (
        basic_salary + hra + dearness_allowance + conveyance_allowance +
        medical_allowance + special_allowance + other_allowance
    ) STORED,

    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by INTEGER,

    UNIQUE(org_id, employee_id, effective_from)
);

-- ============================================================================
-- 2. LEAVE POLICIES - Org-level leave types & annual quotas
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.leave_policies (
    leave_policy_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,

    leave_type VARCHAR(20) NOT NULL,  -- CL, SL, EL, LOP
    leave_name VARCHAR(100) NOT NULL, -- Casual Leave, Sick Leave, etc.
    annual_quota INTEGER NOT NULL DEFAULT 0,
    carry_forward BOOLEAN NOT NULL DEFAULT false,
    max_carry_forward INTEGER DEFAULT 0,

    -- Rules
    max_consecutive_days INTEGER DEFAULT 3,
    requires_document BOOLEAN NOT NULL DEFAULT false, -- e.g., medical certificate for SL > 2 days
    applicable_after_days INTEGER DEFAULT 0, -- probation period in days

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, leave_type)
);

-- ============================================================================
-- 3. LEAVE BALANCES - Per employee per financial year
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.leave_balances (
    leave_balance_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES master.employees(employee_id),
    leave_policy_id INTEGER NOT NULL REFERENCES payroll.leave_policies(leave_policy_id),

    financial_year VARCHAR(9) NOT NULL, -- e.g., '2025-2026'
    opening_balance NUMERIC(5,1) NOT NULL DEFAULT 0,
    used NUMERIC(5,1) NOT NULL DEFAULT 0,
    carry_forwarded NUMERIC(5,1) NOT NULL DEFAULT 0,

    -- Computed: available = opening_balance + carry_forwarded - used

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, employee_id, leave_policy_id, financial_year)
);

-- ============================================================================
-- 4. LEAVE APPLICATIONS - Apply/approve/reject workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.leave_applications (
    leave_application_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES master.employees(employee_id),
    leave_policy_id INTEGER NOT NULL REFERENCES payroll.leave_policies(leave_policy_id),

    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    number_of_days NUMERIC(5,1) NOT NULL,
    half_day BOOLEAN NOT NULL DEFAULT false,
    reason TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
    approved_by INTEGER REFERENCES master.employees(employee_id),
    approval_remarks TEXT,
    approved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ATTENDANCE - Daily records
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.attendance (
    attendance_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES master.employees(employee_id),

    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present', -- present, absent, half_day, leave, holiday, week_off

    remarks TEXT,
    leave_application_id INTEGER REFERENCES payroll.leave_applications(leave_application_id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    marked_by INTEGER,

    UNIQUE(org_id, employee_id, attendance_date)
);

-- ============================================================================
-- 6. PAYROLL RUNS - Monthly payroll processing documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.payroll_runs (
    payroll_run_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,

    run_number VARCHAR(30) NOT NULL,     -- PRN-YYYYMMDDNNNN
    payroll_month INTEGER NOT NULL,      -- 1-12
    payroll_year INTEGER NOT NULL,

    -- Summary
    total_employees INTEGER NOT NULL DEFAULT 0,
    total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_net_pay NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_employer_pf NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_employer_esi NUMERIC(14,2) NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, calculated, confirmed, paid

    processed_at TIMESTAMPTZ,
    processed_by INTEGER,
    confirmed_at TIMESTAMPTZ,
    confirmed_by INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, payroll_month, payroll_year)
);

-- ============================================================================
-- 7. PAYROLL SLIPS - Per-employee payslips with full earnings/deductions
-- ============================================================================
CREATE TABLE IF NOT EXISTS payroll.payroll_slips (
    payroll_slip_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    payroll_run_id INTEGER NOT NULL REFERENCES payroll.payroll_runs(payroll_run_id),
    employee_id INTEGER NOT NULL REFERENCES master.employees(employee_id),

    slip_number VARCHAR(30) NOT NULL,    -- SLP-YYYYMMDDNNNN

    -- Attendance for the month
    working_days INTEGER NOT NULL DEFAULT 0,
    days_present NUMERIC(5,1) NOT NULL DEFAULT 0,
    days_absent NUMERIC(5,1) NOT NULL DEFAULT 0,
    days_leave NUMERIC(5,1) NOT NULL DEFAULT 0,
    days_holiday NUMERIC(5,1) NOT NULL DEFAULT 0,
    lop_days NUMERIC(5,1) NOT NULL DEFAULT 0,

    -- Earnings (prorated by attendance)
    basic_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    hra_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    da_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    conveyance_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    medical_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    special_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    gross_earned NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Deductions
    pf_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
    pf_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
    esi_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
    esi_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
    professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    tds NUMERIC(12,2) NOT NULL DEFAULT 0,
    lop_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Net
    net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Bank details snapshot (for payment reference)
    bank_name VARCHAR(100),
    account_number VARCHAR(30),
    ifsc_code VARCHAR(15),

    status VARCHAR(20) NOT NULL DEFAULT 'generated', -- generated, sent, paid

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(org_id, payroll_run_id, employee_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_salary_structures_org ON payroll.salary_structures(org_id);
CREATE INDEX IF NOT EXISTS idx_salary_structures_employee ON payroll.salary_structures(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_org ON payroll.leave_policies(org_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_org ON payroll.leave_balances(org_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON payroll.leave_balances(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_org ON payroll.leave_applications(org_id);
CREATE INDEX IF NOT EXISTS idx_leave_applications_employee ON payroll.leave_applications(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_org ON payroll.attendance(org_id);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON payroll.attendance(org_id, employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_month ON payroll.attendance(org_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll.payroll_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll.payroll_runs(org_id, payroll_year, payroll_month);
CREATE INDEX IF NOT EXISTS idx_payroll_slips_org ON payroll.payroll_slips(org_id);
CREATE INDEX IF NOT EXISTS idx_payroll_slips_run ON payroll.payroll_slips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_slips_employee ON payroll.payroll_slips(org_id, employee_id);

-- ============================================================================
-- RLS POLICIES (defense-in-depth, application layer also filters)
-- ============================================================================
ALTER TABLE payroll.salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.leave_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.payroll_slips ENABLE ROW LEVEL SECURITY;

-- RLS policies: filter by org_id from session variable
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'salary_structures', 'leave_policies', 'leave_balances',
        'leave_applications', 'attendance', 'payroll_runs', 'payroll_slips'
    ])
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON payroll.%I',
            'rls_' || tbl || '_org', tbl
        );
        EXECUTE format(
            'CREATE POLICY %I ON payroll.%I FOR ALL USING (org_id = COALESCE(current_setting(''app.org_id'', true)::uuid, org_id))',
            'rls_' || tbl || '_org', tbl
        );
    END LOOP;
END $$;

-- ============================================================================
-- SEED DEFAULT LEAVE POLICIES (will be inserted per org on first setup)
-- ============================================================================
-- These are just reference values - actual seeding done via API
-- CL: 12/year, SL: 12/year, EL: 15/year (with carry forward), LOP: unlimited
