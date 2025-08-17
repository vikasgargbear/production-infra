# Compliance Schema Documentation

## Overview
The `compliance` schema manages pharmaceutical regulatory compliance including drug licenses, narcotic tracking, inspections, and environmental compliance. This is critical for operating legally in the pharmaceutical industry.

---

## Tables

### 1. license_types

### license_types
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_license_types()`, `api.create_license_type()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `license_type_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `license_code` | TEXT | ✓ | Description needed | Standard field usage |
| `license_name` | TEXT | ✓ | Description needed | Standard field usage |
| `license_category` | TEXT | ✓ | Description needed | Standard field usage |
| `issuing_authority` | TEXT | ✓ | Description needed | Standard field usage |
| `authority_level` | TEXT | ✓ | Description needed | Standard field usage |
| `validity_years` | INTEGER | - | Description needed | Standard field usage |
| `renewal_before_expiry_days` | INTEGER | - | Description needed | Standard field usage |
| `eligibility_criteria` | JSONB | - | Description needed | Standard field usage |
| `required_documents` | JSONB | - | Description needed | Standard field usage |
| `application_fee` | NUMERIC(15 | - | Description needed | Standard field usage |
| `renewal_fee` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

---

### 2. org_licenses

### org_licenses
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_org_licenses()`, `api.create_org_license()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `license_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `license_type_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `license_number` | TEXT | ✓ | Description needed | Standard field usage |
| `license_name` | TEXT | ✓ | Description needed | Standard field usage |
| `issue_date` | DATE | ✓ | Description needed | Standard field usage |
| `valid_from` | DATE | ✓ | Description needed | Standard field usage |
| `valid_until` | DATE | ✓ | Description needed | Standard field usage |
| `license_status` | TEXT | - | Description needed | Standard field usage |
| `expiry_status` | TEXT | - | Description needed | Standard field usage |
| `renewal_status` | TEXT | - | Description needed | Standard field usage |
| `renewal_application_date` | DATE | - | Description needed | Standard field usage |
| `renewal_application_number` | TEXT | - | Description needed | Standard field usage |
| `next_renewal_date` | DATE | - | Description needed | Standard field usage |
| `license_document_path` | TEXT | - | Description needed | Standard field usage |
| `supporting_documents` | JSONB | - | Description needed | Standard field usage |
| `last_inspection_date` | DATE | - | Description needed | Standard field usage |
| `next_inspection_due` | DATE | - | Description needed | Standard field usage |
| `compliance_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `suspended` | BOOLEAN | - | Description needed | Standard field usage |
| `suspension_date` | DATE | - | Description needed | Standard field usage |
| `suspension_reason` | TEXT | - | Description needed | Standard field usage |
| `suspension_lifted_date` | DATE | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `license_type_id` → `compliance.license_types.license_type_id`
- `created_by` → `master.org_users.user_id`

---

### 3. license_renewal_history

### license_renewal_history
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_license_renewal_history()`, `api.create_license_renewal_history()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `renewal_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `license_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `renewal_date` | DATE | ✓ | Description needed | Standard field usage |
| `old_expiry_date` | DATE | ✓ | Description needed | Standard field usage |
| `new_expiry_date` | DATE | ✓ | Description needed | Standard field usage |
| `application_number` | TEXT | - | Description needed | Standard field usage |
| `application_date` | DATE | - | Description needed | Standard field usage |
| `renewal_fee_paid` | NUMERIC(15 | - | Description needed | Standard field usage |
| `late_fee_paid` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payment_reference` | TEXT | - | Description needed | Standard field usage |
| `processed_by` | TEXT | - | Description needed | Standard field usage |
| `processing_time_days` | INTEGER | - | Description needed | Standard field usage |
| `renewal_documents` | JSONB | - | Description needed | Standard field usage |
| `renewal_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `license_id` → `compliance.org_licenses.license_id`
- `created_by` → `master.org_users.user_id`

---

### 4. regulatory_authorities

### regulatory_authorities
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_regulatory_authorities()`, `api.create_regulatory_authoritie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `authority_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `authority_code` | TEXT | ✓ | Description needed | Standard field usage |
| `authority_name` | TEXT | ✓ | Description needed | Standard field usage |
| `authority_type` | TEXT | ✓ | Description needed | Standard field usage |
| `jurisdiction_level` | TEXT | ✓ | Description needed | Standard field usage |
| `state` | TEXT | - | Description needed | Standard field usage |
| `district` | TEXT | - | Description needed | Standard field usage |
| `contact_info` | JSONB | - | Description needed | Standard field usage |
| `routine_inspection_frequency_days` | INTEGER | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

---

### 5. regulatory_inspections

### regulatory_inspections
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_regulatory_inspections()`, `api.create_regulatory_inspection()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `inspection_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `inspection_date` | DATE | ✓ | Description needed | Standard field usage |
| `inspection_type` | TEXT | ✓ | Description needed | Standard field usage |
| `authority_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `license_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `inspectors` | JSONB | - | Description needed | Standard field usage |
| `inspection_scope` | TEXT | ✓ | Description needed | Standard field usage |
| `areas_inspected` | TEXT[] | - | Description needed | Standard field usage |
| `total_observations` | INTEGER | - | Description needed | Standard field usage |
| `critical_observations` | INTEGER | - | Description needed | Standard field usage |
| `major_observations` | INTEGER | - | Description needed | Standard field usage |
| `minor_observations` | INTEGER | - | Description needed | Standard field usage |
| `inspection_findings` | JSONB | - | Description needed | Standard field usage |
| `overall_result` | TEXT | - | Description needed | Standard field usage |
| `follow_up_required` | BOOLEAN | - | Description needed | Standard field usage |
| `follow_up_date` | DATE | - | Description needed | Standard field usage |
| `follow_up_completed` | BOOLEAN | - | Description needed | Standard field usage |
| `inspection_report_date` | DATE | - | Description needed | Standard field usage |
| `inspection_report_path` | TEXT | - | Description needed | Standard field usage |
| `inspection_status` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `authority_id` → `compliance.regulatory_authorities.authority_id`
- `license_id` → `compliance.org_licenses.license_id`
- `created_by` → `master.org_users.user_id`

---

### 6. corrective_action_plans

### corrective_action_plans
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_corrective_action_plans()`, `api.create_corrective_action_plan()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `cap_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `inspection_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `cap_number` | TEXT | ✓ | Description needed | Standard field usage |
| `submission_date` | DATE | ✓ | Description needed | Standard field usage |
| `total_observations` | INTEGER | ✓ | Description needed | Standard field usage |
| `critical_observations` | INTEGER | - | Description needed | Standard field usage |
| `major_observations` | INTEGER | - | Description needed | Standard field usage |
| `minor_observations` | INTEGER | - | Description needed | Standard field usage |
| `action_items` | JSONB | - | Description needed | Standard field usage |
| `cap_status` | TEXT | - | Description needed | Standard field usage |
| `completion_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `approved_by` | TEXT | - | Description needed | Standard field usage |
| `approved_date` | DATE | - | Description needed | Standard field usage |
| `verified_by` | TEXT | - | Description needed | Standard field usage |
| `verified_date` | DATE | - | Description needed | Standard field usage |
| `verification_notes` | TEXT | - | Description needed | Standard field usage |
| `due_date` | DATE | ✓ | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `inspection_id` → `compliance.regulatory_inspections.inspection_id`
- `created_by` → `master.org_users.user_id`

---

### 7. quality_control_tests

### quality_control_tests
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_quality_control_tests()`, `api.create_quality_control_test()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `qc_test_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `test_number` | TEXT | ✓ | Description needed | Standard field usage |
| `test_date` | DATE | ✓ | Description needed | Standard field usage |
| `test_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | - | Description needed | Standard field usage |
| `sample_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sample_unit` | TEXT | - | Description needed | Standard field usage |
| `sampling_method` | TEXT | - | Description needed | Standard field usage |
| `sampled_by` | INTEGER | - | Description needed | Standard field usage |
| `test_parameters` | JSONB | - | Description needed | Standard field usage |
| `test_status` | TEXT | - | Description needed | Standard field usage |
| `tested_by` | TEXT | - | Description needed | Standard field usage |
| `testing_lab` | TEXT | - | Description needed | Standard field usage |
| `external_lab_name` | TEXT | - | Description needed | Standard field usage |
| `completed_date` | DATE | - | Description needed | Standard field usage |
| `test_report_number` | TEXT | - | Description needed | Standard field usage |
| `test_report_path` | TEXT | - | Description needed | Standard field usage |
| `is_retest` | BOOLEAN | - | Description needed | Standard field usage |
| `original_test_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `retest_reason` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_date` | DATE | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `sampled_by` → `master.org_users.user_id`
- `original_test_id` → `compliance.quality_control_tests.qc_test_id`
- `approved_by` → `master.org_users.user_id`

---

### 8. quality_deviations

### quality_deviations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_quality_deviations()`, `api.create_quality_deviation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `deviation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `deviation_number` | TEXT | ✓ | Description needed | Standard field usage |
| `deviation_date` | DATE | ✓ | Description needed | Standard field usage |
| `deviation_type` | TEXT | ✓ | Description needed | Standard field usage |
| `deviation_category` | TEXT | ✓ | Description needed | Standard field usage |
| `severity` | TEXT | ✓ | Description needed | Standard field usage |
| `deviation_description` | TEXT | ✓ | Description needed | Standard field usage |
| `root_cause` | TEXT | - | Description needed | Standard field usage |
| `impact_assessment` | TEXT | - | Description needed | Standard field usage |
| `batches_affected` | TEXT[] | - | Description needed | Standard field usage |
| `products_affected` | INTEGER[] | - | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `investigation_required` | BOOLEAN | - | Description needed | Standard field usage |
| `investigation_status` | TEXT | - | Description needed | Standard field usage |
| `investigation_completed_date` | DATE | - | Description needed | Standard field usage |
| `investigation_findings` | TEXT | - | Description needed | Standard field usage |
| `capa_required` | BOOLEAN | - | Description needed | Standard field usage |
| `capa_number` | TEXT | - | Description needed | Standard field usage |
| `capa_status` | TEXT | - | Description needed | Standard field usage |
| `reported_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `qa_reviewed_by` | INTEGER | - | Description needed | Standard field usage |
| `qa_reviewed_date` | DATE | - | Description needed | Standard field usage |
| `deviation_status` | TEXT | - | Description needed | Standard field usage |
| `closed_date` | DATE | - | Description needed | Standard field usage |
| `closed_by` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `reported_by` → `master.org_users.user_id`
- `qa_reviewed_by` → `master.org_users.user_id`
- `closed_by` → `master.org_users.user_id`

---

### 9. narcotic_register

### narcotic_register
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_narcotic_register()`, `api.create_narcotic_register()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `register_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `transaction_date` | DATE | ✓ | Description needed | Standard field usage |
| `transaction_type` | TEXT | ✓ | Description needed | Standard field usage |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | - | Description needed | Standard field usage |
| `receipt_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `issue_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `balance_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `party_type` | TEXT | - | Description needed | Standard field usage |
| `party_name` | TEXT | - | Description needed | Standard field usage |
| `party_license_number` | TEXT | - | Description needed | Standard field usage |
| `prescription_number` | TEXT | - | Description needed | Standard field usage |
| `prescriber_name` | TEXT | - | Description needed | Standard field usage |
| `prescriber_registration` | TEXT | - | Description needed | Standard field usage |
| `patient_name` | TEXT | - | Description needed | Standard field usage |
| `patient_id_proof` | TEXT | - | Description needed | Standard field usage |
| `permit_number` | TEXT | - | Description needed | Standard field usage |
| `permit_date` | DATE | - | Description needed | Standard field usage |
| `verified_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `witness_by` | INTEGER | - | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `remarks` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `product_id` → `inventory.products.product_id`
- `verified_by` → `master.org_users.user_id`
- `witness_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 10. narcotic_discrepancies

### narcotic_discrepancies
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_narcotic_discrepancies()`, `api.create_narcotic_discrepancie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `discrepancy_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `register_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `identified_date` | DATE | ✓ | Description needed | Standard field usage |
| `expected_balance` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `actual_balance` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discrepancy_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discrepancy_type` | TEXT | ✓ | Description needed | Standard field usage |
| `investigation_status` | TEXT | - | Description needed | Standard field usage |
| `investigation_findings` | TEXT | - | Description needed | Standard field usage |
| `root_cause` | TEXT | - | Description needed | Standard field usage |
| `reported_to_authority` | BOOLEAN | - | Description needed | Standard field usage |
| `authority_report_date` | DATE | - | Description needed | Standard field usage |
| `authority_report_number` | TEXT | - | Description needed | Standard field usage |
| `resolution_status` | TEXT | - | Description needed | Standard field usage |
| `resolution_date` | DATE | - | Description needed | Standard field usage |
| `resolution_notes` | TEXT | - | Description needed | Standard field usage |
| `reported_date` | DATE | ✓ | Description needed | Standard field usage |
| `reported_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `register_id` → `compliance.narcotic_register.register_id`
- `reported_by` → `master.org_users.user_id`

---

### 11. environmental_compliance

### environmental_compliance
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_environmental_compliance()`, `api.create_environmental_compliance()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `env_compliance_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `monitoring_date` | DATE | ✓ | Description needed | Standard field usage |
| `compliance_type` | TEXT | ✓ | Description needed | Standard field usage |
| `parameter_name` | TEXT | ✓ | Description needed | Standard field usage |
| `parameter_unit` | TEXT | ✓ | Description needed | Standard field usage |
| `measured_value` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `prescribed_limit` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `within_limits` | BOOLEAN | - | Description needed | Standard field usage |
| `deviation_percentage` | NUMERIC(10 | - | Description needed | Standard field usage |
| `sampling_point` | TEXT | - | Description needed | Standard field usage |
| `testing_method` | TEXT | - | Description needed | Standard field usage |
| `tested_by` | TEXT | - | Description needed | Standard field usage |
| `external_lab` | BOOLEAN | - | Description needed | Standard field usage |
| `lab_name` | TEXT | - | Description needed | Standard field usage |
| `compliance_status` | TEXT | - | Description needed | Standard field usage |
| `corrective_action_required` | BOOLEAN | - | Description needed | Standard field usage |
| `corrective_action_taken` | TEXT | - | Description needed | Standard field usage |
| `action_completion_date` | DATE | - | Description needed | Standard field usage |
| `reported_to_authority` | BOOLEAN | - | Description needed | Standard field usage |
| `report_date` | DATE | - | Description needed | Standard field usage |
| `report_reference` | TEXT | - | Description needed | Standard field usage |
| `test_report_path` | TEXT | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `created_by` → `master.org_users.user_id`

---

### 12. environmental_breaches

### environmental_breaches
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_environmental_breaches()`, `api.create_environmental_breache()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `breach_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `env_compliance_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `breach_date` | DATE | ✓ | Description needed | Standard field usage |
| `parameter_name` | TEXT | ✓ | Description needed | Standard field usage |
| `measured_value` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `prescribed_limit` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `deviation_percentage` | NUMERIC(10 | ✓ | Description needed | Standard field usage |
| `breach_level` | TEXT | ✓ | Description needed | Standard field usage |
| `authority_notified` | BOOLEAN | - | Description needed | Standard field usage |
| `notification_date` | DATE | - | Description needed | Standard field usage |
| `notification_reference` | TEXT | - | Description needed | Standard field usage |
| `penalty_imposed` | BOOLEAN | - | Description needed | Standard field usage |
| `penalty_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `penalty_paid` | BOOLEAN | - | Description needed | Standard field usage |
| `penalty_payment_date` | DATE | - | Description needed | Standard field usage |
| `corrective_measures` | TEXT | - | Description needed | Standard field usage |
| `implementation_timeline` | TEXT | - | Description needed | Standard field usage |
| `measures_completed` | BOOLEAN | - | Description needed | Standard field usage |
| `completion_verified_date` | DATE | - | Description needed | Standard field usage |
| `breach_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `reported_by` | INTEGER | ✓ | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `env_compliance_id` → `compliance.environmental_compliance.env_compliance_id`
- `reported_by` → `master.org_users.user_id`

---

### 13. compliance_violations

### compliance_violations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_compliance_violations()`, `api.create_compliance_violation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `violation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `violation_date` | DATE | ✓ | Description needed | Standard field usage |
| `violation_type` | TEXT | ✓ | Description needed | Standard field usage |
| `violation_category` | TEXT | ✓ | Description needed | Standard field usage |
| `severity` | TEXT | ✓ | Description needed | Standard field usage |
| `violation_description` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `notice_received` | BOOLEAN | - | Description needed | Standard field usage |
| `notice_date` | DATE | - | Description needed | Standard field usage |
| `notice_number` | TEXT | - | Description needed | Standard field usage |
| `response_required` | BOOLEAN | - | Description needed | Standard field usage |
| `response_due_date` | DATE | - | Description needed | Standard field usage |
| `response_submitted` | BOOLEAN | - | Description needed | Standard field usage |
| `response_date` | DATE | - | Description needed | Standard field usage |
| `penalty_imposed` | BOOLEAN | - | Description needed | Standard field usage |
| `penalty_type` | TEXT | - | Description needed | Standard field usage |
| `penalty_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `penalty_duration_days` | INTEGER | - | Description needed | Standard field usage |
| `corrective_action_plan` | TEXT | - | Description needed | Standard field usage |
| `cap_submitted_date` | DATE | - | Description needed | Standard field usage |
| `cap_approved` | BOOLEAN | - | Description needed | Standard field usage |
| `violation_status` | TEXT | - | Description needed | Standard field usage |
| `resolved_date` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 14. org_compliance_status

### org_compliance_status
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_org_compliance_status()`, `api.create_org_compliance_statu()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `status_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `overall_compliance_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `compliance_grade` | TEXT | - | Description needed | Standard field usage |
| `risk_level` | TEXT | - | Description needed | Standard field usage |
| `total_licenses` | INTEGER | - | Description needed | Standard field usage |
| `active_licenses` | INTEGER | - | Description needed | Standard field usage |
| `expired_licenses` | INTEGER | - | Description needed | Standard field usage |
| `expiring_soon` | INTEGER | - | Description needed | Standard field usage |
| `last_inspection_date` | DATE | - | Description needed | Standard field usage |
| `inspections_this_year` | INTEGER | - | Description needed | Standard field usage |
| `critical_observations_pending` | INTEGER | - | Description needed | Standard field usage |
| `qc_tests_this_month` | INTEGER | - | Description needed | Standard field usage |
| `qc_failure_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `open_deviations` | INTEGER | - | Description needed | Standard field usage |
| `environmental_breaches_ytd` | INTEGER | - | Description needed | Standard field usage |
| `pending_corrective_actions` | INTEGER | - | Description needed | Standard field usage |
| `open_violations` | INTEGER | - | Description needed | Standard field usage |
| `violations_this_year` | INTEGER | - | Description needed | Standard field usage |
| `last_calculated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 15. temperature_logs

### temperature_logs
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_temperature_logs()`, `api.create_temperature_log()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `log_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `device_id` | TEXT | ✓ | Reference to related entity | Association/lookup |
| `device_type` | TEXT | ✓ | Description needed | Standard field usage |
| `temperature` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `humidity` | NUMERIC(5 | - | Description needed | Standard field usage |
| `recorded_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `within_range` | BOOLEAN | ✓ | Description needed | Standard field usage |
| `min_allowed` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `max_allowed` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `is_excursion` | BOOLEAN | - | Description needed | Standard field usage |
| `excursion_duration_minutes` | INTEGER | - | Description needed | Standard field usage |
| `excursion_severity` | TEXT | - | Description needed | Standard field usage |
| `action_required` | BOOLEAN | - | Description needed | Standard field usage |
| `action_taken` | TEXT | - | Description needed | Standard field usage |
| `action_by` | INTEGER | - | Description needed | Standard field usage |
| `action_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `affected_products` | INTEGER[] | - | Description needed | Standard field usage |
| `affected_batches` | INTEGER[] | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `location_id` → `inventory.storage_locations.location_id`
- `action_by` → `master.org_users.user_id`

---

### 16. product_recalls

### product_recalls
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_product_recalls()`, `api.create_product_recall()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `recall_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `recall_number` | TEXT | ✓ | Description needed | Standard field usage |
| `recall_date` | DATE | - | Description needed | Standard field usage |
| `recall_type` | TEXT | ✓ | Description needed | Standard field usage |
| `recall_classification` | TEXT | ✓ | Description needed | Standard field usage |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `affected_batches` | INTEGER[] | - | Description needed | Standard field usage |
| `batch_numbers` | TEXT[] | - | Description needed | Standard field usage |
| `reason_category` | TEXT | ✓ | Description needed | Standard field usage |
| `reason_description` | TEXT | ✓ | Description needed | Standard field usage |
| `health_hazard_assessment` | TEXT | - | Description needed | Standard field usage |
| `distribution_pattern` | TEXT | ✓ | Description needed | Standard field usage |
| `states_affected` | TEXT[] | - | Description needed | Standard field usage |
| `countries_affected` | TEXT[] | - | Description needed | Standard field usage |
| `quantity_distributed` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_recovered` | NUMERIC(15 | - | Description needed | Standard field usage |
| `customers_notified` | INTEGER | - | Description needed | Standard field usage |
| `notification_method` | TEXT[] | - | Description needed | Standard field usage |
| `notification_date` | DATE | - | Description needed | Standard field usage |
| `fda_notified` | BOOLEAN | - | Description needed | Standard field usage |
| `fda_notification_date` | DATE | - | Description needed | Standard field usage |
| `regulatory_references` | TEXT[] | - | Description needed | Standard field usage |
| `recall_status` | TEXT | - | Description needed | Standard field usage |
| `effectiveness_checks_required` | INTEGER | - | Description needed | Standard field usage |
| `effectiveness_checks_completed` | INTEGER | - | Description needed | Standard field usage |
| `estimated_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `actual_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `insurance_claim_filed` | BOOLEAN | - | Description needed | Standard field usage |
| `completion_date` | DATE | - | Description needed | Standard field usage |
| `final_report_submitted` | BOOLEAN | - | Description needed | Standard field usage |
| `lessons_learned` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `created_by` → `master.org_users.user_id`

---
