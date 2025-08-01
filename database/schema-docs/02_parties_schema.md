# Parties Schema Documentation

## Overview
The `parties` schema manages customers, suppliers, and business relationships. This is critical for sales, procurement, and business partner management.

---

## Tables

### 1. customers
**Purpose**: Customer master data and relationship management
**API Endpoint**: `api.get_customers()`, `api.create_customer()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `customer_id` | SERIAL | ✓ | Unique customer identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `customer_code` | TEXT | ✓ | Customer identification code | Search, display |
| `customer_name` | TEXT | ✓ | Customer business name | Main display name |
| `customer_type` | TEXT | ✓ | Type: 'pharmacy', 'hospital', 'clinic', 'institution', 'doctor' | Business logic routing |
| `primary_phone` | TEXT | ✓ | Primary contact number | Contact forms, validation |
| `primary_email` | TEXT | - | Primary email address | Email communications |
| `secondary_phone` | TEXT | - | Secondary contact number | Additional contact |
| `whatsapp_number` | TEXT | - | WhatsApp contact number | WhatsApp integration |
| `contact_person_name` | TEXT | - | Main contact person | Personal communication |
| `contact_person_phone` | TEXT | - | Contact person's phone | Direct contact |
| `contact_person_email` | TEXT | - | Contact person's email | Direct communication |
| `gst_number` | TEXT | - | GST registration number | Tax compliance, validation |
| `pan_number` | TEXT | - | PAN card number | Legal compliance |
| `drug_license_number` | TEXT | - | Drug license number | Pharmaceutical compliance |
| `drug_license_validity` | DATE | - | License expiry date | Compliance alerts |
| `fssai_number` | TEXT | - | FSSAI registration | Food safety compliance |
| `establishment_year` | INTEGER | - | Year of establishment | Business information |
| `business_type` | TEXT | - | Business type (default: 'retail_pharmacy') | Business classification |
| `credit_limit` | NUMERIC(15,2) | - | Credit limit amount | Credit management |
| `current_outstanding` | NUMERIC(15,2) | - | Current outstanding balance | Payment tracking |
| `credit_days` | INTEGER | - | Credit payment terms in days | Payment terms |
| `credit_rating` | TEXT | - | Credit rating: 'A', 'B', 'C', 'D' | Risk assessment |
| `payment_terms` | TEXT | - | Payment terms description | Business terms |
| `security_deposit` | NUMERIC(15,2) | - | Security deposit amount | Financial security |
| `overdue_interest_rate` | NUMERIC(5,2) | - | Interest rate on overdue | Financial calculations |
| `customer_category` | TEXT | - | Category: 'vip', 'regular', 'new', 'blacklisted' | Customer segmentation |
| `customer_grade` | TEXT | - | Grade: 'A', 'B', 'C', 'D' | Performance classification |
| `territory_id` | INTEGER | - | Sales territory ID | Territory management |
| `route_id` | INTEGER | - | Sales route ID | Route planning |
| `area_code` | TEXT | - | Area/zone code | Geographic organization |
| `assigned_salesperson_id` | INTEGER | - | Assigned salesperson | Sales management |
| `price_list_id` | INTEGER | - | Special price list ID | Pricing strategy |
| `discount_group_id` | INTEGER | - | Discount group ID | Discount management |
| `kyc_status` | TEXT | - | KYC status: 'pending', 'verified', 'rejected' | Compliance tracking |
| `kyc_verified_date` | DATE | - | KYC verification date | Compliance records |
| `kyc_documents` | JSONB | - | KYC document references | Document management |
| `preferred_payment_mode` | TEXT | - | Preferred payment method | Payment processing |
| `preferred_delivery_time` | TEXT | - | Preferred delivery schedule | Logistics planning |
| `prefer_sms` | BOOLEAN | - | SMS communication preference | Communication settings |
| `prefer_email` | BOOLEAN | - | Email communication preference | Communication settings |
| `prefer_whatsapp` | BOOLEAN | - | WhatsApp communication preference | Communication settings |
| `first_transaction_date` | DATE | - | First business transaction date | Relationship tracking |
| `last_transaction_date` | DATE | - | Last business transaction date | Activity tracking |
| `total_business_amount` | NUMERIC(15,2) | - | Lifetime business value | Analytics |
| `total_transactions` | INTEGER | - | Total transaction count | Analytics |
| `average_order_value` | NUMERIC(15,2) | - | Average order value | Analytics |
| `is_active` | BOOLEAN | - | Customer active status | Access control |
| `blacklisted` | BOOLEAN | - | Blacklist status | Risk management |
| `blacklist_reason` | TEXT | - | Reason for blacklisting | Risk documentation |
| `blacklist_date` | DATE | - | Date of blacklisting | Risk tracking |
| `loyalty_points` | NUMERIC(15,2) | - | Loyalty program points | Loyalty management |
| `loyalty_tier` | TEXT | - | Tier: 'bronze', 'silver', 'gold', 'platinum' | Loyalty segmentation |
| `internal_notes` | TEXT | - | Internal notes/comments | Internal communication |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |
| `created_by` | INTEGER | - | Creator user ID | Audit trails |

**Example API Response**:
```json
{
  "customer_id": 1,
  "customer_code": "CUST001",
  "customer_name": "ABC Medical Store",
  "customer_type": "pharmacy",
  "primary_phone": "+91-9876543210",
  "primary_email": "contact@abcmedical.com",
  "gst_number": "27ABCDE1234F1Z5",
  "credit_limit": 50000.00,
  "current_outstanding": 15000.00,
  "credit_days": 30,
  "customer_category": "regular",
  "is_active": true,
  "total_business_amount": 250000.00,
  "loyalty_tier": "silver"
}
```

---

### 2. suppliers
**Purpose**: Supplier/vendor master data and relationship management
**API Endpoint**: `api.get_suppliers()`, `api.create_supplier()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `supplier_id` | SERIAL | ✓ | Unique supplier identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `supplier_code` | TEXT | ✓ | Supplier identification code | Search, display |
| `supplier_name` | TEXT | ✓ | Supplier business name | Main display name |
| `supplier_type` | TEXT | ✓ | Type: 'manufacturer', 'distributor', 'stockist', 'importer', 'trader' | Business classification |
| `primary_phone` | TEXT | ✓ | Primary contact number | Contact forms |
| `primary_email` | TEXT | - | Primary email address | Communications |
| `secondary_phone` | TEXT | - | Secondary contact number | Additional contact |
| `contact_person_name` | TEXT | - | Main contact person | Personal communication |
| `contact_person_phone` | TEXT | - | Contact person's phone | Direct contact |
| `gst_number` | TEXT | - | GST registration number | Tax compliance |
| `pan_number` | TEXT | - | PAN card number | Legal compliance |
| `drug_license_number` | TEXT | - | Drug license number | Pharmaceutical compliance |
| `drug_license_validity` | DATE | - | License expiry date | Compliance alerts |
| `establishment_year` | INTEGER | - | Year of establishment | Business information |
| `payment_days` | INTEGER | - | Payment terms in days | Payment planning |
| `preferred_payment_mode` | TEXT | - | Preferred payment method | Payment processing |
| `early_payment_discount` | NUMERIC(5,2) | - | Early payment discount % | Financial incentives |
| `late_payment_penalty` | NUMERIC(5,2) | - | Late payment penalty % | Financial penalties |
| `supplier_category` | TEXT | - | Category: 'preferred', 'regular', 'backup', 'blacklisted' | Supplier segmentation |
| `supplier_grade` | TEXT | - | Grade: 'A', 'B', 'C', 'D' | Performance classification |
| `product_categories` | TEXT[] | - | Array of product categories supplied | Product filtering |
| `brand_authorizations` | TEXT[] | - | Array of authorized brands | Brand validation |
| `compliance_rating` | TEXT | - | Rating: 'excellent', 'good', 'average', 'poor' | Quality assessment |
| `quality_rating` | NUMERIC(3,2) | - | Quality rating (1.00 to 5.00) | Performance metrics |
| `delivery_rating` | NUMERIC(3,2) | - | Delivery rating (1.00 to 5.00) | Performance metrics |
| `vendor_documents` | JSONB | - | Document references and validity | Document management |
| `bank_name` | TEXT | - | Bank name for payments | Payment processing |
| `account_number` | TEXT | - | Bank account number | Payment processing |
| `ifsc_code` | TEXT | - | Bank IFSC code | Payment processing |
| `account_type` | TEXT | - | Account type: 'current', 'savings' | Banking information |
| `account_holder_name` | TEXT | - | Account holder name | Payment validation |
| `credit_limit_given` | NUMERIC(15,2) | - | Credit limit from supplier | Financial planning |
| `current_outstanding` | NUMERIC(15,2) | - | Current outstanding to supplier | Payment tracking |
| `first_purchase_date` | DATE | - | First purchase date | Relationship tracking |
| `last_purchase_date` | DATE | - | Last purchase date | Activity tracking |
| `total_purchase_amount` | NUMERIC(15,2) | - | Lifetime purchase value | Analytics |
| `total_purchases` | INTEGER | - | Total purchase count | Analytics |
| `average_order_value` | NUMERIC(15,2) | - | Average purchase value | Analytics |
| `return_rate_percentage` | NUMERIC(5,2) | - | Return rate percentage | Quality metrics |
| `quality_issue_count` | INTEGER | - | Quality issue count | Quality tracking |
| `is_active` | BOOLEAN | - | Supplier active status | Access control |
| `is_approved` | BOOLEAN | - | Approval status | Vendor approval |
| `approved_date` | DATE | - | Approval date | Approval tracking |
| `approved_by` | INTEGER | - | Approver user ID | Approval audit |
| `blacklisted` | BOOLEAN | - | Blacklist status | Risk management |
| `blacklist_reason` | TEXT | - | Blacklist reason | Risk documentation |
| `blacklist_date` | DATE | - | Blacklist date | Risk tracking |
| `internal_notes` | TEXT | - | Internal notes | Internal communication |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |
| `created_by` | INTEGER | - | Creator user ID | Audit trails |

**Example API Response**:
```json
{
  "supplier_id": 1,
  "supplier_code": "SUPP001",
  "supplier_name": "XYZ Pharmaceuticals Pvt Ltd",
  "supplier_type": "manufacturer",
  "primary_phone": "+91-11-12345678",
  "gst_number": "07ABCDE1234F1Z5",
  "supplier_category": "preferred",
  "quality_rating": 4.5,
  "delivery_rating": 4.2,
  "current_outstanding": 25000.00,
  "is_active": true,
  "is_approved": true
}
```

---

### 3. customer_contacts
**Purpose**: Multiple contacts for customers
**API Endpoint**: `api.get_customer_contacts()`, `api.create_customer_contact()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `contact_id` | SERIAL | ✓ | Unique contact identifier | Primary key |
| `customer_id` | INTEGER | ✓ | Parent customer ID | Customer association |
| `contact_name` | TEXT | ✓ | Contact person name | Display name |
| `designation` | TEXT | - | Job title/designation | Contact information |
| `department` | TEXT | - | Department name | Organizational context |
| `mobile_number` | TEXT | - | Mobile phone number | Contact method |
| `phone_number` | TEXT | - | Landline phone number | Contact method |
| `email` | TEXT | - | Email address | Contact method |
| `is_primary_contact` | BOOLEAN | - | Primary contact flag | Contact hierarchy |
| `contact_for` | TEXT[] | - | Contact purposes: ['orders', 'payments', 'complaints', 'general'] | Contact routing |
| `preferred_contact_time` | TEXT | - | Preferred contact time | Communication scheduling |
| `preferred_language` | TEXT | - | Preferred language | Localization |
| `date_of_birth` | DATE | - | Date of birth | Personal touch |
| `anniversary_date` | DATE | - | Anniversary date | Relationship building |
| `notes` | TEXT | - | Contact notes | Personal information |
| `is_active` | BOOLEAN | - | Contact active status | Contact management |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "contact_id": 1,
  "customer_id": 1,
  "contact_name": "Rajesh Kumar",
  "designation": "Store Manager",
  "mobile_number": "+91-9876543210",
  "email": "rajesh@abcmedical.com",
  "is_primary_contact": true,
  "contact_for": ["orders", "payments"],
  "preferred_language": "Hindi",
  "is_active": true
}
```

---

### 4. supplier_contacts
**Purpose**: Multiple contacts for suppliers
**API Endpoint**: `api.get_supplier_contacts()`, `api.create_supplier_contact()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `contact_id` | SERIAL | ✓ | Unique contact identifier | Primary key |
| `supplier_id` | INTEGER | ✓ | Parent supplier ID | Supplier association |
| `contact_name` | TEXT | ✓ | Contact person name | Display name |
| `designation` | TEXT | - | Job title/designation | Contact information |
| `department` | TEXT | - | Department name | Organizational context |
| `mobile_number` | TEXT | - | Mobile phone number | Contact method |
| `phone_number` | TEXT | - | Landline phone number | Contact method |
| `email` | TEXT | - | Email address | Contact method |
| `is_primary_contact` | BOOLEAN | - | Primary contact flag | Contact hierarchy |
| `contact_for` | TEXT[] | - | Contact purposes: ['orders', 'payments', 'quality', 'logistics'] | Contact routing |
| `can_negotiate_prices` | BOOLEAN | - | Price negotiation authority | Business authority |
| `can_approve_returns` | BOOLEAN | - | Return approval authority | Business authority |
| `max_discount_authority` | NUMERIC(5,2) | - | Maximum discount authority % | Business limits |
| `notes` | TEXT | - | Contact notes | Personal information |
| `is_active` | BOOLEAN | - | Contact active status | Contact management |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 5. customer_groups
**Purpose**: Customer grouping for pricing and discounts
**API Endpoint**: `api.get_customer_groups()`, `api.create_customer_group()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `group_id` | SERIAL | ✓ | Unique group identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `group_code` | TEXT | ✓ | Group identification code | Group selection |
| `group_name` | TEXT | ✓ | Group display name | Display name |
| `group_type` | TEXT | ✓ | Type: 'territory', 'category', 'price', 'discount', 'custom' | Group classification |
| `parent_group_id` | INTEGER | - | Parent group ID | Hierarchy structure |
| `discount_percentage` | NUMERIC(5,2) | - | Group discount percentage | Pricing calculations |
| `price_list_id` | INTEGER | - | Special price list ID | Pricing strategy |
| `payment_terms_days` | INTEGER | - | Payment terms in days | Payment terms |
| `credit_limit_multiplier` | NUMERIC(3,2) | - | Credit limit multiplier | Credit calculations |
| `eligibility_criteria` | JSONB | - | Group eligibility criteria | Auto-assignment logic |
| `is_active` | BOOLEAN | - | Group active status | Group management |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "group_id": 1,
  "group_code": "VIP_CUSTOMERS",
  "group_name": "VIP Customers",
  "group_type": "discount",
  "discount_percentage": 15.00,
  "credit_limit_multiplier": 2.0,
  "eligibility_criteria": {
    "minimum_business": 100000,
    "minimum_transactions": 12
  },
  "is_active": true
}
```

---

### 6. territories
**Purpose**: Geographic territory management
**API Endpoint**: `api.get_territories()`, `api.create_territory()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `territory_id` | SERIAL | ✓ | Unique territory identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `territory_code` | TEXT | ✓ | Territory identification code | Territory selection |
| `territory_name` | TEXT | ✓ | Territory display name | Display name |
| `territory_type` | TEXT | ✓ | Type: 'state', 'city', 'area', 'route' | Territory classification |
| `parent_territory_id` | INTEGER | - | Parent territory ID | Hierarchy structure |
| `territory_path` | TEXT | - | Full path (e.g., 'Maharashtra/Mumbai/Andheri') | Breadcrumb navigation |
| `geographic_data` | JSONB | - | Geographic boundaries and coordinates | Map integration |
| `territory_manager_id` | INTEGER | - | Territory manager user ID | Management assignment |
| `sales_team_ids` | INTEGER[] | - | Sales team member IDs | Team management |
| `monthly_target` | NUMERIC(15,2) | - | Monthly sales target | Target tracking |
| `quarterly_target` | NUMERIC(15,2) | - | Quarterly sales target | Target tracking |
| `annual_target` | NUMERIC(15,2) | - | Annual sales target | Target tracking |
| `current_month_achievement` | NUMERIC(15,2) | - | Current month achievement | Performance tracking |
| `current_quarter_achievement` | NUMERIC(15,2) | - | Current quarter achievement | Performance tracking |
| `is_active` | BOOLEAN | - | Territory active status | Territory management |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 7. routes
**Purpose**: Sales and delivery route planning
**API Endpoint**: `api.get_routes()`, `api.create_route()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `route_id` | SERIAL | ✓ | Unique route identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `territory_id` | INTEGER | - | Parent territory ID | Territory association |
| `route_code` | TEXT | ✓ | Route identification code | Route selection |
| `route_name` | TEXT | ✓ | Route display name | Display name |
| `route_type` | TEXT | ✓ | Type: 'delivery', 'sales', 'collection' | Route purpose |
| `visit_days` | TEXT[] | - | Visit days: ['Monday', 'Thursday'] | Schedule planning |
| `visit_frequency` | TEXT | - | Frequency: 'weekly', 'bi-weekly', 'monthly' | Schedule planning |
| `assigned_to_id` | INTEGER | - | Assigned user ID | Route assignment |
| `vehicle_required` | BOOLEAN | - | Vehicle requirement flag | Logistics planning |
| `total_distance_km` | NUMERIC(10,2) | - | Total route distance | Route optimization |
| `average_time_hours` | NUMERIC(5,2) | - | Average completion time | Time planning |
| `customer_count` | INTEGER | - | Number of customers on route | Route statistics |
| `customer_sequence` | JSONB | - | Customer visit sequence with timing | Route optimization |
| `is_active` | BOOLEAN | - | Route active status | Route management |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "route_id": 1,
  "route_code": "R001",
  "route_name": "Mumbai Central Route",
  "route_type": "delivery",
  "visit_days": ["Monday", "Wednesday", "Friday"],
  "visit_frequency": "weekly",
  "total_distance_km": 25.5,
  "customer_count": 15,
  "is_active": true
}
```

---

## API Integration Notes

### Customer Management
```javascript
// Create customer with validation
const customer = {
  customer_name: "ABC Medical Store",
  customer_type: "pharmacy",
  primary_phone: "+91-9876543210",
  gst_number: "27ABCDE1234F1Z5", // Optional but validated if provided
  credit_limit: 50000
};

// GST number validation pattern
const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
```

### Search and Filtering
```javascript
// Customer search with multiple filters
GET /api/customers?
  search=medical&          // Name/code search
  customer_type=pharmacy&  // Type filter
  is_active=true&         // Active only
  territory_id=1&         // Territory filter
  limit=20&offset=0       // Pagination
```

### Credit Management
```javascript
// Check customer credit status
const creditStatus = {
  customer_id: 1,
  credit_limit: 50000,
  current_outstanding: 15000,
  available_credit: 35000,
  credit_utilization: 30.0 // percentage
};
```

### Relationship Management
- Use `customer_contacts` for multiple contact persons
- Use `customer_groups` for bulk pricing and discount management
- Use `territories` and `routes` for geographic organization
- Track customer lifecycle with transaction history fields

### Validation Rules
1. **GST Number**: Must follow Indian GST format if provided
2. **Phone Numbers**: Should include country code
3. **Credit Limit**: Cannot be negative
4. **Customer Code**: Must be unique within organization
5. **Email**: Must be valid email format if provided