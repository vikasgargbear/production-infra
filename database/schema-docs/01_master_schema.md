# Master Schema Documentation

## Overview
The `master` schema contains core organizational data, user management, and system configuration tables that form the foundation of the pharmaceutical ERP system.

---

## Tables

### 1. organizations

### organizations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_organizations()`, `api.create_organization()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `org_id` | UUID | ✓ | Primary key identifier | Primary key |
| `org_code` | TEXT | ✓ | Description needed | Standard field usage |
| `org_name` | TEXT | ✓ | Description needed | Standard field usage |
| `legal_name` | TEXT | ✓ | Description needed | Standard field usage |
| `business_type` | TEXT | - | Description needed | Standard field usage |
| `establishment_date` | DATE | - | Description needed | Standard field usage |
| `gst_number` | TEXT | - | Description needed | Standard field usage |
| `pan_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_validity` | DATE | - | Description needed | Standard field usage |
| `fssai_number` | TEXT | - | Description needed | Standard field usage |
| `registered_address` | JSONB | ✓ | Description needed | Standard field usage |
| `correspondence_address` | JSONB | - | Description needed | Standard field usage |
| `contact_numbers` | JSONB | - | Description needed | Standard field usage |
| `email_addresses` | JSONB | - | Description needed | Standard field usage |
| `website` | TEXT | - | Description needed | Standard field usage |
| `financial_year_start` | INTEGER | - | Description needed | Standard field usage |
| `currency_code` | TEXT | - | Description needed | Standard field usage |
| `date_format` | TEXT | - | Description needed | Standard field usage |
| `time_zone` | TEXT | - | Description needed | Standard field usage |
| `subscription_plan` | TEXT | - | Description needed | Standard field usage |
| `subscription_status` | TEXT | - | Description needed | Standard field usage |
| `subscription_valid_until` | DATE | - | Description needed | Standard field usage |
| `user_limit` | INTEGER | - | Description needed | Standard field usage |
| `branch_limit` | INTEGER | - | Description needed | Standard field usage |
| `business_settings` | JSONB | - | Description needed | Standard field usage |
| `feature_flags` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_verified` | BOOLEAN | - | Description needed | Standard field usage |
| `verified_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | UUID | - | Creation audit field | Standard field usage |

---

### 2. org_branches

### org_branches
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_org_branches()`, `api.create_org_branche()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `branch_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_code` | TEXT | ✓ | Description needed | Standard field usage |
| `branch_name` | TEXT | ✓ | Description needed | Standard field usage |
| `branch_type` | TEXT | - | Description needed | Standard field usage |
| `address` | JSONB | ✓ | Description needed | Standard field usage |
| `google_maps_link` | TEXT | - | Description needed | Standard field usage |
| `latitude` | DECIMAL(10 | - | Description needed | Standard field usage |
| `longitude` | DECIMAL(11 | - | Description needed | Standard field usage |
| `branch_phone` | TEXT | - | Description needed | Standard field usage |
| `branch_email` | TEXT | - | Description needed | Standard field usage |
| `branch_manager_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `branch_gst_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_validity` | DATE | - | Description needed | Standard field usage |
| `is_billing_location` | BOOLEAN | - | Description needed | Standard field usage |
| `is_shipping_location` | BOOLEAN | - | Description needed | Standard field usage |
| `is_default_location` | BOOLEAN | - | Description needed | Standard field usage |
| `storage_capacity` | JSONB | - | Description needed | Standard field usage |
| `working_hours` | JSONB | - | Description needed | Standard field usage |
| `holidays` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `operational_since` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 3. org_users

### org_users
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_org_users()`, `api.create_org_user()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `user_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `auth_user_id` | UUID | - | Reference to related entity | Association/lookup |
| `username` | TEXT | ✓ | Description needed | Standard field usage |
| `email` | TEXT | ✓ | Description needed | Standard field usage |
| `mobile_number` | TEXT | ✓ | Description needed | Standard field usage |
| `employee_code` | TEXT | - | Description needed | Standard field usage |
| `first_name` | TEXT | ✓ | Description needed | Standard field usage |
| `last_name` | TEXT | - | Description needed | Standard field usage |
| `full_name` | TEXT | - | Description needed | Standard field usage |
| `role_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `is_admin` | BOOLEAN | - | Description needed | Standard field usage |
| `permissions` | JSONB | - | Description needed | Standard field usage |
| `branch_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `department_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `reporting_to_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `last_login` | TIMESTAMP | - | Description needed | Standard field usage |
| `login_count` | INTEGER | - | Description needed | Standard field usage |
| `failed_login_attempts` | INTEGER | - | Description needed | Standard field usage |
| `locked_until` | TIMESTAMP | - | Description needed | Standard field usage |
| `ui_preferences` | JSONB | - | Description needed | Standard field usage |
| `notification_preferences` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_online` | BOOLEAN | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `reporting_to_id` → `master.org_users.user_id`

---

### 4. roles

### roles
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_roles()`, `api.create_role()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `role_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `role_code` | TEXT | ✓ | Description needed | Standard field usage |
| `role_name` | TEXT | ✓ | Description needed | Standard field usage |
| `role_description` | TEXT | - | Description needed | Standard field usage |
| `parent_role_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `role_level` | INTEGER | - | Description needed | Standard field usage |
| `permissions` | JSONB | - | Description needed | Standard field usage |
| `allowed_modules` | TEXT[] | - | Description needed | Standard field usage |
| `restricted_features` | TEXT[] | - | Description needed | Standard field usage |
| `data_access_level` | TEXT | - | Description needed | Standard field usage |
| `is_system_role` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_role_id` → `master.roles.role_id`

---

### 5. departments

### departments
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_departments()`, `api.create_department()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `department_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `department_code` | TEXT | ✓ | Description needed | Standard field usage |
| `department_name` | TEXT | ✓ | Description needed | Standard field usage |
| `department_type` | TEXT | - | Description needed | Standard field usage |
| `parent_department_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `department_head_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `cost_center_code` | TEXT | - | Description needed | Standard field usage |
| `budget_allocated` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_department_id` → `master.departments.department_id`
- `department_head_id` → `master.org_users.user_id`

---

### 6. org_bank_accounts

### org_bank_accounts
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_org_bank_accounts()`, `api.create_org_bank_account()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `bank_account_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `account_name` | TEXT | ✓ | Description needed | Standard field usage |
| `account_number` | TEXT | ✓ | Description needed | Standard field usage |
| `account_type` | TEXT | ✓ | Description needed | Standard field usage |
| `bank_name` | TEXT | ✓ | Description needed | Standard field usage |
| `branch_name` | TEXT | ✓ | Description needed | Standard field usage |
| `ifsc_code` | TEXT | ✓ | Description needed | Standard field usage |
| `swift_code` | TEXT | - | Description needed | Standard field usage |
| `bank_address` | JSONB | - | Description needed | Standard field usage |
| `bank_contact_number` | TEXT | - | Description needed | Standard field usage |
| `relationship_manager` | TEXT | - | Description needed | Standard field usage |
| `currency_code` | TEXT | - | Description needed | Standard field usage |
| `overdraft_limit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_default_account` | BOOLEAN | - | Description needed | Standard field usage |
| `is_payment_account` | BOOLEAN | - | Description needed | Standard field usage |
| `is_receipt_account` | BOOLEAN | - | Description needed | Standard field usage |
| `last_reconciled_date` | DATE | - | Description needed | Standard field usage |
| `last_statement_date` | DATE | - | Description needed | Standard field usage |
| `current_balance` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `account_opened_date` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`

---

### 7. addresses

### addresses
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_addresses()`, `api.create_addresse()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `address_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `entity_type` | TEXT | ✓ | Description needed | Standard field usage |
| `entity_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `address_type` | TEXT | ✓ | Description needed | Standard field usage |
| `address_line1` | TEXT | ✓ | Description needed | Standard field usage |
| `address_line2` | TEXT | - | Description needed | Standard field usage |
| `landmark` | TEXT | - | Description needed | Standard field usage |
| `city` | TEXT | ✓ | Description needed | Standard field usage |
| `state_code` | TEXT | ✓ | Description needed | Standard field usage |
| `state_name` | TEXT | ✓ | Description needed | Standard field usage |
| `country` | TEXT | - | Description needed | Standard field usage |
| `pincode` | TEXT | ✓ | Description needed | Standard field usage |
| `latitude` | DECIMAL(10 | - | Description needed | Standard field usage |
| `longitude` | DECIMAL(11 | - | Description needed | Standard field usage |
| `google_plus_code` | TEXT | - | Description needed | Standard field usage |
| `contact_person` | TEXT | - | Description needed | Standard field usage |
| `contact_number` | TEXT | - | Description needed | Standard field usage |
| `contact_email` | TEXT | - | Description needed | Standard field usage |
| `delivery_instructions` | TEXT | - | Description needed | Standard field usage |
| `is_default` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 8. employees

### employees
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_employees()`, `api.create_employee()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `employee_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `user_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `employee_code` | TEXT | ✓ | Description needed | Standard field usage |
| `first_name` | TEXT | ✓ | Description needed | Standard field usage |
| `last_name` | TEXT | - | Description needed | Standard field usage |
| `full_name` | TEXT | - | Description needed | Standard field usage |
| `date_of_birth` | DATE | - | Description needed | Standard field usage |
| `gender` | TEXT | - | Description needed | Standard field usage |
| `marital_status` | TEXT | - | Description needed | Standard field usage |
| `blood_group` | TEXT | - | Description needed | Standard field usage |
| `personal_email` | TEXT | - | Description needed | Standard field usage |
| `personal_mobile` | TEXT | ✓ | Description needed | Standard field usage |
| `emergency_contact` | JSONB | - | Description needed | Standard field usage |
| `permanent_address` | JSONB | - | Description needed | Standard field usage |
| `current_address` | JSONB | - | Description needed | Standard field usage |
| `designation` | TEXT | ✓ | Description needed | Standard field usage |
| `department_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `joining_date` | DATE | ✓ | Description needed | Standard field usage |
| `probation_end_date` | DATE | - | Description needed | Standard field usage |
| `confirmation_date` | DATE | - | Description needed | Standard field usage |
| `pan_number` | TEXT | - | Description needed | Standard field usage |
| `aadhar_number` | TEXT | - | Description needed | Standard field usage |
| `driving_license` | TEXT | - | Description needed | Standard field usage |
| `passport_number` | TEXT | - | Description needed | Standard field usage |
| `bank_account_details` | JSONB | - | Description needed | Standard field usage |
| `employment_status` | TEXT | - | Description needed | Standard field usage |
| `resignation_date` | DATE | - | Description needed | Standard field usage |
| `last_working_date` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `user_id` → `master.org_users.user_id`
- `department_id` → `master.departments.department_id`
- `branch_id` → `master.org_branches.branch_id`

---

### 9. doctors

### doctors
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_doctors()`, `api.create_doctor()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `doctor_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `doctor_code` | TEXT | ✓ | Description needed | Standard field usage |
| `doctor_name` | TEXT | ✓ | Description needed | Standard field usage |
| `qualification` | TEXT | - | Description needed | Standard field usage |
| `specialization` | TEXT | - | Description needed | Standard field usage |
| `registration_number` | TEXT | - | Description needed | Standard field usage |
| `clinic_name` | TEXT | - | Description needed | Standard field usage |
| `clinic_address` | JSONB | - | Description needed | Standard field usage |
| `phone_numbers` | TEXT[] | - | Description needed | Standard field usage |
| `email` | TEXT | - | Description needed | Standard field usage |
| `years_of_practice` | INTEGER | - | Description needed | Standard field usage |
| `associated_hospitals` | TEXT[] | - | Description needed | Standard field usage |
| `commission_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `credit_limit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payment_terms_days` | INTEGER | - | Description needed | Standard field usage |
| `preferred_brands` | TEXT[] | - | Description needed | Standard field usage |
| `prescription_pattern` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `blacklisted` | BOOLEAN | - | Description needed | Standard field usage |
| `blacklist_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 10. number_series

### number_series
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_number_series()`, `api.create_number_serie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `series_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `document_type` | TEXT | ✓ | Description needed | Standard field usage |
| `series_code` | TEXT | ✓ | Description needed | Standard field usage |
| `series_description` | TEXT | - | Description needed | Standard field usage |
| `prefix` | TEXT | - | Description needed | Standard field usage |
| `suffix` | TEXT | - | Description needed | Standard field usage |
| `separator` | TEXT | - | Description needed | Standard field usage |
| `current_number` | INTEGER | - | Description needed | Standard field usage |
| `start_number` | INTEGER | - | Description needed | Standard field usage |
| `increment_by` | INTEGER | - | Description needed | Standard field usage |
| `reset_frequency` | TEXT | - | Description needed | Standard field usage |
| `last_reset_date` | DATE | - | Description needed | Standard field usage |
| `preview_format` | TEXT | - | Description needed | Standard field usage |
| `is_default` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`

---

### 11. currencies

### currencies
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_currencies()`, `api.create_currencie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `currency_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `currency_code` | TEXT | ✓ | Description needed | Standard field usage |
| `currency_name` | TEXT | ✓ | Description needed | Standard field usage |
| `currency_symbol` | TEXT | ✓ | Description needed | Standard field usage |
| `decimal_places` | INTEGER | - | Description needed | Standard field usage |
| `decimal_separator` | TEXT | - | Description needed | Standard field usage |
| `thousand_separator` | TEXT | - | Description needed | Standard field usage |
| `symbol_position` | TEXT | - | Description needed | Standard field usage |
| `format_pattern` | TEXT | - | Description needed | Standard field usage |
| `is_base_currency` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

---

### 12. exchange_rates

### exchange_rates
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_exchange_rates()`, `api.create_exchange_rate()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `rate_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `from_currency_code` | TEXT | ✓ | Description needed | Standard field usage |
| `to_currency_code` | TEXT | ✓ | Description needed | Standard field usage |
| `exchange_rate` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `inverse_rate` | NUMERIC(15 | - | Description needed | Standard field usage |
| `effective_from` | DATE | ✓ | Description needed | Standard field usage |
| `effective_until` | DATE | - | Description needed | Standard field usage |
| `rate_source` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---
