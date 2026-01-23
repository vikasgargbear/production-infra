# Master Schema

Core system configuration, organizations, users, and addresses.

**Schema**: `master`
**Tables**: 13

---

### master.addresses

| Column | Type | Nullable |
|--------|------|----------|
| `address_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `entity_type` | text | NOT NULL |
| `entity_id` | integer | NOT NULL |
| `address_type` | text | NOT NULL |
| `address_line1` | text | NOT NULL |
| `address_line2` | text | NULL |
| `landmark` | text | NULL |
| `city` | text | NOT NULL |
| `state_code` | text | NOT NULL |
| `state_name` | text | NOT NULL |
| `country` | text | NULL |
| `pincode` | text | NOT NULL |
| `latitude` | numeric | NULL |
| `longitude` | numeric | NULL |
| `google_plus_code` | text | NULL |
| `contact_person` | text | NULL |
| `contact_number` | text | NULL |
| `contact_email` | text | NULL |
| `delivery_instructions` | text | NULL |
| `is_default` | boolean | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.currencies

| Column | Type | Nullable |
|--------|------|----------|
| `currency_id` | integer | NOT NULL |
| `currency_code` | text | NOT NULL |
| `currency_name` | text | NOT NULL |
| `currency_symbol` | text | NOT NULL |
| `decimal_places` | integer | NULL |
| `decimal_separator` | text | NULL |
| `thousand_separator` | text | NULL |
| `symbol_position` | text | NULL |
| `format_pattern` | text | NULL |
| `is_base_currency` | boolean | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |

### master.departments

| Column | Type | Nullable |
|--------|------|----------|
| `department_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `department_code` | text | NOT NULL |
| `department_name` | text | NOT NULL |
| `department_type` | text | NULL |
| `parent_department_id` | integer | NULL |
| `department_head_id` | integer | NULL |
| `cost_center_code` | text | NULL |
| `budget_allocated` | numeric | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.doctors

| Column | Type | Nullable |
|--------|------|----------|
| `doctor_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `doctor_code` | text | NOT NULL |
| `doctor_name` | text | NOT NULL |
| `qualification` | text | NULL |
| `specialization` | text | NULL |
| `registration_number` | text | NULL |
| `clinic_name` | text | NULL |
| `clinic_address` | jsonb | NULL |
| `phone_numbers` | ARRAY | NULL |
| `email` | text | NULL |
| `years_of_practice` | integer | NULL |
| `associated_hospitals` | ARRAY | NULL |
| `commission_rate` | numeric | NULL |
| `credit_limit` | numeric | NULL |
| `payment_terms_days` | integer | NULL |
| `preferred_brands` | ARRAY | NULL |
| `prescription_pattern` | jsonb | NULL |
| `is_active` | boolean | NULL |
| `blacklisted` | boolean | NULL |
| `blacklist_reason` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.employees

| Column | Type | Nullable |
|--------|------|----------|
| `employee_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `user_id` | integer | NULL |
| `employee_code` | text | NOT NULL |
| `first_name` | text | NOT NULL |
| `last_name` | text | NULL |
| `full_name` | text | NULL |
| `date_of_birth` | date | NULL |
| `gender` | text | NULL |
| `marital_status` | text | NULL |
| `blood_group` | text | NULL |
| `personal_email` | text | NULL |
| `personal_mobile` | text | NOT NULL |
| `emergency_contact` | jsonb | NULL |
| `permanent_address` | jsonb | NULL |
| `current_address` | jsonb | NULL |
| `designation` | text | NOT NULL |
| `department_id` | integer | NULL |
| `branch_id` | integer | NULL |
| `joining_date` | date | NOT NULL |
| `probation_end_date` | date | NULL |
| `confirmation_date` | date | NULL |
| `pan_number` | text | NULL |
| `aadhar_number` | text | NULL |
| `driving_license` | text | NULL |
| `passport_number` | text | NULL |
| `bank_account_details` | jsonb | NULL |
| `employment_status` | text | NULL |
| `resignation_date` | date | NULL |
| `last_working_date` | date | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.exchange_rates

| Column | Type | Nullable |
|--------|------|----------|
| `rate_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `from_currency_code` | text | NOT NULL |
| `to_currency_code` | text | NOT NULL |
| `exchange_rate` | numeric | NOT NULL |
| `inverse_rate` | numeric | NULL |
| `effective_from` | date | NOT NULL |
| `effective_until` | date | NULL |
| `rate_source` | text | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `created_by` | integer | NULL |

### master.number_series

| Column | Type | Nullable |
|--------|------|----------|
| `series_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `branch_id` | integer | NULL |
| `document_type` | text | NOT NULL |
| `series_code` | text | NOT NULL |
| `series_description` | text | NULL |
| `prefix` | text | NULL |
| `suffix` | text | NULL |
| `separator` | text | NULL |
| `current_number` | integer | NOT NULL |
| `start_number` | integer | NOT NULL |
| `increment_by` | integer | NOT NULL |
| `reset_frequency` | text | NULL |
| `last_reset_date` | date | NULL |
| `preview_format` | text | NULL |
| `is_default` | boolean | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.org_bank_accounts

| Column | Type | Nullable |
|--------|------|----------|
| `bank_account_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `branch_id` | integer | NULL |
| `account_name` | text | NOT NULL |
| `account_number` | text | NOT NULL |
| `account_type` | text | NOT NULL |
| `bank_name` | text | NOT NULL |
| `branch_name` | text | NOT NULL |
| `ifsc_code` | text | NOT NULL |
| `swift_code` | text | NULL |
| `bank_address` | jsonb | NULL |
| `bank_contact_number` | text | NULL |
| `relationship_manager` | text | NULL |
| `currency_code` | text | NULL |
| `overdraft_limit` | numeric | NULL |
| `is_default_account` | boolean | NULL |
| `is_payment_account` | boolean | NULL |
| `is_receipt_account` | boolean | NULL |
| `last_reconciled_date` | date | NULL |
| `last_statement_date` | date | NULL |
| `current_balance` | numeric | NULL |
| `is_active` | boolean | NULL |
| `account_opened_date` | date | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.org_branches

| Column | Type | Nullable |
|--------|------|----------|
| `branch_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `branch_code` | text | NOT NULL |
| `branch_name` | text | NOT NULL |
| `branch_type` | text | NOT NULL |
| `address` | jsonb | NOT NULL |
| `google_maps_link` | text | NULL |
| `latitude` | numeric | NULL |
| `longitude` | numeric | NULL |
| `branch_phone` | text | NULL |
| `branch_email` | text | NULL |
| `branch_manager_id` | integer | NULL |
| `branch_gst_number` | text | NULL |
| `drug_license_number` | text | NULL |
| `drug_license_validity` | date | NULL |
| `is_billing_location` | boolean | NULL |
| `is_shipping_location` | boolean | NULL |
| `is_default_location` | boolean | NULL |
| `storage_capacity` | jsonb | NULL |
| `working_hours` | jsonb | NULL |
| `holidays` | jsonb | NULL |
| `is_active` | boolean | NULL |
| `operational_since` | date | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.org_users

| Column | Type | Nullable |
|--------|------|----------|
| `user_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `auth_user_id` | uuid | NULL |
| `username` | text | NOT NULL |
| `email` | text | NOT NULL |
| `mobile_number` | text | NOT NULL |
| `employee_code` | text | NULL |
| `first_name` | text | NOT NULL |
| `last_name` | text | NULL |
| `full_name` | text | NULL |
| `role_id` | integer | NULL |
| `is_admin` | boolean | NULL |
| `permissions` | jsonb | NULL |
| `branch_ids` | ARRAY | NULL |
| `department_id` | integer | NULL |
| `reporting_to_id` | integer | NULL |
| `last_login` | timestamp with time zone | NULL |
| `login_count` | integer | NULL |
| `failed_login_attempts` | integer | NULL |
| `locked_until` | timestamp with time zone | NULL |
| `ui_preferences` | jsonb | NULL |
| `notification_preferences` | jsonb | NULL |
| `is_active` | boolean | NULL |
| `is_online` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NULL |
| `password_hash` | text | NULL |

### master.organizations

| Column | Type | Nullable |
|--------|------|----------|
| `org_id` | uuid | NOT NULL |
| `org_code` | text | NOT NULL |
| `org_name` | text | NOT NULL |
| `legal_name` | text | NOT NULL |
| `business_type` | text | NOT NULL |
| `establishment_date` | date | NULL |
| `gst_number` | text | NULL |
| `pan_number` | text | NULL |
| `drug_license_number` | text | NULL |
| `drug_license_validity` | date | NULL |
| `fssai_number` | text | NULL |
| `registered_address` | jsonb | NOT NULL |
| `correspondence_address` | jsonb | NULL |
| `contact_numbers` | jsonb | NULL |
| `email_addresses` | jsonb | NULL |
| `website` | text | NULL |
| `financial_year_start` | integer | NULL |
| `currency_code` | text | NULL |
| `date_format` | text | NULL |
| `time_zone` | text | NULL |
| `subscription_plan` | text | NULL |
| `subscription_status` | text | NULL |
| `subscription_valid_until` | date | NULL |
| `user_limit` | integer | NULL |
| `branch_limit` | integer | NULL |
| `business_settings` | jsonb | NULL |
| `feature_flags` | jsonb | NULL |
| `is_active` | boolean | NULL |
| `is_verified` | boolean | NULL |
| `verified_at` | timestamp with time zone | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | uuid | NULL |

### master.roles

| Column | Type | Nullable |
|--------|------|----------|
| `role_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `role_code` | text | NOT NULL |
| `role_name` | text | NOT NULL |
| `role_description` | text | NULL |
| `parent_role_id` | integer | NULL |
| `role_level` | integer | NOT NULL |
| `permissions` | jsonb | NOT NULL |
| `allowed_modules` | ARRAY | NULL |
| `restricted_features` | ARRAY | NULL |
| `data_access_level` | text | NULL |
| `is_system_role` | boolean | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### master.system_settings

| Column | Type | Nullable |
|--------|------|----------|
| `setting_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `setting_category` | text | NOT NULL |
| `setting_key` | text | NOT NULL |
| `setting_value` | text | NOT NULL |
| `setting_type` | text | NOT NULL |
| `description` | text | NULL |
| `is_active` | boolean | NULL |
| `created_by` | integer | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

---

**Generated from live database**: `https://pharma-backend-production-0c09.up.railway.app/api/schema/master`
