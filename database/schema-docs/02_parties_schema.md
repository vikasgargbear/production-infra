# Parties Schema Documentation

## Overview
The `parties` schema manages customers, suppliers, and business relationships. This is critical for sales, procurement, and business partner management.

---

## Tables

### 1. customers

### customers
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customers()`, `api.create_customer()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `customer_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `customer_code` | TEXT | ✓ | Description needed | Standard field usage |
| `customer_name` | TEXT | ✓ | Description needed | Standard field usage |
| `customer_type` | TEXT | ✓ | Description needed | Standard field usage |
| `primary_phone` | TEXT | ✓ | Description needed | Standard field usage |
| `primary_email` | TEXT | - | Description needed | Standard field usage |
| `secondary_phone` | TEXT | - | Description needed | Standard field usage |
| `whatsapp_number` | TEXT | - | Description needed | Standard field usage |
| `contact_person_name` | TEXT | - | Description needed | Standard field usage |
| `contact_person_phone` | TEXT | - | Description needed | Standard field usage |
| `contact_person_email` | TEXT | - | Description needed | Standard field usage |
| `gst_number` | TEXT | - | Description needed | Standard field usage |
| `pan_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_validity` | DATE | - | Description needed | Standard field usage |
| `fssai_number` | TEXT | - | Description needed | Standard field usage |
| `establishment_year` | INTEGER | - | Description needed | Standard field usage |
| `business_type` | TEXT | - | Description needed | Standard field usage |
| `credit_limit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `current_outstanding` | NUMERIC(15 | - | Description needed | Standard field usage |
| `credit_days` | INTEGER | - | Description needed | Standard field usage |
| `credit_rating` | TEXT | - | Description needed | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `security_deposit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `overdue_interest_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `customer_category` | TEXT | - | Description needed | Standard field usage |
| `customer_grade` | TEXT | - | Description needed | Standard field usage |
| `territory_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `route_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `area_code` | TEXT | - | Description needed | Standard field usage |
| `assigned_salesperson_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `price_list_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `discount_group_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `kyc_status` | TEXT | - | Description needed | Standard field usage |
| `kyc_verified_date` | DATE | - | Description needed | Standard field usage |
| `kyc_documents` | JSONB | - | Description needed | Standard field usage |
| `preferred_payment_mode` | TEXT | - | Description needed | Standard field usage |
| `preferred_delivery_time` | TEXT | - | Description needed | Standard field usage |
| `prefer_sms` | BOOLEAN | - | Description needed | Standard field usage |
| `prefer_email` | BOOLEAN | - | Description needed | Standard field usage |
| `prefer_whatsapp` | BOOLEAN | - | Description needed | Standard field usage |
| `first_transaction_date` | DATE | - | Description needed | Standard field usage |
| `last_transaction_date` | DATE | - | Description needed | Standard field usage |
| `total_business_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_transactions` | INTEGER | - | Description needed | Standard field usage |
| `average_order_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `blacklisted` | BOOLEAN | - | Description needed | Standard field usage |
| `blacklist_reason` | TEXT | - | Description needed | Standard field usage |
| `blacklist_date` | DATE | - | Description needed | Standard field usage |
| `loyalty_points` | NUMERIC(15 | - | Description needed | Standard field usage |
| `loyalty_tier` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |
| `gst_number` | IS | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `assigned_salesperson_id` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 2. suppliers

### suppliers
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_suppliers()`, `api.create_supplier()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `supplier_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `supplier_code` | TEXT | ✓ | Description needed | Standard field usage |
| `supplier_name` | TEXT | ✓ | Description needed | Standard field usage |
| `supplier_type` | TEXT | ✓ | Description needed | Standard field usage |
| `primary_phone` | TEXT | ✓ | Description needed | Standard field usage |
| `primary_email` | TEXT | - | Description needed | Standard field usage |
| `secondary_phone` | TEXT | - | Description needed | Standard field usage |
| `contact_person_name` | TEXT | - | Description needed | Standard field usage |
| `contact_person_phone` | TEXT | - | Description needed | Standard field usage |
| `gst_number` | TEXT | - | Description needed | Standard field usage |
| `pan_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_number` | TEXT | - | Description needed | Standard field usage |
| `drug_license_validity` | DATE | - | Description needed | Standard field usage |
| `establishment_year` | INTEGER | - | Description needed | Standard field usage |
| `payment_days` | INTEGER | - | Description needed | Standard field usage |
| `preferred_payment_mode` | TEXT | - | Description needed | Standard field usage |
| `early_payment_discount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `late_payment_penalty` | NUMERIC(5 | - | Description needed | Standard field usage |
| `supplier_category` | TEXT | - | Description needed | Standard field usage |
| `supplier_grade` | TEXT | - | Description needed | Standard field usage |
| `product_categories` | TEXT[] | - | Description needed | Standard field usage |
| `brand_authorizations` | TEXT[] | - | Description needed | Standard field usage |
| `compliance_rating` | TEXT | - | Description needed | Standard field usage |
| `quality_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `delivery_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `vendor_documents` | JSONB | - | Description needed | Standard field usage |
| `bank_name` | TEXT | - | Description needed | Standard field usage |
| `account_number` | TEXT | - | Description needed | Standard field usage |
| `ifsc_code` | TEXT | - | Description needed | Standard field usage |
| `account_type` | TEXT | - | Description needed | Standard field usage |
| `account_holder_name` | TEXT | - | Description needed | Standard field usage |
| `credit_limit_given` | NUMERIC(15 | - | Description needed | Standard field usage |
| `current_outstanding` | NUMERIC(15 | - | Description needed | Standard field usage |
| `first_purchase_date` | DATE | - | Description needed | Standard field usage |
| `last_purchase_date` | DATE | - | Description needed | Standard field usage |
| `total_purchase_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_purchases` | INTEGER | - | Description needed | Standard field usage |
| `average_order_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `return_rate_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `quality_issue_count` | INTEGER | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_approved` | BOOLEAN | - | Description needed | Standard field usage |
| `approved_date` | DATE | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `blacklisted` | BOOLEAN | - | Description needed | Standard field usage |
| `blacklist_reason` | TEXT | - | Description needed | Standard field usage |
| `blacklist_date` | DATE | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 3. customer_contacts

### customer_contacts
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customer_contacts()`, `api.create_customer_contact()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `contact_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `contact_name` | TEXT | ✓ | Description needed | Standard field usage |
| `designation` | TEXT | - | Description needed | Standard field usage |
| `department` | TEXT | - | Description needed | Standard field usage |
| `mobile_number` | TEXT | - | Description needed | Standard field usage |
| `phone_number` | TEXT | - | Description needed | Standard field usage |
| `email` | TEXT | - | Description needed | Standard field usage |
| `is_primary_contact` | BOOLEAN | - | Description needed | Standard field usage |
| `contact_for` | TEXT[] | - | Description needed | Standard field usage |
| `preferred_contact_time` | TEXT | - | Description needed | Standard field usage |
| `preferred_language` | TEXT | - | Description needed | Standard field usage |
| `date_of_birth` | DATE | - | Description needed | Standard field usage |
| `anniversary_date` | DATE | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `customer_id` → `parties.customers.customer_id`

---

### 4. supplier_contacts

### supplier_contacts
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_supplier_contacts()`, `api.create_supplier_contact()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `contact_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `contact_name` | TEXT | ✓ | Description needed | Standard field usage |
| `designation` | TEXT | - | Description needed | Standard field usage |
| `department` | TEXT | - | Description needed | Standard field usage |
| `mobile_number` | TEXT | - | Description needed | Standard field usage |
| `phone_number` | TEXT | - | Description needed | Standard field usage |
| `email` | TEXT | - | Description needed | Standard field usage |
| `is_primary_contact` | BOOLEAN | - | Description needed | Standard field usage |
| `contact_for` | TEXT[] | - | Description needed | Standard field usage |
| `can_negotiate_prices` | BOOLEAN | - | Description needed | Standard field usage |
| `can_approve_returns` | BOOLEAN | - | Description needed | Standard field usage |
| `max_discount_authority` | NUMERIC(5 | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `supplier_id` → `parties.suppliers.supplier_id`

---

### 5. customer_groups

### customer_groups
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customer_groups()`, `api.create_customer_group()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `group_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `group_code` | TEXT | ✓ | Description needed | Standard field usage |
| `group_name` | TEXT | ✓ | Description needed | Standard field usage |
| `group_type` | TEXT | ✓ | Description needed | Standard field usage |
| `parent_group_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `discount_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `price_list_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `payment_terms_days` | INTEGER | - | Description needed | Standard field usage |
| `credit_limit_multiplier` | NUMERIC(3 | - | Description needed | Standard field usage |
| `eligibility_criteria` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_group_id` → `parties.customer_groups.group_id`

---

### 6. customer_group_members

### customer_group_members
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customer_group_members()`, `api.create_customer_group_member()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `member_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `group_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `joined_date` | DATE | - | Description needed | Standard field usage |
| `expiry_date` | DATE | - | Description needed | Standard field usage |
| `override_discount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `override_credit_limit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `group_id` → `parties.customer_groups.group_id`
- `customer_id` → `parties.customers.customer_id`
- `created_by` → `master.org_users.user_id`

---

### 7. territories

### territories
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_territories()`, `api.create_territorie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `territory_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `territory_code` | TEXT | ✓ | Description needed | Standard field usage |
| `territory_name` | TEXT | ✓ | Description needed | Standard field usage |
| `territory_type` | TEXT | ✓ | Description needed | Standard field usage |
| `parent_territory_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `territory_path` | TEXT | - | Description needed | Standard field usage |
| `geographic_data` | JSONB | - | Description needed | Standard field usage |
| `territory_manager_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `sales_team_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `monthly_target` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quarterly_target` | NUMERIC(15 | - | Description needed | Standard field usage |
| `annual_target` | NUMERIC(15 | - | Description needed | Standard field usage |
| `current_month_achievement` | NUMERIC(15 | - | Description needed | Standard field usage |
| `current_quarter_achievement` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_territory_id` → `parties.territories.territory_id`
- `territory_manager_id` → `master.org_users.user_id`

---

### 8. routes

### routes
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_routes()`, `api.create_route()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `route_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `territory_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `route_code` | TEXT | ✓ | Description needed | Standard field usage |
| `route_name` | TEXT | ✓ | Description needed | Standard field usage |
| `route_type` | TEXT | ✓ | Description needed | Standard field usage |
| `visit_days` | TEXT[] | - | Description needed | Standard field usage |
| `visit_frequency` | TEXT | - | Description needed | Standard field usage |
| `assigned_to_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `vehicle_required` | BOOLEAN | - | Description needed | Standard field usage |
| `total_distance_km` | NUMERIC(10 | - | Description needed | Standard field usage |
| `average_time_hours` | NUMERIC(5 | - | Description needed | Standard field usage |
| `customer_count` | INTEGER | - | Description needed | Standard field usage |
| `customer_sequence` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `territory_id` → `parties.territories.territory_id`
- `assigned_to_id` → `master.org_users.user_id`

---
