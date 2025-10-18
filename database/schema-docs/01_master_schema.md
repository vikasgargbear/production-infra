# Master Schema Documentation

**Schema:** `master`
**Purpose:** Core master data and system configuration
**Last Updated:** 2025-10-16
**Tables:** 14

---

## Overview

The `master` schema contains fundamental organizational data, user management, and system configuration tables that form the foundation of the multi-tenant application.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Columns |
|---|-------|---------|-------------|-------------|
| 1 | organizations | Organization/tenant master | org_id (UUID) | org_code, org_name, gst_number |
| 2 | org_branches | Branch/location management | branch_id | org_id, branch_code, branch_name |
| 3 | branches | ⚠️ Review: May be duplicate of org_branches | branch_id | TBD |
| 4 | org_users | User accounts & authentication | user_id | org_id, username, email, role_id |
| 5 | roles | Role-based access control | role_id | org_id, role_code, permissions |
| 6 | departments | Department hierarchy | department_id | org_id, parent_department_id |
| 7 | org_bank_accounts | Bank account management | account_id | org_id, account_number, ifsc_code |
| 8 | addresses | Address management (polymorphic) | address_id | org_id, entity_type, entity_id |
| 9 | employees | Employee master data | employee_id | org_id, employee_code, department_id |
| 10 | doctors | Doctor/prescriber registration | doctor_id | org_id, license_number |
| 11 | number_series | Document numbering config | series_id | org_id, document_type, next_number |
| 12 | currencies | Currency master | currency_id | currency_code, symbol |
| 13 | exchange_rates | Exchange rate tracking | rate_id | org_id, from_currency, to_currency |
| 14 | system_settings | NEW: Per-org configuration | setting_id | org_id, setting_key, setting_value |

---

## Detailed Table Structures

### 1. organizations
**Root table for multi-tenant architecture**

**Key Columns:**
- `org_id` (uuid, PK) - Tenant identifier
- `org_code` (text, UNIQUE) - Unique organization code
- `org_name` (text) - Display name
- `legal_name` (text) - Legal registered name
- `business_type` (text) - Default: 'pharmaceutical_distributor'
- `gst_number` (text, UNIQUE) - GST registration
- `pan_number` (text) - PAN card number
- `drug_license_number` (text) - Pharma license
- `registered_address` (jsonb) - Office address
- `subscription_plan` (text) - SaaS plan type
- `subscription_status` (text) - active/inactive/expired
- `user_limit` (int) - Max users (default: 10)
- `branch_limit` (int) - Max branches (default: 1)
- `feature_flags` (jsonb) - Enabled features
- `is_active` (boolean) - Organization status

**Constraints:**
- GST format: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- PAN format: `^[A-Z]{5}[0-9]{4}[A-Z]{1}$`

**Referenced by:** 80+ tables across all schemas

---

### 2. org_branches
**Branch/location management**

**Key Columns:**
- `branch_id` (serial, PK)
- `org_id` (uuid, FK)
- `branch_code` (text) - Unique per org
- `branch_name` (text)
- `branch_type` (text) - head_office/warehouse/retail
- `state_id` (int) - For GST determination
- `gstin` (text) - Branch-specific GSTIN
- `drug_license_number` (text)
- `manager_id` (int)
- `is_active` (boolean)

**Used for:**
- Multi-location inventory
- GST type determination (CGST/SGST vs IGST)
- Branch-wise reporting

---

### 3. branches
⚠️ **NEEDS REVIEW:** Possible duplicate of `org_branches`. Investigate and consolidate if redundant.

---

### 4. org_users
**User authentication and access control**

**Key Columns:**
- `user_id` (serial, PK)
- `org_id` (uuid, FK)
- `username` (text, UNIQUE per org)
- `email` (text, UNIQUE)
- `password_hash` (text)
- `full_name` (text)
- `role_id` (int, FK) - Links to roles table
- `employee_id` (int) - Optional link to employees
- `branch_id` (int) - Default branch
- `is_active` (boolean)
- `last_login_at` (timestamptz)

**Authentication Flow:**
1. User logs in with username/password
2. Backend verifies credentials
3. JWT token issued with `org_id`, `user_id`, `role_id`
4. All API calls use `get_org_id_secure()` from JWT

---

### 5. roles
**Role-based access control (RBAC)**

**Key Columns:**
- `role_id` (serial, PK)
- `org_id` (uuid, FK)
- `role_code` (text, UNIQUE per org)
- `role_name` (text)
- `permissions` (jsonb) - Feature/module access flags
- `is_system_role` (boolean) - System vs custom role
- `is_active` (boolean)

**Common Roles:**
- admin - Full access
- manager - Department/branch management
- accountant - Financial operations
- sales_person - Sales operations
- warehouse_keeper - Inventory operations

---

### 6. departments
**Organizational hierarchy**

**Key Columns:**
- `department_id` (serial, PK)
- `org_id` (uuid, FK)
- `parent_department_id` (int) - For nested hierarchy
- `department_code` (text)
- `department_name` (text)
- `manager_id` (int) - Employee reference
- `cost_center` (text)

**Used for:**
- Organizational structure
- Cost allocation
- Reporting hierarchy

---

### 7. org_bank_accounts
**Bank account management**

**Key Columns:**
- `account_id` (serial, PK)
- `org_id` (uuid, FK)
- `branch_id` (int) - Optional branch link
- `bank_name` (text)
- `account_number` (text)
- `account_type` (text) - savings/current/od
- `ifsc_code` (text)
- `swift_code` (text) - For international
- `is_primary` (boolean)

**Used for:**
- Payment processing
- Bank reconciliation
- Financial reporting

---

### 8. addresses
**Polymorphic address storage**

**Key Columns:**
- `address_id` (serial, PK)
- `org_id` (uuid, FK)
- `entity_type` (text) - customer/supplier/branch/employee
- `entity_id` (int) - ID in respective table
- `address_type` (text) - billing/shipping/registered
- `state_id` (int) - For GST calculations
- `gstin` (text) - Address-specific GSTIN
- `is_default` (boolean)

**GST Usage:**
- Determines CGST/SGST vs IGST
- Validates state-wise GST compliance

---

### 9. employees
**Employee master data**

**Key Columns:**
- `employee_id` (serial, PK)
- `org_id` (uuid, FK)
- `employee_code` (text)
- `employee_name` (text)
- `designation` (text)
- `department_id` (int, FK)
- `branch_id` (int, FK)
- `date_of_joining` (date)
- `emergency_contact` (jsonb)
- `bank_account_details` (jsonb)
- `is_active` (boolean)

**Links to:**
- org_users (user account)
- departments (reporting)
- branches (work location)

---

### 10. doctors
**Doctor/prescriber registration (Pharma-specific)**

**Key Columns:**
- `doctor_id` (serial, PK)
- `org_id` (uuid, FK)
- `doctor_name` (text)
- `license_number` (text)
- `specialization` (text)
- `hospital_name` (text)
- `phone`, `email` (text)

**Used for:**
- Prescription tracking
- Doctor-wise sales analysis
- Compliance reporting

---

### 11. number_series
**Document numbering configuration**

**Key Columns:**
- `series_id` (serial, PK)
- `org_id` (uuid, FK)
- `document_type` (text) - invoice/order/grn/challan
- `prefix` (text) - e.g., "INV"
- `next_number` (int) - Auto-increment
- `padding_length` (int) - Zero padding
- `year_reset` (boolean) - Reset on FY change

**Example:** `INV-2025-00123`

**Note:** New implementation uses `SimpleNumberGenerator` (backend/app/api/services/simple_number_generator.py) which is timestamp-based and doesn't require database lookups.

---

### 12. currencies
**Multi-currency support**

**Key Columns:**
- `currency_id` (serial, PK)
- `currency_code` (text) - INR/USD/EUR
- `currency_name` (text)
- `symbol` (text) - ₹/$/ €
- `decimal_places` (int) - Precision

---

### 13. exchange_rates
**Currency conversion rates**

**Key Columns:**
- `rate_id` (serial, PK)
- `org_id` (uuid, FK)
- `from_currency`, `to_currency` (text)
- `exchange_rate` (numeric)
- `effective_date`, `valid_until` (date)

---

### 14. system_settings
**⭐ NEW: Per-organization configuration**

**Key Columns:**
- `setting_id` (serial, PK)
- `org_id` (uuid, FK)
- `setting_key` (text)
- `setting_value` (jsonb)
- `setting_type` (text)
- `is_editable` (boolean)

**Purpose:** Org-specific feature flags, preferences, configuration

---

## Multi-Tenant Architecture

### RLS (Row-Level Security):
- **Enabled:** All tables (Section 27 of MASTER_DATABASE_FIXES.sql)
- **Policy:** `org_id = get_current_org_id()`
- **Middleware:** `backend/app/middleware/rls_middleware.py`

### JWT Authentication:
- **Function:** `get_org_id_secure()` in `backend/app/core/secure_auth.py`
- **Source:** Extracts `org_id` from JWT token
- **Security:** Client cannot fake org_id (server-side validation)

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [MASTER_DATABASE_FIXES.sql](../MASTER_DATABASE_FIXES.sql) - Schema fixes
- [ORG_ID_STRATEGY.md](../../docs/architecture/ORG_ID_STRATEGY.md) - Multi-tenant design
- [SECURITY_AUDIT_REPORT.md](../../SECURITY_AUDIT_REPORT.md) - Security analysis

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 14 (+2 from previous documentation)
