-- =============================================
-- COMPLIANCE & REGULATORY TABLES
-- =============================================
-- Schema: compliance
-- Tables: 14
-- Purpose: License tracking, inspections, quality control
-- =============================================

-- 1. License Types
CREATE TABLE compliance.license_types (
    license_type_id SERIAL PRIMARY KEY,
    
    -- License type details
    license_code TEXT NOT NULL UNIQUE,
    license_name TEXT NOT NULL,
    license_category TEXT NOT NULL, -- 'drug', 'business', 'tax', 'environmental', 'fire_safety'
    
    -- Issuing authority
    issuing_authority TEXT NOT NULL,
    authority_level TEXT NOT NULL, -- 'central', 'state', 'local'
    
    -- Validity and renewal
    validity_years INTEGER,
    renewal_before_expiry_days INTEGER DEFAULT 90,
    
    -- Requirements
    eligibility_criteria JSONB DEFAULT '{}',
    required_documents JSONB DEFAULT '[]',
    
    -- Fees
    application_fee NUMERIC(15,2),
    renewal_fee NUMERIC(15,2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Organization Licenses
CREATE TABLE compliance.org_licenses (
    license_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    
    -- License details
    license_type_id INTEGER NOT NULL REFERENCES compliance.license_types(license_type_id),
    license_number TEXT NOT NULL,
    license_name TEXT NOT NULL,
    
    -- Validity
    issue_date DATE NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    
    -- Status tracking
    license_status TEXT DEFAULT 'active', -- 'active', 'expired', 'suspended', 'cancelled', 'under_renewal'
    expiry_status TEXT DEFAULT 'active', -- Will be calculated via trigger/function
    
    -- Renewal tracking
    renewal_status TEXT DEFAULT 'not_due', -- 'not_due', 'due', 'in_progress', 'renewed'
    renewal_application_date DATE,
    renewal_application_number TEXT,
    next_renewal_date DATE,
    
    -- Documents
    license_document_path TEXT,
    supporting_documents JSONB DEFAULT '[]',
    
    -- Compliance tracking
    last_inspection_date DATE,
    next_inspection_due DATE,
    compliance_score NUMERIC(5,2), -- 0-100
    
    -- Suspension/Cancellation
    suspended BOOLEAN DEFAULT FALSE,
    suspension_date DATE,
    suspension_reason TEXT,
    suspension_lifted_date DATE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, license_number)
);

-- 3. License Renewal History
CREATE TABLE compliance.license_renewal_history (
    renewal_id SERIAL PRIMARY KEY,
    license_id INTEGER NOT NULL REFERENCES compliance.org_licenses(license_id),
    
    -- Renewal details
    renewal_date DATE NOT NULL,
    old_expiry_date DATE NOT NULL,
    new_expiry_date DATE NOT NULL,
    
    -- Application details
    application_number TEXT,
    application_date DATE,
    
    -- Fee details
    renewal_fee_paid NUMERIC(15,2),
    late_fee_paid NUMERIC(15,2) DEFAULT 0,
    payment_reference TEXT,
    
    -- Processing
    processed_by TEXT,
    processing_time_days INTEGER,
    
    -- Documents
    renewal_documents JSONB DEFAULT '[]',
    
    -- Status
    renewal_status TEXT DEFAULT 'completed',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 4. Regulatory Authorities
CREATE TABLE compliance.regulatory_authorities (
    authority_id SERIAL PRIMARY KEY,
    
    -- Authority details
    authority_code TEXT NOT NULL UNIQUE,
    authority_name TEXT NOT NULL,
    authority_type TEXT NOT NULL, -- 'drug_control', 'pollution_control', 'fire_department', 'local_body'
    
    -- Jurisdiction
    jurisdiction_level TEXT NOT NULL, -- 'central', 'state', 'district', 'local'
    state TEXT,
    district TEXT,
    
    -- Contact information
    contact_info JSONB DEFAULT '{}',
    -- {
    --   "address": "...",
    --   "phone": "...",
    --   "email": "...",
    --   "website": "..."
    -- }
    
    -- Inspection frequency
    routine_inspection_frequency_days INTEGER,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Regulatory Inspections
CREATE TABLE compliance.regulatory_inspections (
    inspection_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    
    -- Inspection details
    inspection_date DATE NOT NULL,
    inspection_type TEXT NOT NULL, -- 'routine', 'surprise', 'follow_up', 'complaint_based'
    authority_id INTEGER NOT NULL REFERENCES compliance.regulatory_authorities(authority_id),
    
    -- License reference
    license_id INTEGER REFERENCES compliance.org_licenses(license_id),
    
    -- Inspectors
    inspectors JSONB DEFAULT '[]',
    -- [{"name": "...", "designation": "...", "id_number": "..."}]
    
    -- Inspection scope
    inspection_scope TEXT NOT NULL,
    areas_inspected TEXT[],
    
    -- Findings
    total_observations INTEGER DEFAULT 0,
    critical_observations INTEGER DEFAULT 0,
    major_observations INTEGER DEFAULT 0,
    minor_observations INTEGER DEFAULT 0,
    
    -- Detailed findings
    inspection_findings JSONB DEFAULT '[]',
    -- [
    --   {
    --     "area": "Storage",
    --     "observation": "Temperature not maintained",
    --     "severity": "critical",
    --     "corrective_action": "Install AC units",
    --     "timeline": "7 days"
    --   }
    -- ]
    
    -- Overall result
    overall_result TEXT, -- 'satisfactory', 'conditional', 'unsatisfactory'
    
    -- Follow-up
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    follow_up_completed BOOLEAN DEFAULT FALSE,
    
    -- Report
    inspection_report_date DATE,
    inspection_report_path TEXT,
    
    -- Status
    inspection_status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 6. Corrective Action Plans
CREATE TABLE compliance.corrective_action_plans (
    cap_id SERIAL PRIMARY KEY,
    inspection_id INTEGER NOT NULL REFERENCES compliance.regulatory_inspections(inspection_id),
    
    -- CAP details
    cap_number TEXT NOT NULL,
    submission_date DATE NOT NULL,
    
    -- Observations addressed
    total_observations INTEGER NOT NULL,
    critical_observations INTEGER DEFAULT 0,
    major_observations INTEGER DEFAULT 0,
    minor_observations INTEGER DEFAULT 0,
    
    -- Action items
    action_items JSONB DEFAULT '[]',
    -- [
    --   {
    --     "observation_ref": "OBS-001",
    --     "corrective_action": "...",
    --     "preventive_action": "...",
    --     "responsible_person": "...",
    --     "target_date": "2024-01-15",
    --     "status": "in_progress",
    --     "completion_date": null,
    --     "evidence": []
    --   }
    -- ]
    
    -- Overall status
    cap_status TEXT DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'in_progress', 'completed'
    completion_percentage NUMERIC(5,2) DEFAULT 0,
    
    -- Approval
    approved_by TEXT,
    approved_date DATE,
    
    -- Verification
    verified_by TEXT,
    verified_date DATE,
    verification_notes TEXT,
    
    -- Due date
    due_date DATE NOT NULL,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(cap_number)
);

-- 7. Quality Control Tests
CREATE TABLE compliance.quality_control_tests (
    qc_test_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Test identification
    test_number TEXT NOT NULL,
    test_date DATE NOT NULL,
    test_type TEXT NOT NULL, -- 'incoming', 'in_process', 'finished_goods', 'stability'
    
    -- Reference
    reference_type TEXT NOT NULL, -- 'grn', 'batch', 'complaint'
    reference_id INTEGER NOT NULL,
    
    -- Product and batch
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    batch_number TEXT,
    
    -- Sample details
    sample_quantity NUMERIC(15,3),
    sample_unit TEXT,
    sampling_method TEXT,
    sampled_by INTEGER REFERENCES master.org_users(user_id),
    
    -- Test parameters
    test_parameters JSONB DEFAULT '[]',
    -- [
    --   {
    --     "parameter": "Assay",
    --     "specification": "98-102%",
    --     "method": "HPLC",
    --     "result": "99.5%",
    --     "status": "pass"
    --   }
    -- ]
    
    -- Overall result
    test_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'passed', 'failed', 'conditional'
    
    -- Testing details
    tested_by TEXT,
    testing_lab TEXT DEFAULT 'in_house', -- 'in_house', 'external'
    external_lab_name TEXT,
    
    -- Completion
    completed_date DATE,
    test_report_number TEXT,
    test_report_path TEXT,
    
    -- Retest
    is_retest BOOLEAN DEFAULT FALSE,
    original_test_id INTEGER REFERENCES compliance.quality_control_tests(qc_test_id),
    retest_reason TEXT,
    
    -- Approval
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date DATE,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, test_number)
);

-- 8. Quality Deviations
CREATE TABLE compliance.quality_deviations (
    deviation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Deviation identification
    deviation_number TEXT NOT NULL,
    deviation_date DATE NOT NULL,
    deviation_type TEXT NOT NULL, -- 'planned', 'unplanned'
    
    -- Category
    deviation_category TEXT NOT NULL, -- 'process', 'equipment', 'material', 'method', 'environmental'
    severity TEXT NOT NULL, -- 'critical', 'major', 'minor'
    
    -- Description
    deviation_description TEXT NOT NULL,
    root_cause TEXT,
    
    -- Impact assessment
    impact_assessment TEXT,
    batches_affected TEXT[],
    products_affected INTEGER[],
    
    -- Reference
    reference_type TEXT,
    reference_id INTEGER,
    
    -- Investigation
    investigation_required BOOLEAN DEFAULT TRUE,
    investigation_status TEXT DEFAULT 'pending',
    investigation_completed_date DATE,
    investigation_findings TEXT,
    
    -- CAPA
    capa_required BOOLEAN DEFAULT TRUE,
    capa_number TEXT,
    capa_status TEXT,
    
    -- Approval
    reported_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    qa_reviewed_by INTEGER REFERENCES master.org_users(user_id),
    qa_reviewed_date DATE,
    
    -- Closure
    deviation_status TEXT DEFAULT 'open', -- 'open', 'under_investigation', 'capa_in_progress', 'closed'
    closed_date DATE,
    closed_by INTEGER REFERENCES master.org_users(user_id),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, deviation_number)
);

-- 9. Narcotic Register
CREATE TABLE compliance.narcotic_register (
    register_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Transaction details
    transaction_date DATE NOT NULL,
    transaction_type TEXT NOT NULL, -- 'receipt', 'issue', 'balance', 'destruction'
    
    -- Product and batch
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    batch_number TEXT,
    
    -- Quantities (in base units)
    receipt_quantity NUMERIC(15,3) DEFAULT 0,
    issue_quantity NUMERIC(15,3) DEFAULT 0,
    balance_quantity NUMERIC(15,3) NOT NULL,
    
    -- Party details
    party_type TEXT, -- 'supplier', 'customer', 'patient'
    party_name TEXT,
    party_license_number TEXT,
    
    -- Prescription details (for patient issue)
    prescription_number TEXT,
    prescriber_name TEXT,
    prescriber_registration TEXT,
    patient_name TEXT,
    patient_id_proof TEXT,
    
    -- Authorization
    permit_number TEXT,
    permit_date DATE,
    
    -- Verification
    verified_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    witness_by INTEGER REFERENCES master.org_users(user_id),
    
    -- Reference
    reference_type TEXT,
    reference_number TEXT,
    
    -- Remarks
    remarks TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
    
    -- Chronological order will be enforced via trigger
);

-- 10. Narcotic Discrepancies
CREATE TABLE compliance.narcotic_discrepancies (
    discrepancy_id SERIAL PRIMARY KEY,
    register_id INTEGER NOT NULL REFERENCES compliance.narcotic_register(register_id),
    
    -- Discrepancy details
    identified_date DATE NOT NULL,
    expected_balance NUMERIC(15,3) NOT NULL,
    actual_balance NUMERIC(15,3) NOT NULL,
    discrepancy_quantity NUMERIC(15,3) NOT NULL,
    discrepancy_type TEXT NOT NULL, -- 'shortage', 'excess'
    
    -- Investigation
    investigation_status TEXT DEFAULT 'pending',
    investigation_findings TEXT,
    root_cause TEXT,
    
    -- Reporting
    reported_to_authority BOOLEAN DEFAULT FALSE,
    authority_report_date DATE,
    authority_report_number TEXT,
    
    -- Resolution
    resolution_status TEXT DEFAULT 'open', -- 'open', 'under_investigation', 'resolved', 'reported'
    resolution_date DATE,
    resolution_notes TEXT,
    
    -- Audit
    reported_date DATE NOT NULL,
    reported_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Environmental Compliance
CREATE TABLE compliance.environmental_compliance (
    env_compliance_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    
    -- Monitoring details
    monitoring_date DATE NOT NULL,
    compliance_type TEXT NOT NULL, -- 'air_emission', 'water_discharge', 'hazardous_waste', 'noise_level'
    
    -- Parameter monitored
    parameter_name TEXT NOT NULL,
    parameter_unit TEXT NOT NULL,
    
    -- Values
    measured_value NUMERIC(15,4) NOT NULL,
    prescribed_limit NUMERIC(15,4) NOT NULL,
    within_limits BOOLEAN GENERATED ALWAYS AS (measured_value <= prescribed_limit) STORED,
    deviation_percentage NUMERIC(10,2) GENERATED ALWAYS AS (
        CASE 
            WHEN prescribed_limit > 0 THEN ((measured_value - prescribed_limit) / prescribed_limit * 100)
            ELSE 0
        END
    ) STORED,
    
    -- Testing details
    sampling_point TEXT,
    testing_method TEXT,
    tested_by TEXT,
    external_lab BOOLEAN DEFAULT FALSE,
    lab_name TEXT,
    
    -- Compliance status
    compliance_status TEXT GENERATED ALWAYS AS (
        CASE
            WHEN measured_value <= prescribed_limit THEN 'compliant'
            WHEN measured_value <= prescribed_limit * 1.1 THEN 'marginal'
            ELSE 'non_compliant'
        END
    ) STORED,
    
    -- Corrective action
    corrective_action_required BOOLEAN DEFAULT FALSE,
    corrective_action_taken TEXT,
    action_completion_date DATE,
    
    -- Reporting
    reported_to_authority BOOLEAN DEFAULT FALSE,
    report_date DATE,
    report_reference TEXT,
    
    -- Documents
    test_report_path TEXT,
    
    -- Status
    status TEXT DEFAULT 'active',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 12. Environmental Breaches
CREATE TABLE compliance.environmental_breaches (
    breach_id SERIAL PRIMARY KEY,
    env_compliance_id INTEGER NOT NULL REFERENCES compliance.environmental_compliance(env_compliance_id),
    
    -- Breach details
    breach_date DATE NOT NULL,
    parameter_name TEXT NOT NULL,
    measured_value NUMERIC(15,4) NOT NULL,
    prescribed_limit NUMERIC(15,4) NOT NULL,
    deviation_percentage NUMERIC(10,2) NOT NULL,
    breach_level TEXT NOT NULL, -- 'minor', 'moderate', 'major', 'critical'
    
    -- Notification
    authority_notified BOOLEAN DEFAULT FALSE,
    notification_date DATE,
    notification_reference TEXT,
    
    -- Fine/Penalty
    penalty_imposed BOOLEAN DEFAULT FALSE,
    penalty_amount NUMERIC(15,2),
    penalty_paid BOOLEAN DEFAULT FALSE,
    penalty_payment_date DATE,
    
    -- Corrective measures
    corrective_measures TEXT,
    implementation_timeline TEXT,
    measures_completed BOOLEAN DEFAULT FALSE,
    completion_verified_date DATE,
    
    -- Status
    breach_status TEXT DEFAULT 'open', -- 'open', 'notified', 'under_correction', 'resolved'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reported_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 13. Compliance Violations
CREATE TABLE compliance.compliance_violations (
    violation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Violation details
    violation_date DATE NOT NULL,
    violation_type TEXT NOT NULL, -- 'license', 'regulatory', 'quality', 'environmental'
    violation_category TEXT NOT NULL,
    severity TEXT NOT NULL, -- 'minor', 'major', 'critical'
    
    -- Description
    violation_description TEXT NOT NULL,
    
    -- Reference
    reference_type TEXT,
    reference_id INTEGER,
    
    -- Authority action
    notice_received BOOLEAN DEFAULT FALSE,
    notice_date DATE,
    notice_number TEXT,
    
    -- Response
    response_required BOOLEAN DEFAULT TRUE,
    response_due_date DATE,
    response_submitted BOOLEAN DEFAULT FALSE,
    response_date DATE,
    
    -- Penalty
    penalty_imposed BOOLEAN DEFAULT FALSE,
    penalty_type TEXT, -- 'monetary', 'suspension', 'cancellation'
    penalty_amount NUMERIC(15,2),
    penalty_duration_days INTEGER,
    
    -- Corrective action
    corrective_action_plan TEXT,
    cap_submitted_date DATE,
    cap_approved BOOLEAN DEFAULT FALSE,
    
    -- Status
    violation_status TEXT DEFAULT 'open', -- 'open', 'responded', 'under_review', 'resolved', 'escalated'
    resolved_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 14. Compliance Status Summary
CREATE TABLE compliance.org_compliance_status (
    status_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Overall compliance metrics
    overall_compliance_score NUMERIC(5,2) DEFAULT 100, -- 0-100
    compliance_grade TEXT DEFAULT 'A', -- 'A+', 'A', 'B', 'C', 'D', 'F'
    risk_level TEXT DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
    
    -- License compliance
    total_licenses INTEGER DEFAULT 0,
    active_licenses INTEGER DEFAULT 0,
    expired_licenses INTEGER DEFAULT 0,
    expiring_soon INTEGER DEFAULT 0,
    
    -- Inspection compliance
    last_inspection_date DATE,
    inspections_this_year INTEGER DEFAULT 0,
    critical_observations_pending INTEGER DEFAULT 0,
    
    -- Quality compliance
    qc_tests_this_month INTEGER DEFAULT 0,
    qc_failure_rate NUMERIC(5,2) DEFAULT 0,
    open_deviations INTEGER DEFAULT 0,
    
    -- Environmental compliance
    environmental_breaches_ytd INTEGER DEFAULT 0,
    pending_corrective_actions INTEGER DEFAULT 0,
    
    -- Violations
    open_violations INTEGER DEFAULT 0,
    violations_this_year INTEGER DEFAULT 0,
    
    -- Last updated
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id)
);

-- Create indexes for performance
CREATE INDEX idx_org_licenses_expiry ON compliance.org_licenses(valid_until);
CREATE INDEX idx_org_licenses_status ON compliance.org_licenses(license_status);
CREATE INDEX idx_inspections_date ON compliance.regulatory_inspections(inspection_date);
CREATE INDEX idx_inspections_authority ON compliance.regulatory_inspections(authority_id);
CREATE INDEX idx_qc_tests_date ON compliance.quality_control_tests(test_date);
CREATE INDEX idx_qc_tests_product ON compliance.quality_control_tests(product_id);
CREATE INDEX idx_qc_tests_batch ON compliance.quality_control_tests(batch_id);
CREATE INDEX idx_narcotic_register_product ON compliance.narcotic_register(product_id, batch_id);
CREATE INDEX idx_narcotic_register_date ON compliance.narcotic_register(transaction_date);
CREATE INDEX idx_environmental_compliance_date ON compliance.environmental_compliance(monitoring_date);
CREATE INDEX idx_violations_date ON compliance.compliance_violations(violation_date);
CREATE INDEX idx_violations_status ON compliance.compliance_violations(violation_status);

-- 15. Temperature Logs (Cold Chain Monitoring)
CREATE TABLE compliance.temperature_logs (
    log_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Location and device
    location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    device_id TEXT NOT NULL,
    device_type TEXT NOT NULL, -- 'sensor', 'data_logger', 'manual'
    
    -- Temperature data
    temperature NUMERIC(5,2) NOT NULL,
    humidity NUMERIC(5,2),
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Compliance
    within_range BOOLEAN NOT NULL,
    min_allowed NUMERIC(5,2) NOT NULL,
    max_allowed NUMERIC(5,2) NOT NULL,
    
    -- Excursion details
    is_excursion BOOLEAN DEFAULT FALSE,
    excursion_duration_minutes INTEGER,
    excursion_severity TEXT, -- 'minor', 'major', 'critical'
    
    -- Action taken
    action_required BOOLEAN DEFAULT FALSE,
    action_taken TEXT,
    action_by INTEGER REFERENCES master.org_users(user_id),
    action_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Products affected
    affected_products INTEGER[], -- Array of product_ids
    affected_batches INTEGER[], -- Array of batch_ids
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT chk_temperature_range CHECK (temperature BETWEEN -50 AND 100)
);

-- 16. Product Recalls
CREATE TABLE compliance.product_recalls (
    recall_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Recall identification
    recall_number TEXT NOT NULL UNIQUE,
    recall_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recall_type TEXT NOT NULL, -- 'voluntary', 'mandatory', 'market_withdrawal'
    recall_classification TEXT NOT NULL, -- 'class_i', 'class_ii', 'class_iii'
    
    -- Product and batch information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    affected_batches INTEGER[], -- Array of batch_ids
    batch_numbers TEXT[], -- For documentation
    
    -- Recall reason
    reason_category TEXT NOT NULL, -- 'contamination', 'labeling', 'potency', 'quality', 'safety'
    reason_description TEXT NOT NULL,
    health_hazard_assessment TEXT,
    
    -- Scope
    distribution_pattern TEXT NOT NULL, -- 'nationwide', 'regional', 'international'
    states_affected TEXT[],
    countries_affected TEXT[],
    quantity_distributed NUMERIC(15,3),
    quantity_recovered NUMERIC(15,3),
    
    -- Customer notification
    customers_notified INTEGER DEFAULT 0,
    notification_method TEXT[], -- 'email', 'phone', 'letter', 'media'
    notification_date DATE,
    
    -- Regulatory
    fda_notified BOOLEAN DEFAULT FALSE,
    fda_notification_date DATE,
    regulatory_references TEXT[],
    
    -- Status tracking
    recall_status TEXT DEFAULT 'initiated', -- 'initiated', 'ongoing', 'completed', 'terminated'
    effectiveness_checks_required INTEGER DEFAULT 2,
    effectiveness_checks_completed INTEGER DEFAULT 0,
    
    -- Financial impact
    estimated_cost NUMERIC(15,2),
    actual_cost NUMERIC(15,2),
    insurance_claim_filed BOOLEAN DEFAULT FALSE,
    
    -- Completion
    completion_date DATE,
    final_report_submitted BOOLEAN DEFAULT FALSE,
    lessons_learned TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    CONSTRAINT chk_recall_recovery CHECK (quantity_recovered <= quantity_distributed)
);

-- Create additional indexes for new tables
CREATE INDEX idx_temp_logs_location_time ON compliance.temperature_logs(location_id, recorded_at);
CREATE INDEX idx_temp_logs_excursions ON compliance.temperature_logs(is_excursion, recorded_at) WHERE is_excursion = TRUE;
CREATE INDEX idx_temp_logs_device ON compliance.temperature_logs(device_id, recorded_at);
CREATE INDEX idx_recalls_status ON compliance.product_recalls(recall_status, recall_date);
CREATE INDEX idx_recalls_product ON compliance.product_recalls(product_id);
CREATE INDEX idx_recalls_classification ON compliance.product_recalls(recall_classification);
-- CREATE INDEX idx_inspection_findings_severity ON compliance.inspection_findings(inspection_id, severity); -- Table doesn't exist
-- CREATE INDEX idx_temperature_logs_location ON compliance.temperature_logs(location_id, recorded_at); -- Duplicate, removed
-- CREATE INDEX idx_audit_trail_table ON compliance.gxp_audit_trail(schema_name, table_name, timestamp); -- Table doesn't exist
-- CREATE INDEX idx_recalls_status ON compliance.product_recalls(recall_status, recall_classification); -- Duplicate, removed

-- Add comments
COMMENT ON TABLE compliance.org_licenses IS 'Organization licenses with expiry tracking and renewal management';
COMMENT ON TABLE compliance.regulatory_inspections IS 'Regulatory inspection records with findings and follow-up';
COMMENT ON TABLE compliance.quality_control_tests IS 'QC test records for batches and materials';
COMMENT ON TABLE compliance.narcotic_register IS 'Narcotic drugs register with strict balance tracking';
COMMENT ON TABLE compliance.environmental_compliance IS 'Environmental parameter monitoring and compliance';
COMMENT ON TABLE compliance.temperature_logs IS 'Temperature monitoring for cold chain compliance';
COMMENT ON TABLE compliance.product_recalls IS 'Product recall management with FDA compliance';