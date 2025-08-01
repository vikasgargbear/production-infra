# Master Schema Documentation

## Overview
The `master` schema contains core organizational data, user management, and system configuration tables that form the foundation of the pharmaceutical ERP system.

---

## Tables

### 1. organizations
**Purpose**: Core organization/company information
**API Endpoint**: `api.get_organizations()`, `api.create_organization()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `org_id` | UUID | ✓ | Unique organization identifier | Primary key for all API calls |
| `org_code` | TEXT | ✓ | Short organization code (e.g., "PHARMA001") | Display in headers, filters |
| `org_name` | TEXT | ✓ | Full organization name | Main display name |
| `org_type` | TEXT | ✓ | Type: 'pharmaceutical', 'hospital', 'clinic' | Business logic routing |
| `registration_number` | TEXT | - | Company registration number | Legal documents |
| `gstin` | TEXT | - | GST identification number | Tax calculations |
| `pan_number` | TEXT | - | PAN card number | Legal compliance |
| `establishment_year` | INTEGER | - | Year company was established | Display information |
| `primary_phone` | TEXT | ✓ | Main contact phone | Contact forms |
| `primary_email` | TEXT | - | Main contact email | Email communications |
| `website` | TEXT | - | Company website URL | External links |
| `logo_url` | TEXT | - | Company logo image URL | UI branding |
| `address_line1` | TEXT | - | Primary address line | Address displays |
| `address_line2` | TEXT | - | Secondary address line | Address displays |
| `city` | TEXT | - | City name | Location filters |
| `state` | TEXT | - | State/province | Location filters |
| `postal_code` | TEXT | - | ZIP/postal code | Location services |
| `country` | TEXT | - | Country name | International support |
| `timezone` | TEXT | - | Timezone (e.g., 'Asia/Kolkata') | Date/time displays |
| `currency_code` | TEXT | - | Primary currency (e.g., 'INR') | Price formatting |
| `financial_year_start` | TEXT | - | FY start (MM-DD format) | Reporting periods |
| `subscription_plan` | TEXT | - | Current plan: 'basic', 'premium', 'enterprise' | Feature access control |
| `subscription_status` | TEXT | - | Status: 'active', 'suspended', 'expired' | Access validation |
| `max_users` | INTEGER | - | Maximum allowed users | User creation limits |
| `max_branches` | INTEGER | - | Maximum allowed branches | Branch creation limits |
| `features_enabled` | TEXT[] | - | Array of enabled features | Feature toggle UI |
| `is_active` | BOOLEAN | - | Organization active status | Access control |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "org_id": "123e4567-e89b-12d3-a456-426614174000",
  "org_code": "PHARMA001",
  "org_name": "ABC Pharmaceuticals Ltd",
  "org_type": "pharmaceutical",
  "primary_phone": "+91-9876543210",
  "currency_code": "INR",
  "timezone": "Asia/Kolkata",
  "subscription_plan": "premium",
  "is_active": true
}
```

---

### 2. org_branches
**Purpose**: Branch/location management for multi-location organizations
**API Endpoint**: `api.get_branches()`, `api.create_branch()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `branch_id` | SERIAL | ✓ | Unique branch identifier | Primary key |
| `org_id` | UUID | ✓ | Parent organization ID | Organization filtering |
| `branch_code` | TEXT | ✓ | Short branch code (e.g., "MH001") | Quick identification |
| `branch_name` | TEXT | ✓ | Full branch name | Display name |
| `branch_type` | TEXT | ✓ | Type: 'head_office', 'branch', 'warehouse', 'store' | Business logic |
| `parent_branch_id` | INTEGER | - | Parent branch for hierarchy | Tree structure |
| `manager_id` | INTEGER | - | Branch manager user ID | User assignment |
| `branch_phone` | TEXT | - | Branch contact phone | Contact info |
| `branch_email` | TEXT | - | Branch email address | Communications |
| `branch_gst_number` | TEXT | - | Branch GST registration | Tax compliance |
| `drug_license_number` | TEXT | - | Drug license for pharmacy | Legal compliance |
| `drug_license_validity` | DATE | - | License expiry date | Compliance alerts |
| `address_line1` | TEXT | - | Branch address line 1 | Address display |
| `address_line2` | TEXT | - | Branch address line 2 | Address display |
| `city` | TEXT | - | Branch city | Location services |
| `state` | TEXT | - | Branch state | Location services |
| `postal_code` | TEXT | - | Branch postal code | Location services |
| `latitude` | NUMERIC | - | GPS latitude | Map integration |
| `longitude` | NUMERIC | - | GPS longitude | Map integration |
| `operating_hours` | JSONB | - | Operating schedule | Business hours display |
| `services_offered` | TEXT[] | - | Array of services | Service filtering |
| `storage_capacity` | NUMERIC | - | Storage capacity in units | Inventory planning |
| `delivery_radius_km` | NUMERIC | - | Delivery coverage radius | Delivery zones |
| `is_active` | BOOLEAN | - | Branch active status | Access control |
| `is_default` | BOOLEAN | - | Default branch flag | UI defaults |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "branch_id": 1,
  "branch_code": "MH001",
  "branch_name": "Mumbai Main Branch",
  "branch_type": "head_office",
  "branch_phone": "+91-22-12345678",
  "city": "Mumbai",
  "state": "Maharashtra",
  "operating_hours": {
    "monday": {"open": "09:00", "close": "18:00"},
    "sunday": {"closed": true}
  },
  "is_active": true,
  "is_default": true
}
```

---

### 3. org_users
**Purpose**: User management and authentication
**API Endpoint**: `api.get_users()`, `api.create_user()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `user_id` | SERIAL | ✓ | Unique user identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | - | Default branch assignment | Branch filtering |
| `employee_code` | TEXT | ✓ | Employee identification code | Employee lookup |
| `username` | TEXT | ✓ | Login username | Authentication |
| `email` | TEXT | ✓ | User email address | Authentication, notifications |
| `password_hash` | TEXT | ✓ | Encrypted password | Authentication (never expose) |
| `first_name` | TEXT | ✓ | User's first name | Display name |
| `last_name` | TEXT | ✓ | User's last name | Display name |
| `display_name` | TEXT | - | Preferred display name | UI display |
| `phone` | TEXT | - | Contact phone number | Contact info |
| `designation` | TEXT | - | Job title/designation | User information |
| `department` | TEXT | - | Department name | Organizational structure |
| `date_of_joining` | DATE | - | Employment start date | HR information |
| `date_of_birth` | DATE | - | User's date of birth | Personal information |
| `profile_image_url` | TEXT | - | Profile picture URL | Avatar display |
| `reporting_manager_id` | INTEGER | - | Manager's user ID | Hierarchy structure |
| `roles` | TEXT[] | ✓ | Array of role names | Permission control |
| `permissions` | TEXT[] | - | Array of specific permissions | Fine-grained access |
| `default_language` | TEXT | - | Preferred language code | Localization |
| `timezone` | TEXT | - | User's timezone | Date/time display |
| `last_login_at` | TIMESTAMPTZ | - | Last login timestamp | Activity tracking |
| `login_count` | INTEGER | - | Total login count | Usage analytics |
| `password_changed_at` | TIMESTAMPTZ | - | Last password change | Security policy |
| `account_locked` | BOOLEAN | - | Account lock status | Security control |
| `failed_login_attempts` | INTEGER | - | Failed login counter | Security monitoring |
| `is_active` | BOOLEAN | - | User active status | Access control |
| `created_at` | TIMESTAMPTZ | - | Account creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "user_id": 1,
  "employee_code": "EMP001",
  "username": "john.doe",
  "email": "john.doe@company.com",
  "first_name": "John",
  "last_name": "Doe",
  "display_name": "John Doe",
  "designation": "Sales Manager",
  "department": "Sales",
  "roles": ["sales_manager", "user"],
  "permissions": ["view_customers", "create_orders"],
  "is_active": true,
  "last_login_at": "2024-01-15T10:30:00Z"
}
```

---

### 4. products
**Purpose**: Master product catalog
**API Endpoint**: `api.get_products()`, `api.create_product()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `product_id` | SERIAL | ✓ | Unique product identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_code` | TEXT | ✓ | Product SKU/code | Search, identification |
| `product_name` | TEXT | ✓ | Product display name | Main display |
| `generic_name` | TEXT | - | Generic/scientific name | Medical information |
| `brand_name` | TEXT | - | Brand/commercial name | Marketing display |
| `manufacturer` | TEXT | - | Manufacturing company | Product information |
| `category_id` | INTEGER | - | Product category ID | Categorization |
| `subcategory_id` | INTEGER | - | Product subcategory ID | Fine categorization |
| `product_type` | TEXT | ✓ | Type: 'medicine', 'surgical', 'ayurvedic', 'cosmetic' | Business logic |
| `prescription_required` | BOOLEAN | - | Requires prescription | Compliance checks |
| `schedule_type` | TEXT | - | Drug schedule: 'H', 'H1', 'X', etc. | Legal compliance |
| `hsn_code` | TEXT | - | HSN code for GST | Tax calculations |
| `gst_percentage` | NUMERIC | ✓ | GST rate percentage | Tax calculations |
| `cess_percentage` | NUMERIC | - | Cess rate percentage | Tax calculations |
| `base_unit` | TEXT | ✓ | Base unit: 'tablet', 'ml', 'gm' | Inventory management |
| `pack_size` | INTEGER | - | Units per pack | Inventory calculations |
| `pack_unit` | TEXT | - | Pack unit description | Display information |
| `strength` | TEXT | - | Drug strength (e.g., "500mg") | Medical information |
| `form` | TEXT | - | Form: 'tablet', 'syrup', 'injection' | Medical information |
| `composition` | TEXT | - | Active ingredients | Medical information |
| `storage_condition` | TEXT | - | Storage requirements | Warehouse management |
| `shelf_life_months` | INTEGER | - | Shelf life in months | Expiry management |
| `minimum_stock_level` | NUMERIC | - | Reorder level | Inventory alerts |
| `maximum_stock_level` | NUMERIC | - | Maximum stock level | Inventory planning |
| `standard_rate` | NUMERIC | - | Standard selling price | Pricing |
| `purchase_rate` | NUMERIC | - | Standard purchase price | Cost management |
| `mrp` | NUMERIC | - | Maximum retail price | Price validation |
| `margin_percentage` | NUMERIC | - | Profit margin percentage | Pricing strategy |
| `barcode` | TEXT | - | Product barcode | Scanning integration |
| `qr_code` | TEXT | - | QR code data | Mobile integration |
| `product_image_url` | TEXT | - | Product image URL | Visual display |
| `is_active` | BOOLEAN | - | Product active status | Catalog filtering |
| `is_narcotic` | BOOLEAN | - | Narcotic drug flag | Special handling |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "product_id": 1,
  "product_code": "MED001",
  "product_name": "Paracetamol 500mg Tablet",
  "generic_name": "Paracetamol",
  "manufacturer": "ABC Pharma",
  "product_type": "medicine",
  "prescription_required": false,
  "hsn_code": "3004",
  "gst_percentage": 12.00,
  "base_unit": "tablet",
  "pack_size": 10,
  "strength": "500mg",
  "form": "tablet",
  "mrp": 25.00,
  "is_active": true
}
```

---

### 5. product_categories
**Purpose**: Product categorization hierarchy  
**API Endpoint**: `api.get_categories()`, `api.create_category()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `category_id` | SERIAL | ✓ | Unique category identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `category_code` | TEXT | ✓ | Category code | Quick identification |
| `category_name` | TEXT | ✓ | Category display name | Menu/filter display |
| `parent_category_id` | INTEGER | - | Parent category for hierarchy | Tree navigation |
| `category_level` | INTEGER | - | Hierarchy level (1, 2, 3...) | Tree depth control |
| `category_path` | TEXT | - | Full path (e.g., "Medicine/Antibiotics") | Breadcrumb navigation |
| `description` | TEXT | - | Category description | Tooltips/help text |
| `category_image_url` | TEXT | - | Category image URL | Visual navigation |
| `sort_order` | INTEGER | - | Display sort order | UI ordering |
| `is_active` | BOOLEAN | - | Category active status | Menu filtering |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "category_id": 1,
  "category_code": "ANTIBIOTICS",
  "category_name": "Antibiotics",
  "parent_category_id": null,
  "category_level": 1,
  "description": "Antibiotic medications",
  "sort_order": 1,
  "is_active": true
}
```

---

### 6. uom (Units of Measurement)
**Purpose**: Standard units for inventory and sales
**API Endpoint**: `api.get_uom()`, `api.create_uom()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `uom_id` | SERIAL | ✓ | Unique UOM identifier | Primary key |
| `uom_code` | TEXT | ✓ | UOM code (e.g., "KG", "L") | Display/selection |
| `uom_name` | TEXT | ✓ | UOM full name | Display name |
| `uom_type` | TEXT | ✓ | Type: 'weight', 'volume', 'length', 'count' | Categorization |
| `base_uom_id` | INTEGER | - | Base unit reference | Conversion calculations |
| `conversion_factor` | NUMERIC | - | Conversion to base unit | Unit conversions |
| `decimal_places` | INTEGER | - | Decimal precision | Number formatting |
| `is_base_unit` | BOOLEAN | - | Base unit flag | Conversion logic |
| `is_active` | BOOLEAN | - | UOM active status | Selection filtering |

**Example API Response**:
```json
{
  "uom_id": 1,
  "uom_code": "TAB",
  "uom_name": "Tablet",
  "uom_type": "count",
  "decimal_places": 0,
  "is_base_unit": true,
  "is_active": true
}
```

---

### 7. tax_rates
**Purpose**: GST and tax rate configuration
**API Endpoint**: `api.get_tax_rates()`, `api.create_tax_rate()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `tax_id` | SERIAL | ✓ | Unique tax rate identifier | Primary key |
| `code` | TEXT | ✓ | Tax code (e.g., "GST18") | Selection identifier |
| `tax_type` | TEXT | ✓ | Type: 'gst', 'igst', 'cess' | Tax calculations |
| `description` | TEXT | ✓ | Tax description | Display name |
| `rate` | NUMERIC | ✓ | Tax rate percentage | Calculations |
| `cgst_rate` | NUMERIC | - | CGST component rate | Tax splitting |
| `sgst_rate` | NUMERIC | - | SGST component rate | Tax splitting |
| `igst_rate` | NUMERIC | - | IGST rate | Interstate transactions |
| `is_active` | BOOLEAN | - | Tax rate active status | Selection filtering |

**Example API Response**:
```json
{
  "tax_id": 1,
  "code": "GST12",
  "tax_type": "gst",
  "description": "GST 12%",
  "rate": 12.00,
  "cgst_rate": 6.00,
  "sgst_rate": 6.00,
  "is_active": true
}
```

---

### 8. number_series
**Purpose**: Auto-numbering configuration for documents
**API Endpoint**: `api.get_number_series()`, `api.create_number_series()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `series_id` | SERIAL | ✓ | Unique series identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `document_type` | TEXT | ✓ | Document type: 'invoice', 'order', 'payment' | Document creation |
| `series_code` | TEXT | ✓ | Series code identifier | Series selection |
| `prefix` | TEXT | - | Number prefix (e.g., "INV") | Number generation |
| `suffix` | TEXT | - | Number suffix (e.g., "/24-25") | Number generation |
| `current_number` | INTEGER | ✓ | Current counter value | Next number generation |
| `start_number` | INTEGER | - | Starting number | Series initialization |
| `increment_by` | INTEGER | - | Increment step | Number generation |
| `is_default` | BOOLEAN | - | Default series flag | Auto-selection |
| `is_active` | BOOLEAN | - | Series active status | Selection filtering |

**Example API Response**:
```json
{
  "series_id": 1,
  "document_type": "invoice",
  "series_code": "INV-DEFAULT",
  "prefix": "INV",
  "suffix": "/24-25",
  "current_number": 1001,
  "is_default": true,
  "is_active": true
}
```

---

## API Integration Notes

### Authentication
All API calls require organization context:
```javascript
// Headers required for all requests
{
  "Authorization": "Bearer <jwt_token>",
  "X-Org-ID": "<organization_uuid>",
  "Content-Type": "application/json"
}
```

### Common Patterns
1. **Filtering**: Use `is_active=true` for active records
2. **Pagination**: Most APIs support `limit` and `offset`
3. **Search**: Text fields support `ILIKE` pattern matching
4. **Sorting**: Use `order_by` parameter with field names

### Error Handling
Standard HTTP status codes with JSON error responses:
```json
{
  "error": "validation_failed",
  "message": "Required field missing: product_name",
  "details": {
    "field": "product_name",
    "code": "required"
  }
}
```