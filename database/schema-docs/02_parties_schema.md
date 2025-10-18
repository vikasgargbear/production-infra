# Parties Schema Documentation

**Schema:** `parties`
**Purpose:** Customer and supplier master data management
**Last Updated:** 2025-10-16
**Tables:** 8

---

## Overview

The `parties` schema manages all external party relationships including customers, suppliers, their contacts, grouping mechanisms, and geographic/route planning for sales operations.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| 1 | customers | Customer master data | customer_id | 59 columns, full CRM, loyalty, KYC |
| 2 | suppliers | Supplier master data | supplier_id | 53 columns, vendor management, ratings |
| 3 | customer_contacts | Customer contact persons | contact_id | Multi-contact per customer |
| 4 | supplier_contacts | Supplier contact persons | contact_id | Authority levels, negotiation rights |
| 5 | customer_groups | Customer grouping/segmentation | group_id | Discounts, pricing, credit rules |
| 6 | customer_group_members | Group membership mapping | member_id | Individual overrides |
| 7 | territories | Territory/region management | territory_id | Hierarchy, targets, achievement |
| 8 | routes | Delivery route planning | route_id | Visit scheduling, sequencing |

---

## Detailed Table Structures

### 1. customers
**Comprehensive customer master with CRM features**

**Core Information:**
- `customer_id` (serial, PK) - Unique identifier
- `org_id` (uuid, FK) - Organization
- `customer_code` (text, UNIQUE) - Customer code
- `customer_name` (text) - Display name
- `customer_type` (text) - retail/wholesale/hospital/clinic
- `business_type` (text) - Default: 'retail_pharmacy'

**Contact Details:**
- `primary_phone`, `secondary_phone` (text)
- `primary_email` (text)
- `whatsapp_number` (text)
- `contact_person_name`, `contact_person_phone`, `contact_person_email` (text)

**Compliance:**
- `gst_number`, `gstin` (text) - GST registration (validated)
- `pan_number` (text) - PAN card
- `drug_license_number` (text) - Pharma license
- `drug_license_validity` (date)
- `fssai_number` (text)

**Credit Management:**
- `credit_limit` (numeric) - Maximum credit allowed
- `current_outstanding` (numeric) - Current dues
- `credit_days` (int) - Payment terms in days
- `credit_rating` (text) - Default: 'C'
- `payment_terms` (text) - Default: 'Cash'
- `security_deposit` (numeric)
- `overdue_interest_rate` (numeric)

**Sales Assignment:**
- `territory_id` (int, FK) - Geographic territory
- `route_id` (int, FK) - Delivery route
- `assigned_salesperson_id` (int, FK) - Sales rep
- `price_list_id` (int) - Special pricing
- `discount_group_id` (int) - Discount group

**KYC & Verification:**
- `kyc_status` (text) - pending/verified/rejected
- `kyc_verified_date` (date)
- `kyc_documents` (jsonb) - Document storage

**Communication Preferences:**
- `prefer_sms`, `prefer_email`, `prefer_whatsapp` (boolean)
- `preferred_payment_mode` (text)
- `preferred_delivery_time` (text)

**Analytics:**
- `first_transaction_date`, `last_transaction_date` (date)
- `total_business_amount` (numeric)
- `total_transactions` (int)
- `average_order_value` (numeric)

**Loyalty:**
- `loyalty_points` (numeric)
- `loyalty_tier` (text) - bronze/silver/gold/platinum

**Status:**
- `is_active` (boolean) - Active customer
- `blacklisted` (boolean) - Blacklist flag
- `blacklist_reason`, `blacklist_date` (text, date)

**Indexes:**
- Full-text search on name and code
- Phone number lookup
- GST number lookup
- Category/grade filtering
- Credit utilization tracking

**Constraints:**
- GST format validation
- Unique: org_id + customer_code

**RLS Policy:** ✅ Enabled (`org_id = get_current_org_id()`)

---

### 2. suppliers
**Supplier/vendor master with performance tracking**

**Core Information:**
- `supplier_id` (serial, PK)
- `org_id` (uuid, FK)
- `supplier_code` (text, UNIQUE)
- `supplier_name` (text)
- `supplier_type` (text) - manufacturer/distributor/importer
- `website` (text)

**Contact:**
- `primary_phone`, `secondary_phone` (text)
- `primary_email` (text)
- `contact_person_name`, `contact_person_phone` (text)

**Compliance:**
- `gst_number`, `pan_number` (text)
- `drug_license_number` (text)
- `drug_license_validity` (date)

**Payment Terms:**
- `payment_days` (int) - Default: 30
- `preferred_payment_mode` (text) - Default: 'bank_transfer'
- `early_payment_discount` (numeric) - Discount %
- `late_payment_penalty` (numeric) - Penalty %

**Bank Details:**
- `bank_name` (text)
- `account_number` (text)
- `ifsc_code` (text)
- `account_type` (text) - Default: 'current'
- `account_holder_name` (text)

**Categorization:**
- `supplier_category`, `supplier_grade` (text)
- `product_categories` (text[]) - Products supplied
- `brand_authorizations` (text[]) - Authorized brands

**Performance Ratings:**
- `compliance_rating` (text) - Default: 'good'
- `quality_rating` (numeric 0-5)
- `delivery_rating` (numeric 0-5)
- `return_rate_percentage` (numeric)
- `quality_issue_count` (int)

**Financial:**
- `credit_limit_given` (numeric) - Credit we extend to them
- `current_outstanding` (numeric) - Our dues to supplier

**Analytics:**
- `first_purchase_date`, `last_purchase_date` (date)
- `total_purchase_amount` (numeric)
- `total_purchases` (int)
- `average_order_value` (numeric)

**Approval & Status:**
- `is_active` (boolean)
- `is_approved` (boolean) - Vendor approval
- `approved_date`, `approved_by` (date, int)
- `blacklisted` (boolean)
- `blacklist_reason`, `blacklist_date` (text, date)

**Documents:**
- `vendor_documents` (jsonb) - Licenses, certificates

**Indexes:**
- Full-text search on name
- GST lookup
- Category filtering
- Active suppliers index

**RLS Policy:** ✅ Enabled (`org_id = get_current_org_id()`)

---

### 3. customer_contacts
**Multiple contact persons per customer**

**Key Columns:**
- `contact_id` (serial, PK)
- `customer_id` (int, FK) - Parent customer
- `contact_name` (text) - Contact person name
- `designation`, `department` (text)
- `mobile_number`, `phone_number`, `email` (text)
- `is_primary_contact` (boolean) - Main contact flag
- `contact_for` (text[]) - Areas: sales/accounts/orders
- `preferred_contact_time` (text)
- `preferred_language` (text) - Default: 'English'
- `date_of_birth`, `anniversary_date` (date) - For greetings
- `notes` (text)
- `is_active` (boolean)

**Use Cases:**
- Different contacts for different purposes
- Birthday/anniversary reminders
- Personalized communication

**Cascade:** ON DELETE CASCADE (with customer)

---

### 4. supplier_contacts
**Supplier contact persons with authority levels**

**Key Columns:**
- `contact_id` (serial, PK)
- `supplier_id` (int, FK)
- `contact_name` (text)
- `designation`, `department` (text)
- `mobile_number`, `phone_number`, `email` (text)
- `is_primary_contact` (boolean)
- `contact_for` (text[]) - Purchase/returns/technical

**Authority Levels:**
- `can_negotiate_prices` (boolean)
- `can_approve_returns` (boolean)
- `max_discount_authority` (numeric) - Max discount %

**Use Cases:**
- Price negotiations
- Return approvals
- Technical support

**Cascade:** ON DELETE CASCADE (with supplier)

---

### 5. customer_groups
**Customer segmentation and group-based rules**

**Key Columns:**
- `group_id` (serial, PK)
- `org_id` (uuid, FK)
- `group_code` (text, UNIQUE per org)
- `group_name` (text)
- `group_type` (text) - discount/pricing/loyalty/region
- `parent_group_id` (int) - Hierarchical groups

**Rules:**
- `discount_percentage` (numeric) - Group discount
- `price_list_id` (int) - Special price list
- `payment_terms_days` (int) - Payment terms
- `credit_limit_multiplier` (numeric) - Credit multiplier
- `eligibility_criteria` (jsonb) - Auto-enrollment rules

**Use Cases:**
- VIP customers
- Volume-based discounts
- Regional pricing
- Loyalty tiers

**Hierarchy:** Supports parent-child group structure

---

### 6. customer_group_members
**Group membership with individual overrides**

**Key Columns:**
- `member_id` (serial, PK)
- `group_id` (int, FK)
- `customer_id` (int, FK)
- `joined_date` (date) - Default: CURRENT_DATE
- `expiry_date` (date) - Optional membership end

**Overrides:**
- `override_discount` (numeric) - Individual discount
- `override_credit_limit` (numeric) - Individual credit

**Use Cases:**
- Promotional group memberships
- Time-limited special pricing
- Individual exceptions within groups

**Constraint:** UNIQUE (group_id, customer_id)

---

### 7. territories
**Geographic territory management with targets**

**Key Columns:**
- `territory_id` (serial, PK)
- `org_id` (uuid, FK)
- `territory_code` (text, UNIQUE per org)
- `territory_name` (text)
- `territory_type` (text) - state/region/city/zone

**Hierarchy:**
- `parent_territory_id` (int) - Nested territories
- `territory_path` (text) - Breadcrumb path
- `geographic_data` (jsonb) - Coordinates, boundaries

**Management:**
- `territory_manager_id` (int, FK) - Manager
- `sales_team_ids` (int[]) - Sales team members

**Targets:**
- `monthly_target` (numeric)
- `quarterly_target` (numeric)
- `annual_target` (numeric)
- `current_month_achievement` (numeric)
- `current_quarter_achievement` (numeric)

**Use Cases:**
- Sales territory allocation
- Performance tracking
- Commission calculation
- Regional analysis

**Hierarchy Example:**
```
India (Country)
 └─ Maharashtra (State)
     └─ Pune (City)
         ├─ Zone A
         └─ Zone B
```

---

### 8. routes
**Delivery route planning and scheduling**

**Key Columns:**
- `route_id` (serial, PK)
- `org_id` (uuid, FK)
- `territory_id` (int, FK) - Parent territory
- `route_code` (text, UNIQUE per org)
- `route_name` (text)
- `route_type` (text) - delivery/sales/service

**Schedule:**
- `visit_days` (text[]) - ['Monday', 'Wednesday']
- `visit_frequency` (text) - daily/weekly/biweekly/monthly
- `assigned_to_id` (int, FK) - Assigned salesperson/driver

**Logistics:**
- `vehicle_required` (boolean)
- `total_distance_km` (numeric)
- `average_time_hours` (numeric)
- `customer_count` (int)
- `customer_sequence` (jsonb) - Visit order

**Use Cases:**
- Delivery planning
- Sales visit scheduling
- Route optimization
- Time estimation

**Example:**
```json
customer_sequence: [
  {"sequence": 1, "customer_id": 101, "estimated_time": "09:00"},
  {"sequence": 2, "customer_id": 105, "estimated_time": "10:30"},
  {"sequence": 3, "customer_id": 112, "estimated_time": "12:00"}
]
```

---

## Relationships

### Customer Hierarchy:
```
organizations
 └─ customers (many)
     ├─ customer_contacts (many)
     └─ customer_group_members (many)
         └─ customer_groups (many-to-many)
```

### Territory Hierarchy:
```
organizations
 └─ territories (many, self-referential)
     └─ routes (many)
         └─ customers (assigned via route_id)
```

### Supplier Hierarchy:
```
organizations
 └─ suppliers (many)
     └─ supplier_contacts (many)
```

---

## Multi-Tenant Security

### RLS Policies:
- **customers:** ✅ Enabled
- **suppliers:** ✅ Enabled
- **customer_groups, territories, routes:** Filtered by org_id FK

### Authentication:
All queries filtered by `org_id` from JWT token via `get_org_id_secure()`

---

## Performance Optimizations

### Full-Text Search:
- **customers:** Name + code search (GIN index)
- **suppliers:** Name + code search (GIN index)

### Common Queries:
- Active customers by territory
- Outstanding credit customers
- Supplier performance ratings
- Route-wise customer lists

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [04_sales_schema.md](./04_sales_schema.md) - Sales transactions
- [06_financial_schema.md](./06_financial_schema.md) - Receivables/payables

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 8 (verified - no changes from previous docs)
**Key Features:** CRM, Loyalty, KYC, Territory Management, Route Planning
