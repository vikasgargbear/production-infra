# Compliance Schema Documentation

## Overview
The `compliance` schema manages pharmaceutical regulatory compliance including drug licenses, narcotic tracking, inspections, and environmental compliance. This is critical for operating legally in the pharmaceutical industry.

---

## Tables

### 1. org_licenses
**Purpose**: Organization and branch-wise license management
**API Endpoint**: `api.get_licenses()`, `api.create_license()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `license_id` | SERIAL | ✓ | Unique license identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID if branch-specific | Branch association |
| `license_type` | TEXT | ✓ | Type: 'drug_license', 'manufacturing', 'fssai', 'pollution_control', 'fire_safety', 'trade' | License classification |
| `license_number` | TEXT | ✓ | License number | License identification |
| `license_name` | TEXT | ✓ | License display name | Display reference |
| `issuing_authority` | TEXT | ✓ | Issuing authority name | Authority tracking |
| `issue_date` | DATE | ✓ | License issue date | Validity tracking |
| `valid_from` | DATE | ✓ | Validity start date | Validity period |
| `valid_until` | DATE | ✓ | Expiry date | Expiry tracking |
| `renewal_due_date` | DATE | - | Renewal reminder date | Renewal planning |
| `license_category` | TEXT | - | Category: 'retail', 'wholesale', 'both' | Category classification |
| `license_scope` | TEXT[] | - | Scope: ['allopathic', 'ayurvedic', 'homeopathic'] | Scope tracking |
| `authorized_activities` | TEXT[] | - | Authorized activities | Permission tracking |
| `license_conditions` | TEXT | - | Special conditions/restrictions | Compliance requirements |
| `license_status` | TEXT | ✓ | Status: 'active', 'expired', 'suspended', 'cancelled', 'renewal_pending' | Status tracking |
| `renewal_status` | TEXT | - | Renewal: 'not_started', 'in_progress', 'submitted', 'completed' | Renewal workflow |
| `renewal_application_date` | DATE | - | Renewal application date | Renewal tracking |
| `renewal_application_number` | TEXT | - | Renewal reference number | Renewal reference |
| `suspension_date` | DATE | - | Suspension date if suspended | Suspension tracking |
| `suspension_reason` | TEXT | - | Suspension reason | Compliance tracking |
| `document_url` | TEXT | - | License document URL | Document access |
| `renewal_documents` | JSONB | - | Renewal document references | Document tracking |
| `fees_paid` | NUMERIC(15,2) | - | License/renewal fees | Financial tracking |
| `next_inspection_due` | DATE | - | Next inspection date | Inspection planning |
| `compliance_score` | NUMERIC(5,2) | - | Compliance score (0-100) | Performance tracking |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "license_id": 1,
  "license_type": "drug_license",
  "license_number": "MH-MUM-123456",
  "license_name": "Retail Drug License - Mumbai Branch",
  "issuing_authority": "FDA Maharashtra",
  "valid_until": "2025-03-31",
  "license_category": "retail",
  "license_scope": ["allopathic", "ayurvedic"],
  "license_status": "active",
  "renewal_due_date": "2025-02-28",
  "compliance_score": 95.5
}
```

---

### 2. narcotic_register
**Purpose**: Narcotic and psychotropic substance tracking
**API Endpoint**: `api.get_narcotic_register()`, `api.create_narcotic_entry()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `register_id` | SERIAL | ✓ | Unique register entry identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Branch ID | Branch tracking |
| `entry_date` | DATE | ✓ | Entry date | Date tracking |
| `entry_type` | TEXT | ✓ | Type: 'receipt', 'issue', 'disposal', 'audit' | Transaction type |
| `product_id` | INTEGER | ✓ | Product reference | Product tracking |
| `product_name` | TEXT | - | Product name (snapshot) | Display reference |
| `narcotic_class` | TEXT | ✓ | Class: 'schedule_h', 'schedule_h1', 'schedule_x', 'ndps' | Classification |
| `batch_number` | TEXT | ✓ | Batch number | Batch tracking |
| `quantity_received` | NUMERIC(15,3) | - | Quantity received | Receipt tracking |
| `quantity_issued` | NUMERIC(15,3) | - | Quantity issued | Issue tracking |
| `quantity_disposed` | NUMERIC(15,3) | - | Quantity disposed | Disposal tracking |
| `opening_balance` | NUMERIC(15,3) | ✓ | Opening balance | Balance tracking |
| `closing_balance` | NUMERIC(15,3) | ✓ | Closing balance | Balance verification |
| `supplier_name` | TEXT | - | Supplier name for receipts | Supplier tracking |
| `supplier_license_number` | TEXT | - | Supplier license number | Compliance verification |
| `purchase_invoice_number` | TEXT | - | Purchase invoice reference | Document tracking |
| `customer_name` | TEXT | - | Customer name for issues | Customer tracking |
| `customer_license_number` | TEXT | - | Customer license number | Compliance verification |
| `prescription_number` | TEXT | - | Prescription number | Prescription tracking |
| `prescriber_name` | TEXT | - | Doctor/prescriber name | Prescriber tracking |
| `prescriber_registration` | TEXT | - | Prescriber registration number | Compliance tracking |
| `disposal_method` | TEXT | - | Method: 'expired', 'damaged', 'returned_to_supplier' | Disposal classification |
| `disposal_witness` | TEXT | - | Disposal witness name | Disposal verification |
| `disposal_certificate_number` | TEXT | - | Disposal certificate reference | Document tracking |
| `inspector_name` | TEXT | - | Inspector name for audits | Inspection tracking |
| `inspection_remarks` | TEXT | - | Inspection observations | Compliance notes |
| `verified_by` | INTEGER | - | User who verified entry | Verification tracking |
| `verified_at` | TIMESTAMPTZ | - | Verification timestamp | Verification tracking |
| `created_by` | INTEGER | - | User who created entry | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "register_id": 1,
  "entry_date": "2024-01-15",
  "entry_type": "issue",
  "product_name": "Alprazolam 0.5mg",
  "narcotic_class": "schedule_h1",
  "batch_number": "ALP2024001",
  "quantity_issued": 10,
  "opening_balance": 100,
  "closing_balance": 90,
  "customer_name": "ABC Medical Store",
  "prescription_number": "RX20240115001",
  "prescriber_name": "Dr. John Doe",
  "prescriber_registration": "MCI-12345"
}
```

---

### 3. regulatory_inspections
**Purpose**: Regulatory inspection tracking and compliance
**API Endpoint**: `api.get_inspections()`, `api.create_inspection()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `inspection_id` | SERIAL | ✓ | Unique inspection identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID if branch-specific | Branch tracking |
| `inspection_date` | DATE | ✓ | Inspection date | Date tracking |
| `inspection_type` | TEXT | ✓ | Type: 'routine', 'surprise', 'follow_up', 'complaint_based' | Inspection classification |
| `regulatory_body` | TEXT | ✓ | Body: 'FDA', 'Drug_Controller', 'Pollution_Board', 'Fire_Department' | Authority tracking |
| `inspector_names` | TEXT[] | - | Inspector names | Inspector tracking |
| `inspection_areas` | TEXT[] | - | Areas inspected | Scope tracking |
| `license_types_checked` | TEXT[] | - | Licenses verified | License verification |
| `inspection_status` | TEXT | ✓ | Status: 'scheduled', 'in_progress', 'completed', 'report_pending' | Status tracking |
| `overall_rating` | TEXT | - | Rating: 'satisfactory', 'needs_improvement', 'unsatisfactory' | Performance rating |
| `compliance_score` | NUMERIC(5,2) | - | Compliance score (0-100) | Score tracking |
| `violations_found` | INTEGER | - | Number of violations | Violation tracking |
| `critical_violations` | INTEGER | - | Critical violations count | Severity tracking |
| `major_violations` | INTEGER | - | Major violations count | Severity tracking |
| `minor_violations` | INTEGER | - | Minor violations count | Severity tracking |
| `observations` | JSONB | - | Detailed observations | Finding details |
| `corrective_actions` | JSONB | - | Required corrective actions | Action items |
| `report_date` | DATE | - | Inspection report date | Report tracking |
| `report_number` | TEXT | - | Report reference number | Document reference |
| `report_document_url` | TEXT | - | Report document URL | Document access |
| `response_required_by` | DATE | - | Response deadline | Compliance deadline |
| `response_submitted_date` | DATE | - | Response submission date | Response tracking |
| `response_document_url` | TEXT | - | Response document URL | Document access |
| `follow_up_required` | BOOLEAN | - | Follow-up inspection needed | Follow-up tracking |
| `follow_up_date` | DATE | - | Scheduled follow-up date | Planning |
| `closure_date` | DATE | - | Issue closure date | Closure tracking |
| `closure_remarks` | TEXT | - | Closure remarks | Final status |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**observations JSONB Structure**:
```json
{
  "storage_conditions": {
    "finding": "Temperature not maintained",
    "severity": "major",
    "location": "Store Room A"
  },
  "record_keeping": {
    "finding": "Incomplete narcotic register",
    "severity": "critical",
    "details": "Missing entries for last week"
  }
}
```

---

### 4. compliance_violations
**Purpose**: Detailed violation tracking and resolution
**API Endpoint**: `api.get_violations()`, `api.create_violation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `violation_id` | SERIAL | ✓ | Unique violation identifier | Primary key |
| `inspection_id` | INTEGER | - | Parent inspection reference | Inspection linking |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID | Branch tracking |
| `violation_date` | DATE | ✓ | Violation identified date | Date tracking |
| `violation_type` | TEXT | ✓ | Type: 'storage', 'documentation', 'quality', 'safety', 'environmental' | Violation classification |
| `violation_category` | TEXT | ✓ | Category: 'critical', 'major', 'minor' | Severity classification |
| `description` | TEXT | ✓ | Violation description | Detail documentation |
| `regulatory_reference` | TEXT | - | Regulation/clause reference | Compliance reference |
| `identified_by` | TEXT | - | Who identified the violation | Source tracking |
| `responsible_person` | INTEGER | - | Responsible user ID | Responsibility assignment |
| `department_id` | INTEGER | - | Responsible department | Department tracking |
| `corrective_action_required` | TEXT | ✓ | Required corrective action | Action planning |
| `preventive_action_required` | TEXT | - | Preventive action | Long-term solution |
| `target_completion_date` | DATE | ✓ | Correction deadline | Timeline tracking |
| `actual_completion_date` | DATE | - | Actual completion date | Completion tracking |
| `action_taken` | TEXT | - | Actions taken | Resolution documentation |
| `evidence_documents` | JSONB | - | Evidence document references | Proof of compliance |
| `violation_status` | TEXT | ✓ | Status: 'open', 'in_progress', 'resolved', 'verified', 'closed' | Status tracking |
| `verification_date` | DATE | - | Verification date | Verification tracking |
| `verified_by` | INTEGER | - | Verifier user ID | Verification tracking |
| `recurrence_count` | INTEGER | - | Times this violation recurred | Pattern tracking |
| `financial_impact` | NUMERIC(15,2) | - | Financial impact/penalty | Cost tracking |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 5. environmental_compliance
**Purpose**: Environmental compliance and waste management
**API Endpoint**: `api.get_environmental_compliance()`, `api.create_environmental_record()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `compliance_id` | SERIAL | ✓ | Unique compliance identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Branch ID | Branch tracking |
| `compliance_type` | TEXT | ✓ | Type: 'waste_disposal', 'emission_control', 'water_treatment', 'hazardous_storage' | Compliance classification |
| `reporting_period` | TEXT | ✓ | Period (MMYYYY) | Period tracking |
| `from_date` | DATE | ✓ | Period start date | Date range |
| `to_date` | DATE | ✓ | Period end date | Date range |
| `biomedical_waste_generated` | NUMERIC(15,3) | - | Biomedical waste in KG | Waste tracking |
| `biomedical_waste_disposed` | NUMERIC(15,3) | - | Disposed quantity in KG | Disposal tracking |
| `hazardous_waste_generated` | NUMERIC(15,3) | - | Hazardous waste in KG | Waste tracking |
| `hazardous_waste_disposed` | NUMERIC(15,3) | - | Disposed quantity in KG | Disposal tracking |
| `disposal_method` | TEXT[] | - | Methods used for disposal | Method tracking |
| `disposal_vendor` | TEXT | - | Authorized disposal vendor | Vendor tracking |
| `disposal_certificates` | JSONB | - | Disposal certificate references | Certificate tracking |
| `air_emission_levels` | JSONB | - | Air quality parameters | Emission tracking |
| `water_discharge_levels` | JSONB | - | Water discharge parameters | Discharge tracking |
| `noise_levels` | JSONB | - | Noise level measurements | Noise monitoring |
| `compliance_parameters` | JSONB | - | All compliance parameters | Parameter tracking |
| `violations` | INTEGER | - | Violations in period | Violation count |
| `corrective_actions` | TEXT | - | Actions taken | Correction tracking |
| `submitted_to_board` | BOOLEAN | - | Submitted to pollution board | Submission tracking |
| `submission_date` | DATE | - | Submission date | Submission tracking |
| `acknowledgment_number` | TEXT | - | Board acknowledgment | Reference tracking |
| `next_due_date` | DATE | - | Next submission due | Planning |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 6. training_records
**Purpose**: Compliance training and certification tracking
**API Endpoint**: `api.get_training_records()`, `api.create_training_record()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `training_id` | SERIAL | ✓ | Unique training identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `training_type` | TEXT | ✓ | Type: 'gmp', 'safety', 'quality', 'regulatory', 'narcotic_handling' | Training classification |
| `training_title` | TEXT | ✓ | Training program title | Display name |
| `training_date` | DATE | ✓ | Training date | Date tracking |
| `trainer_name` | TEXT | - | Trainer/instructor name | Trainer tracking |
| `trainer_organization` | TEXT | - | Training organization | Provider tracking |
| `duration_hours` | NUMERIC(5,2) | - | Training duration | Duration tracking |
| `attendees` | INTEGER[] | - | User IDs who attended | Attendance tracking |
| `attendance_count` | INTEGER | - | Total attendees | Count tracking |
| `training_mode` | TEXT | - | Mode: 'classroom', 'online', 'practical' | Mode tracking |
| `topics_covered` | TEXT[] | - | Topics covered | Content tracking |
| `assessment_conducted` | BOOLEAN | - | Assessment done flag | Assessment tracking |
| `passed_count` | INTEGER | - | Employees who passed | Success tracking |
| `failed_count` | INTEGER | - | Employees who failed | Failure tracking |
| `certificates_issued` | BOOLEAN | - | Certificates issued flag | Certification tracking |
| `certificate_validity_years` | INTEGER | - | Certificate validity period | Validity tracking |
| `next_training_due` | DATE | - | Next training date | Planning |
| `training_materials_url` | TEXT | - | Training materials URL | Resource access |
| `attendance_sheet_url` | TEXT | - | Attendance sheet URL | Document access |
| `feedback_score` | NUMERIC(3,2) | - | Average feedback score | Quality tracking |
| `created_by` | INTEGER | - | User who created record | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 7. sop_documents
**Purpose**: Standard Operating Procedures management
**API Endpoint**: `api.get_sops()`, `api.create_sop()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `sop_id` | SERIAL | ✓ | Unique SOP identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `sop_code` | TEXT | ✓ | SOP code/number | SOP identification |
| `sop_title` | TEXT | ✓ | SOP title | Display name |
| `department` | TEXT | ✓ | Department: 'pharmacy', 'warehouse', 'quality', 'admin' | Department classification |
| `category` | TEXT | ✓ | Category: 'operational', 'quality', 'safety', 'regulatory' | Category classification |
| `version` | TEXT | ✓ | Version number | Version control |
| `effective_date` | DATE | ✓ | Effective from date | Validity tracking |
| `review_date` | DATE | - | Next review date | Review planning |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_date` | DATE | - | Approval date | Approval tracking |
| `document_url` | TEXT | ✓ | SOP document URL | Document access |
| `change_history` | JSONB | - | Version change history | Change tracking |
| `training_required` | BOOLEAN | - | Training required flag | Training tracking |
| `trained_users` | INTEGER[] | - | Users trained on SOP | Training tracking |
| `is_active` | BOOLEAN | - | SOP active status | Status tracking |
| `superseded_by` | INTEGER | - | New SOP ID if replaced | Replacement tracking |
| `created_by` | INTEGER | - | User who created SOP | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 8. compliance_calendar
**Purpose**: Compliance activity calendar and reminders
**API Endpoint**: `api.get_compliance_calendar()`, `api.create_compliance_event()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `calendar_id` | SERIAL | ✓ | Unique calendar entry identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Branch ID if branch-specific | Branch tracking |
| `compliance_type` | TEXT | ✓ | Type: 'license_renewal', 'return_filing', 'inspection', 'training', 'audit' | Event classification |
| `event_title` | TEXT | ✓ | Event title | Display name |
| `description` | TEXT | - | Event description | Detail information |
| `due_date` | DATE | ✓ | Due date | Calendar display |
| `reminder_days` | INTEGER[] | - | Reminder days before due [30, 15, 7] | Reminder scheduling |
| `responsible_person` | INTEGER | - | Responsible user ID | Assignment tracking |
| `department_id` | INTEGER | - | Responsible department | Department tracking |
| `recurring` | BOOLEAN | - | Recurring event flag | Recurrence tracking |
| `recurrence_pattern` | TEXT | - | Pattern: 'monthly', 'quarterly', 'yearly' | Recurrence rule |
| `reference_document` | TEXT | - | Reference document type | Document linking |
| `reference_id` | INTEGER | - | Reference document ID | Document linking |
| `completion_status` | TEXT | ✓ | Status: 'upcoming', 'in_progress', 'completed', 'overdue' | Status tracking |
| `completed_date` | DATE | - | Actual completion date | Completion tracking |
| `completed_by` | INTEGER | - | User who completed | Completion tracking |
| `evidence_url` | TEXT | - | Completion evidence URL | Proof documentation |
| `notes` | TEXT | - | Additional notes | Documentation |
| `created_by` | INTEGER | - | User who created event | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

## API Integration Notes

### License Management
```javascript
// Check expiring licenses
GET /api/compliance/expiring-licenses?days=30
{
  "expiring_licenses": [
    {
      "license_id": 1,
      "license_type": "drug_license",
      "license_number": "MH-MUM-123456",
      "valid_until": "2024-02-15",
      "days_remaining": 15,
      "renewal_status": "not_started"
    }
  ]
}

// Initiate license renewal
POST /api/compliance/initiate-renewal
{
  "license_id": 1,
  "renewal_application_date": "2024-01-15",
  "documents": [
    {
      "type": "application_form",
      "url": "/documents/renewal_app_2024.pdf"
    }
  ]
}
```

### Narcotic Compliance
```javascript
// Daily narcotic balance verification
POST /api/compliance/verify-narcotic-balance
{
  "branch_id": 1,
  "verification_date": "2024-01-15",
  "products": [
    {
      "product_id": 101,
      "physical_count": 90,
      "system_balance": 90,
      "verified": true
    }
  ]
}

// Narcotic disposal
POST /api/compliance/narcotic-disposal
{
  "product_id": 101,
  "batch_number": "NAR2024001",
  "quantity": 10,
  "disposal_method": "expired",
  "disposal_witness": "John Doe",
  "disposal_certificate": "/documents/disposal_cert_001.pdf"
}
```

### Inspection Management
```javascript
// Record inspection findings
POST /api/compliance/record-inspection
{
  "inspection_date": "2024-01-15",
  "inspection_type": "routine",
  "regulatory_body": "FDA",
  "observations": {
    "storage_conditions": {
      "finding": "Temperature log missing for 2 days",
      "severity": "minor"
    },
    "record_keeping": {
      "finding": "Purchase register not updated",
      "severity": "major"
    }
  },
  "corrective_actions": [
    {
      "action": "Install automatic temperature monitoring",
      "target_date": "2024-02-15"
    }
  ]
}
```

### Compliance Dashboard
```javascript
// Compliance overview
GET /api/compliance/dashboard
{
  "compliance_score": 92.5,
  "active_licenses": 12,
  "expiring_soon": 2,
  "pending_inspections": 1,
  "open_violations": 3,
  "upcoming_trainings": 2,
  "environmental_compliance": {
    "waste_disposal_compliance": 100,
    "pending_reports": 0
  },
  "narcotic_compliance": {
    "last_audit": "2024-01-10",
    "discrepancies": 0
  }
}
```

### Environmental Reporting
```javascript
// Submit environmental compliance report
POST /api/compliance/environmental-report
{
  "reporting_period": "012024",
  "biomedical_waste_generated": 150.5,
  "biomedical_waste_disposed": 150.5,
  "disposal_vendor": "Authorized Waste Management Ltd",
  "disposal_certificates": [
    {
      "certificate_number": "BWM/2024/001",
      "date": "2024-01-31",
      "quantity": 150.5
    }
  ],
  "compliance_parameters": {
    "air_quality": "within_limits",
    "water_discharge": "within_limits",
    "noise_levels": "within_limits"
  }
}
```

### Training Management
```javascript
// Schedule compliance training
POST /api/compliance/schedule-training
{
  "training_type": "narcotic_handling",
  "training_title": "Schedule H1 Drug Handling Procedures",
  "training_date": "2024-02-15",
  "attendees": [1, 2, 3, 4, 5],
  "topics_covered": [
    "Storage requirements",
    "Record keeping",
    "Prescription verification",
    "Disposal procedures"
  ]
}

// Training completion tracking
PATCH /api/compliance/training/1/complete
{
  "assessment_results": [
    {"user_id": 1, "score": 85, "passed": true},
    {"user_id": 2, "score": 92, "passed": true}
  ],
  "certificates_issued": true,
  "feedback_score": 4.5
}
```

### Compliance Calendar
```javascript
// Get compliance calendar
GET /api/compliance/calendar?
  month=01&
  year=2024&
  branch_id=1

// Response
{
  "events": [
    {
      "date": "2024-01-15",
      "events": [
        {
          "type": "license_renewal",
          "title": "Drug License Renewal Due",
          "days_remaining": 45
        }
      ]
    },
    {
      "date": "2024-01-31",
      "events": [
        {
          "type": "return_filing",
          "title": "Environmental Compliance Report Due",
          "responsible_person": "EHS Manager"
        }
      ]
    }
  ]
}
```

### Validation Rules
1. **License Numbers**: Must follow state-specific formats
2. **Narcotic Records**: Closing balance must match calculations
3. **Inspection Scores**: Must be between 0-100
4. **Environmental Data**: Quantities must be non-negative
5. **Training Attendance**: Cannot exceed registered participants