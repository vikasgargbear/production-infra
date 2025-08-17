# GST Schema Documentation

## Overview
The `gst` schema manages Goods and Services Tax compliance including returns filing, e-invoicing, e-way bills, and reconciliation. This is critical for Indian tax compliance.

---

## Tables

### 1. hsn_sac_codes

### hsn_sac_codes
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_hsn_sac_codes()`, `api.create_hsn_sac_code()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `hsn_sac_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `code` | TEXT | ✓ | Description needed | Standard field usage |
| `code_type` | TEXT | ✓ | Description needed | Standard field usage |
| `description` | TEXT | ✓ | Description needed | Standard field usage |
| `igst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `cgst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `sgst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `cess_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `effective_from` | DATE | - | Description needed | Standard field usage |
| `effective_until` | DATE | - | Description needed | Standard field usage |
| `chapter_code` | TEXT | - | Description needed | Standard field usage |
| `chapter_name` | TEXT | - | Description needed | Standard field usage |
| `section_name` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

---

### 2. gst_rates

### gst_rates
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gst_rates()`, `api.create_gst_rate()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `rate_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_category_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `igst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `cgst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `sgst_rate` | NUMERIC(5 | ✓ | Description needed | Standard field usage |
| `cess_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `effective_from` | DATE | ✓ | Description needed | Standard field usage |
| `effective_until` | DATE | - | Description needed | Standard field usage |
| `notification_number` | TEXT | - | Description needed | Standard field usage |
| `notification_date` | DATE | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `product_category_id` → `inventory.product_categories.category_id`
- `created_by` → `master.org_users.user_id`

---

### 3. gstr1_data

### gstr1_data
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gstr1_data()`, `api.create_gstr1_data()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr1_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `return_period` | TEXT | ✓ | Description needed | Standard field usage |
| `financial_year` | TEXT | ✓ | Description needed | Standard field usage |
| `b2b_supplies` | JSONB | - | Description needed | Standard field usage |
| `b2b_invoice_count` | INTEGER | - | Description needed | Standard field usage |
| `b2b_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2b_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2cl_supplies` | JSONB | - | Description needed | Standard field usage |
| `b2cl_invoice_count` | INTEGER | - | Description needed | Standard field usage |
| `b2cl_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2cl_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2cs_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2cs_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cdn_documents` | JSONB | - | Description needed | Standard field usage |
| `cdn_count` | INTEGER | - | Description needed | Standard field usage |
| `cdn_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cdn_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `exp_supplies` | JSONB | - | Description needed | Standard field usage |
| `exp_invoice_count` | INTEGER | - | Description needed | Standard field usage |
| `exp_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `nil_rated_supplies` | JSONB | - | Description needed | Standard field usage |
| `hsn_summary` | JSONB | - | Description needed | Standard field usage |
| `doc_summary` | JSONB | - | Description needed | Standard field usage |
| `total_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `filing_status` | TEXT | - | Description needed | Standard field usage |
| `filed_date` | DATE | - | Description needed | Standard field usage |
| `arn_number` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 4. gstr2a_data

### gstr2a_data
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gstr2a_data()`, `api.create_gstr2a_data()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr2a_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `return_period` | TEXT | ✓ | Description needed | Standard field usage |
| `downloaded_date` | DATE | ✓ | Description needed | Standard field usage |
| `download_status` | TEXT | - | Description needed | Standard field usage |
| `b2b_invoices` | JSONB | - | Description needed | Standard field usage |
| `b2b_count` | INTEGER | - | Description needed | Standard field usage |
| `b2b_taxable_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `b2b_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cdn_documents` | JSONB | - | Description needed | Standard field usage |
| `cdn_count` | INTEGER | - | Description needed | Standard field usage |
| `isd_credits` | JSONB | - | Description needed | Standard field usage |
| `reconciliation_status` | TEXT | - | Description needed | Standard field usage |
| `matched_invoices` | INTEGER | - | Description needed | Standard field usage |
| `unmatched_invoices` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 5. gstr2b_data

### gstr2b_data
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gstr2b_data()`, `api.create_gstr2b_data()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr2b_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `return_period` | TEXT | ✓ | Description needed | Standard field usage |
| `generation_date` | DATE | ✓ | Description needed | Standard field usage |
| `total_itc_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `itc_unavailable` | NUMERIC(15 | - | Description needed | Standard field usage |
| `import_goods_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `isd_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `ineligible_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `itc_reversal` | NUMERIC(15 | - | Description needed | Standard field usage |
| `net_itc` | NUMERIC(15 | - | Description needed | Standard field usage |
| `download_status` | TEXT | - | Description needed | Standard field usage |
| `downloaded_date` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 6. gstr3b_data

### gstr3b_data
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gstr3b_data()`, `api.create_gstr3b_data()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `gstr3b_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `return_period` | TEXT | ✓ | Description needed | Standard field usage |
| `outward_taxable_supplies` | NUMERIC(15 | - | Description needed | Standard field usage |
| `outward_zero_rated` | NUMERIC(15 | - | Description needed | Standard field usage |
| `outward_nil_rated` | NUMERIC(15 | - | Description needed | Standard field usage |
| `inward_nil_rated` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_output_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_output_cgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_output_sgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_output_cess` | NUMERIC(15 | - | Description needed | Standard field usage |
| `import_goods_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `import_service_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `inward_supplies_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `inward_supplies_cgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `inward_supplies_sgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `itc_reversal_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `itc_reversal_cgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `itc_reversal_sgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `inter_state_supplies` | NUMERIC(15 | - | Description needed | Standard field usage |
| `intra_state_supplies` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_payable_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_payable_cgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_payable_sgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_payable_cess` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_paid_cash_igst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_paid_cash_cgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_paid_cash_sgst` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_paid_cash_cess` | NUMERIC(15 | - | Description needed | Standard field usage |
| `interest_payable` | NUMERIC(15 | - | Description needed | Standard field usage |
| `late_fee` | NUMERIC(15 | - | Description needed | Standard field usage |
| `filing_status` | TEXT | - | Description needed | Standard field usage |
| `filed_date` | DATE | - | Description needed | Standard field usage |
| `arn_number` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 7. gst_reconciliation

### gst_reconciliation
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gst_reconciliation()`, `api.create_gst_reconciliation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reconciliation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `reconciliation_type` | TEXT | ✓ | Description needed | Standard field usage |
| `period` | TEXT | ✓ | Description needed | Standard field usage |
| `books_data` | JSONB | ✓ | Description needed | Standard field usage |
| `gst_return_data` | JSONB | ✓ | Description needed | Standard field usage |
| `invoice_count_variance` | INTEGER | - | Description needed | Standard field usage |
| `taxable_value_variance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_variance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `matched_items` | JSONB | - | Description needed | Standard field usage |
| `unmatched_in_books` | JSONB | - | Description needed | Standard field usage |
| `unmatched_in_return` | JSONB | - | Description needed | Standard field usage |
| `reconciliation_status` | TEXT | - | Description needed | Standard field usage |
| `actions_taken` | JSONB | - | Description needed | Standard field usage |
| `reviewed_by` | INTEGER | - | Description needed | Standard field usage |
| `reviewed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `reviewed_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 8. eway_bills

### eway_bills
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_eway_bills()`, `api.create_eway_bill()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `eway_bill_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `eway_bill_number` | TEXT | - | Description needed | Standard field usage |
| `eway_bill_date` | DATE | ✓ | Description needed | Standard field usage |
| `document_type` | TEXT | ✓ | Description needed | Standard field usage |
| `document_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `document_number` | TEXT | ✓ | Description needed | Standard field usage |
| `supply_type` | TEXT | ✓ | Description needed | Standard field usage |
| `sub_supply_type` | TEXT | ✓ | Description needed | Standard field usage |
| `from_gstin` | TEXT | ✓ | Description needed | Standard field usage |
| `from_address` | TEXT | ✓ | Description needed | Standard field usage |
| `from_place` | TEXT | ✓ | Description needed | Standard field usage |
| `from_pincode` | TEXT | ✓ | Description needed | Standard field usage |
| `from_state_code` | TEXT | ✓ | Description needed | Standard field usage |
| `to_gstin` | TEXT | - | Description needed | Standard field usage |
| `to_address` | TEXT | ✓ | Description needed | Standard field usage |
| `to_place` | TEXT | ✓ | Description needed | Standard field usage |
| `to_pincode` | TEXT | ✓ | Description needed | Standard field usage |
| `to_state_code` | TEXT | ✓ | Description needed | Standard field usage |
| `total_value` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `taxable_value` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `cgst_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `transport_mode` | TEXT | ✓ | Description needed | Standard field usage |
| `transport_distance` | INTEGER | - | Description needed | Standard field usage |
| `transporter_name` | TEXT | - | Description needed | Standard field usage |
| `transporter_id` | TEXT | - | Reference to related entity | Association/lookup |
| `transport_doc_number` | TEXT | - | Description needed | Standard field usage |
| `transport_doc_date` | DATE | - | Description needed | Standard field usage |
| `vehicle_number` | TEXT | - | Description needed | Standard field usage |
| `vehicle_type` | TEXT | - | Description needed | Standard field usage |
| `valid_from` | TIMESTAMP | ✓ | Description needed | Standard field usage |
| `valid_until` | TIMESTAMP | ✓ | Description needed | Standard field usage |
| `eway_bill_status` | TEXT | - | Description needed | Standard field usage |
| `cancellation_reason` | TEXT | - | Description needed | Standard field usage |
| `cancelled_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `extended` | BOOLEAN | - | Description needed | Standard field usage |
| `extension_reason` | TEXT | - | Description needed | Standard field usage |
| `extended_validity` | TIMESTAMP | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 9. gst_liability

### gst_liability
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gst_liability()`, `api.create_gst_liability()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `liability_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `tax_period` | TEXT | ✓ | Description needed | Standard field usage |
| `due_date` | DATE | ✓ | Description needed | Standard field usage |
| `igst_liability` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_liability` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_liability` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_liability` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_itc_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_itc_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_itc_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_itc_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_itc_utilized` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_itc_utilized` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_itc_utilized` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_itc_utilized` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_cash_required` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_cash_required` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_cash_required` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_cash_required` | NUMERIC(15 | - | Description needed | Standard field usage |
| `interest_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `late_fee` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_liability` | NUMERIC(15 | - | Description needed | Standard field usage |
| `balance_payable` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `paid_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payment_date` | DATE | - | Description needed | Standard field usage |
| `payment_reference` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 10. gst_credit_ledger

### gst_credit_ledger
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gst_credit_ledger()`, `api.create_gst_credit_ledger()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `ledger_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `transaction_date` | DATE | ✓ | Description needed | Standard field usage |
| `transaction_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `description` | TEXT | ✓ | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 11. gst_audit_trail

### gst_audit_trail
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_gst_audit_trail()`, `api.create_gst_audit_trail()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `audit_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `activity_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `activity_type` | TEXT | ✓ | Description needed | Standard field usage |
| `return_type` | TEXT | - | Description needed | Standard field usage |
| `return_period` | TEXT | - | Description needed | Standard field usage |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `activity_description` | TEXT | ✓ | Description needed | Standard field usage |
| `old_values` | JSONB | - | Description needed | Standard field usage |
| `new_values` | JSONB | - | Description needed | Standard field usage |
| `performed_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `ip_address` | INET | - | Description needed | Standard field usage |
| `user_agent` | TEXT | - | Description needed | Standard field usage |
| `activity_status` | TEXT | - | Description needed | Standard field usage |
| `error_message` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `performed_by` → `master.org_users.user_id`

---

### 12. compliance_calendar

### compliance_calendar
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_compliance_calendar()`, `api.create_compliance_calendar()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `calendar_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `compliance_type` | TEXT | ✓ | Description needed | Standard field usage |
| `period` | TEXT | ✓ | Description needed | Standard field usage |
| `due_date` | DATE | ✓ | Description needed | Standard field usage |
| `extended_due_date` | DATE | - | Description needed | Standard field usage |
| `compliance_status` | TEXT | - | Description needed | Standard field usage |
| `completed_date` | DATE | - | Description needed | Standard field usage |
| `reminder_days` | INTEGER[] | - | Description needed | Standard field usage |
| `reminders_sent` | INTEGER | - | Description needed | Standard field usage |
| `last_reminder_date` | DATE | - | Description needed | Standard field usage |
| `assigned_to` | INTEGER | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `assigned_to` → `master.org_users.user_id`

---
