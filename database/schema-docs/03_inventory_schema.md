# Inventory Schema Documentation

**Schema:** `inventory`
**Purpose:** Product catalog, stock management, batch tracking, pricing intelligence
**Last Updated:** 2025-10-16
**Tables:** 17 (+5 pricing tables since last update)

---

## Overview

The `inventory` schema manages product catalog, batch tracking with expiry dates, multi-location stock management, and advanced pricing intelligence for pharmaceutical distribution. This schema is critical for regulatory compliance (batch tracking, expiry management) and competitive pricing analysis.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| 1 | product_categories | Product categorization | category_id | Hierarchical, HSN/GST defaults |
| 2 | product_types | Product type definitions | type_id | Liquid/injectable flags, storage needs |
| 3 | units_of_measure | UOM master | uom_id | Conversion factors, decimal precision |
| 4 | products | Product master | product_id | 45 columns, compliance, stock rules |
| 5 | batches | Batch/lot tracking | batch_id | Expiry, QC, FIFO allocation, pack types |
| 6 | storage_locations | Warehouse locations | location_id | Hierarchical, temperature/humidity control |
| 7 | location_wise_stock | Stock by location/batch | stock_id | Available/reserved/quarantine quantities |
| 8 | stock_reservations | Order reservations | reservation_id | Priority-based, expiry tracking |
| 9 | inventory_movements | Movement audit trail | movement_id | All stock movements, full audit |
| 10 | stock_transfers | Inter-location transfers | transfer_id | Request/approve/dispatch/receive |
| 11 | stock_transfer_items | Transfer line items | transfer_item_id | Shortage/damage tracking |
| 12 | reorder_suggestions | Auto-reorder alerts | suggestion_id | Consumption-based, lead time aware |
| 13 | movement_summary | Movement analytics view | - | Aggregated movement data |
| 14 | competitor_pricing | ⭐ NEW: Market intelligence | competitor_price_id | Competitor price tracking |
| 15 | price_alerts | ⭐ NEW: Price monitoring | alert_id | Volatility, margin impact alerts |
| 16 | price_change_log | ⭐ NEW: Price audit | log_id | All price changes with approval |
| 17 | price_history | ⭐ NEW: Historical pricing | history_id | Time-series price data |

---

## Detailed Table Structures

### 1. product_categories
**Hierarchical product categorization with compliance flags**

**Key Columns:**
- `category_id` (serial, PK) - Unique identifier
- `org_id` (uuid, FK) - Organization
- `parent_category_id` (int) - For hierarchy (e.g., Medicine → Tablets)
- `category_code` (text, UNIQUE per org) - Short code
- `category_name` (text) - Display name
- `category_level` (int) - Depth in hierarchy (default: 1)
- `category_path` (text) - Breadcrumb path

**Compliance:**
- `requires_prescription` (boolean) - Rx required flag
- `requires_license` (boolean) - Special licensing needed
- `default_hsn_code` (text) - Default HSN for GST
- `default_gst_rate` (numeric 5,2) - Default GST %

**UI Features:**
- `display_order` (int) - Sort order
- `icon_name` (text) - Icon reference
- `color_code` (text) - Color coding

**Use Cases:**
- Category-based product search
- GST rate defaults
- Prescription validation
- Regulatory compliance

**Hierarchy Example:**
```
Medicine (Level 1)
 ├─ Tablets (Level 2)
 │   ├─ Antibiotics (Level 3)
 │   └─ Analgesics (Level 3)
 └─ Syrups (Level 2)
```

---

### 2. product_types
**Product type master with pharma-specific attributes**

**Key Columns:**
- `type_id` (serial, PK)
- `type_code` (text, UNIQUE) - e.g., TAB, CAP, SYR, INJ
- `type_name` (text) - Display name
- `default_base_uom` (text) - Base unit (UNIT, ML, MG)

**Special Attributes:**
- `is_liquid` (boolean) - Liquid form flag
- `is_injectable` (boolean) - Injectable flag
- `requires_cold_storage` (boolean) - Cold chain required

**Use Cases:**
- Storage requirement determination
- Handling instruction defaults
- Pack configuration templates

---

### 3. units_of_measure
**Multi-level UOM with conversions**

**Key Columns:**
- `uom_id` (serial, PK)
- `org_id` (uuid, FK)
- `uom_code` (text) - e.g., UNIT, STRIP, BOX
- `uom_name` (text) - Display name
- `uom_type` (text) - base/derived/display

**Conversions:**
- `base_uom_code` (text) - Reference UOM
- `conversion_factor` (numeric 15,6) - Multiplier
- `decimal_places` (int) - Precision (default: 0)
- `symbol` (text) - Display symbol

**Example:**
```
UNIT (base) = 1
STRIP = 10 UNITS (conversion_factor: 10)
BOX = 10 STRIPS (conversion_factor: 100)
```

---

### 4. products
**Comprehensive product master (45 columns)**

**Core Information:**
- `product_id` (serial, PK)
- `org_id` (uuid, FK)
- `product_code` (text, UNIQUE per org)
- `product_name` (text) - Display name
- `generic_name` (text) - Generic/salt name
- `brand` (text) - Brand name
- `manufacturer` (text)
- `category_id` (int, FK) - Product category
- `type_id` (int, FK) - Product type

**Pharmaceutical Details:**
- `composition` (jsonb) - Active ingredients
- `strength` (text) - e.g., "500mg"
- `drug_schedule` (text) - H, H1, X, etc.
- `requires_prescription` (boolean)
- `is_narcotic` (boolean)
- `is_controlled_substance` (boolean)

**Identification:**
- `barcode` (text)
- `manufacturer_code` (text)
- `hsn_code` (text) - For GST

**Tax Configuration:**
- `gst_percentage` (numeric 5,2) - Default: 0
- `cess_percentage` (numeric 5,2) - Default: 0

**Inventory Control:**
- `maintain_batch` (boolean) - Batch tracking (default: true)
- `maintain_expiry` (boolean) - Expiry tracking (default: true)
- `allow_negative_stock` (boolean) - Allow overselling (default: false)

**Stock Levels:**
- `min_stock_quantity` (numeric 15,3)
- `reorder_level` (numeric 15,3)
- `reorder_quantity` (numeric 15,3)
- `max_stock_quantity` (numeric 15,3)
- `critical_stock_level` (numeric 15,3)

**Status:**
- `product_status` (text) - active/discontinued (default: 'active')
- `launch_date` (date)
- `discontinuation_date` (date)
- `is_active` (boolean) - Active flag (default: true)
- `is_saleable` (boolean) - Can sell (default: true)
- `is_purchasable` (boolean) - Can purchase (default: true)

**Search & Media:**
- `search_keywords` (text[]) - Search optimization
- `tags` (text[]) - Custom tags
- `product_images` (jsonb) - Image URLs (default: [])
- `documents` (jsonb) - Certificates, specs (default: [])

**Added Columns:**
- `quantity_returned` (numeric 18,3) - Total returns (default: 0)

**Indexes:** Full-text search, barcode lookup, category filtering

**RLS Policy:** ✅ Enabled (`org_id = get_current_org_id()`)

---

### 5. batches
**Batch/lot tracking with expiry and pack configurations**

**Key Columns:**
- `batch_id` (serial, PK)
- `org_id` (uuid, FK)
- `product_id` (int, FK)
- `batch_number` (text, UNIQUE per product)
- `alternate_batch_number` (text) - Supplier batch #

**Dates:**
- `manufacturing_date` (date)
- `expiry_date` (date, REQUIRED)
- `retesting_date` (date) - For pharma QC
- `last_movement_date` (timestamptz)

**Quantities:**
- `initial_quantity` (numeric 15,3, REQUIRED)
- `quantity_available` (numeric 15,3) - Default: 0
- `quantity_reserved` (numeric 15,3) - Reserved for orders (default: 0)
- `quantity_allocated` (numeric 15,3) - Allocated to invoices (default: 0)
- `quantity_quarantine` (numeric 15,3) - QC hold (default: 0)
- `quantity_returned` (numeric 18,3) - Returned qty (default: 0)

**Location:**
- `location_count` (int) - # of storage locations (default: 0)
- `primary_location_id` (int) - Main storage location

**Pack Configuration:**
- `pack_size` (int, REQUIRED) - Units per pack (default: 1)
- `pack_type` (text, REQUIRED) - strip/box/unit (default: 'unit')
- `pack_uom` (text, REQUIRED) - Pack UOM (default: 'UNIT')
- `base_uom` (text, REQUIRED) - Base UOM (default: 'UNIT')
- `units_per_pack` (int, REQUIRED) - Conversion (default: 1)
- `packages_per_box` (int)
- `tablets_per_strip` (int) - Pharma-specific

**Pricing:**
- `cost_per_unit` (numeric 15,4) - Purchase cost
- `mrp_per_unit` (numeric 15,2, REQUIRED) - Maximum retail price
- `sale_price_per_unit` (numeric 15,2) - Selling price
- `weighted_average_cost` (numeric 15,4) - WAC calculation
- `last_cost_update` (timestamptz)
- `cost_calculation_method` (text) - Default: 'weighted_average'

**Quality Control:**
- `qc_status` (text) - pending/approved/rejected (default: 'pending')
- `quality_status` (text) - approved/rejected (default: 'approved')
- `qc_date` (date)
- `qc_certificate_number` (text)
- `qc_performed_by` (int, FK)
- `quality_notes` (text)

**Source Tracking:**
- `source_type` (text, REQUIRED) - purchase/production/opening_stock
- `source_reference_id` (int) - GRN/production order ID
- `supplier_id` (int, FK)

**Storage:**
- `storage_condition` (text) - room_temp/refrigerated/frozen (default: 'room_temp')
- `storage_location` (text) - Bin/shelf reference

**Status Flags:**
- `batch_status` (text) - active/expired/recalled (default: 'active')
- `expiry_status` (text) - Auto-calculated
- `recall_status` (text) - Recall flag
- `recall_date` (date)
- `recall_reason` (text)

**Advanced:**
- `serial_numbers` (text[]) - For serialized tracking
- `category_name` (text) - Denormalized for performance
- `category_id` (int)
- `product_type` (text) - Denormalized (default: 'standard')

**Use Cases:**
- FIFO allocation
- Expiry alerts (90/60/30 days)
- Batch recall management
- Weighted average cost calculation

---

### 6. storage_locations
**Hierarchical warehouse location management**

**Key Columns:**
- `location_id` (serial, PK)
- `org_id` (uuid, FK)
- `branch_id` (int, FK, REQUIRED)
- `parent_location_id` (int) - For hierarchy
- `location_code` (text, UNIQUE per org)
- `location_name` (text)
- `location_type` (text, REQUIRED) - warehouse/zone/aisle/rack/bin
- `location_path` (text) - Full path (e.g., "WH1/ZoneA/Aisle3/Rack2")

**Capacity:**
- `storage_capacity` (jsonb) - Volume/weight limits
- `dimensions` (jsonb) - Length/width/height

**Environmental Control:**
- `temperature_controlled` (boolean) - Default: false
- `temperature_range` (jsonb) - Min/max temps
- `humidity_controlled` (boolean) - Default: false
- `humidity_range` (jsonb) - Min/max humidity

**Access Control:**
- `restricted_access` (boolean) - Security flag (default: false)
- `allowed_product_categories` (int[]) - Category restrictions
- `storage_class` (text) - A/B/C classification

**Status:**
- `is_active` (boolean) - Active flag (default: true)
- `is_full` (boolean) - Capacity flag (default: false)

**Use Cases:**
- Multi-level warehouse organization
- Temperature-sensitive storage
- Bin-level stock tracking
- Pick path optimization

**Hierarchy Example:**
```
Warehouse 1
 └─ Zone A (Cold Storage)
     └─ Aisle 3
         └─ Rack 2
             ├─ Bin A
             └─ Bin B
```

---

### 7. location_wise_stock
**Granular stock tracking by location and batch**

**Key Columns:**
- `stock_id` (serial, PK)
- `product_id` (int, FK, REQUIRED)
- `batch_id` (int, FK, REQUIRED)
- `location_id` (int, FK, REQUIRED)
- `org_id` (uuid, FK, REQUIRED)

**Quantities:**
- `quantity_available` (numeric 15,3) - Available for sale (default: 0)
- `quantity_reserved` (numeric 15,3) - Reserved for orders (default: 0)
- `quantity_quarantine` (numeric 15,3) - QC hold (default: 0)

**Tracking:**
- `stock_in_date` (date, REQUIRED) - Default: CURRENT_DATE
- `last_movement_date` (timestamptz)
- `last_counted_date` (date) - Cycle count date
- `unit_cost` (numeric 15,4) - Landed cost

**Bin Details:**
- `bin_number` (text) - Physical bin location
- `pallet_number` (text) - Pallet tracking
- `stock_status` (text) - available/reserved/blocked (default: 'available')

**Use Cases:**
- Bin-level picking
- Location transfer tracking
- Physical inventory counting
- Multi-location FIFO allocation

**Unique Constraint:** (product_id, batch_id, location_id, org_id)

---

### 8. stock_reservations
**Order-based stock reservations with expiry**

**Key Columns:**
- `reservation_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `product_id` (int, FK, REQUIRED)
- `batch_id` (int, FK) - Optional specific batch
- `location_id` (int, FK, REQUIRED)

**Quantities:**
- `reserved_quantity` (numeric 15,3, REQUIRED)
- `fulfilled_quantity` (numeric 15,3) - Default: 0

**Reference:**
- `reference_type` (text, REQUIRED) - sales_order/invoice/challan
- `reference_id` (int, REQUIRED) - Order ID

**Scheduling:**
- `reservation_date` (timestamptz) - Default: CURRENT_TIMESTAMP
- `expires_at` (timestamptz) - Auto-release time
- `priority` (int) - Priority queue (default: 5)

**Status:**
- `reservation_status` (text) - active/fulfilled/expired/cancelled (default: 'active')
- `reserved_by` (int, FK, REQUIRED) - User who reserved

**Use Cases:**
- Order fulfillment pipeline
- Stock blocking for pending orders
- Priority-based allocation
- Auto-expiry of stale reservations

---

### 9. inventory_movements
**Complete audit trail of all stock movements**

**Key Columns:**
- `movement_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `movement_type` (text, REQUIRED) - purchase/sale/transfer/adjustment
- `movement_date` (timestamp) - Default: CURRENT_TIMESTAMP
- `movement_direction` (text, REQUIRED) - in/out

**Item Details:**
- `product_id` (int, FK, REQUIRED)
- `batch_id` (int, FK) - Optional batch reference
- `quantity` (numeric 15,3, REQUIRED)
- `pack_type` (text) - unit/strip/box
- `base_quantity` (numeric 15,3) - Converted to base UOM

**Location:**
- `location_id` (int, FK, REQUIRED) - Default: 1
- `from_location_id` (int, FK) - For transfers
- `to_location_id` (int, FK) - For transfers

**Costing:**
- `unit_cost` (numeric 15,4)
- `total_cost` (numeric 15,2)
- `cost_details` (jsonb) - Detailed cost breakdown

**Reference:**
- `reference_type` (text) - grn/invoice/challan/transfer/adjustment
- `reference_id` (int) - Source document ID
- `reference_number` (text) - Document number
- `transfer_type` (text)
- `transfer_pair_id` (int) - Linked movement ID

**Audit:**
- `reason` (text)
- `notes` (text)
- `pack_display_data` (jsonb) - Pack details
- `created_by` (int, FK, REQUIRED)
- `approved_by` (int, FK)
- `approved_at` (timestamp)

**Use Cases:**
- Full stock movement audit trail
- Cost tracking per movement
- Transfer reconciliation
- Regulatory compliance reporting

---

### 10. stock_transfers
**Header for inter-location stock transfers**

**Key Columns:**
- `transfer_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `transfer_number` (text, UNIQUE per org)
- `transfer_date` (date, REQUIRED)
- `transfer_type` (text, REQUIRED) - branch/location/emergency

**Locations:**
- `from_branch_id` (int, FK) - Source branch
- `to_branch_id` (int, FK) - Destination branch
- `from_location_id` (int, FK, REQUIRED)
- `to_location_id` (int, FK, REQUIRED)

**Details:**
- `transfer_reason` (text, REQUIRED)
- `priority` (text) - normal/urgent/critical (default: 'normal')

**Scheduling:**
- `expected_dispatch_date` (date)
- `expected_delivery_date` (date)
- `actual_dispatch_date` (date)
- `actual_delivery_date` (date)

**Logistics:**
- `transport_mode` (text) - road/rail/air
- `transporter_name` (text)
- `vehicle_number` (text)
- `lr_number` (text) - Lorry receipt
- `lr_date` (date)

**Workflow:**
- `transfer_status` (text) - draft/approved/dispatched/in_transit/received/cancelled (default: 'draft')
- `requested_by` (int, FK, REQUIRED)
- `approved_by` (int, FK)
- `approved_at` (timestamptz)
- `received_by` (int, FK)
- `received_at` (timestamptz)

**Documents:**
- `documents` (jsonb) - Attachments (default: [])

**Use Cases:**
- Branch-to-branch transfers
- Warehouse replenishment
- Emergency stock movements
- Transit tracking

---

### 11. stock_transfer_items
**Line items for stock transfers**

**Key Columns:**
- `transfer_item_id` (serial, PK)
- `transfer_id` (int, FK, REQUIRED)
- `product_id` (int, FK, REQUIRED)
- `batch_id` (int, FK) - Optional batch

**Quantities:**
- `requested_quantity` (numeric 15,3, REQUIRED)
- `approved_quantity` (numeric 15,3)
- `dispatched_quantity` (numeric 15,3)
- `received_quantity` (numeric 15,3)
- `shortage_quantity` (numeric 15,3) - Short received
- `damage_quantity` (numeric 15,3) - Damaged in transit

**Pack Details:**
- `pack_type` (text, REQUIRED) - unit/strip/box
- `pack_size` (int)

**Discrepancy Tracking:**
- `discrepancy_reason` (text) - Why shortage/damage occurred
- `item_status` (text) - pending/approved/dispatched/received (default: 'pending')
- `dispatch_notes` (text)
- `receipt_notes` (text)

**Use Cases:**
- Transfer line item tracking
- Shortage/damage documentation
- Acceptance variance tracking

**Cascade:** ON DELETE CASCADE (with stock_transfers)

---

### 12. reorder_suggestions
**Automated reorder alerts based on consumption**

**Key Columns:**
- `suggestion_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `product_id` (int, FK, REQUIRED)

**Stock Analysis:**
- `current_stock` (numeric 15,3, REQUIRED)
- `reserved_stock` (numeric 15,3) - Default: 0
- `available_stock` (numeric 15,3) - Calculated
- `reorder_level` (numeric 15,3)
- `min_stock_level` (numeric 15,3)

**Calculations:**
- `suggested_quantity` (numeric 15,3, REQUIRED)
- `average_daily_consumption` (numeric 15,3) - Based on history
- `lead_time_days` (int) - Supplier lead time
- `safety_stock_days` (int) - Buffer stock

**Supplier:**
- `preferred_supplier_id` (int, FK)
- `last_purchase_price` (numeric 15,2)
- `last_purchase_date` (date)

**Priority:**
- `urgency` (text, REQUIRED) - low/medium/high/critical
- `suggested_order_date` (date)

**Action Tracking:**
- `suggestion_status` (text) - pending/ordered/ignored/expired (default: 'pending')
- `action_taken` (text)
- `action_taken_by` (int, FK)
- `action_taken_at` (timestamptz)

**Use Cases:**
- Automated procurement planning
- Stock-out prevention
- Lead time-aware ordering
- Consumption-based forecasting

---

### 13. movement_summary
**⚠️ VIEW: Aggregated movement analytics**

**Columns:**
- `movement_type` (text)
- `product_id` (int)
- `quantity` (numeric 15,3)
- `movement_date` (date)
- `document_number` (text)
- `party_name` (text)
- `org_id` (uuid)

**Use Cases:**
- Movement analytics dashboard
- Fast/slow moving analysis
- Period-wise movement reports

**Note:** This is likely a materialized view or view, not a table.

---

### 14. competitor_pricing ⭐ NEW
**Competitive price intelligence tracking**

**Key Columns:**
- `competitor_price_id` (serial, PK)
- `org_id` (int, FK, REQUIRED) - ⚠️ Should be UUID
- `product_id` (int, FK)
- `competitor_name` (text, REQUIRED)

**Pricing:**
- `competitor_price` (numeric 12,2, REQUIRED)
- `competitor_mrp` (numeric 12,2)

**Intelligence:**
- `data_source` (text) - website/manual/api
- `price_comparison` (jsonb) - Comparison analytics
- `last_updated` (timestamp) - Default: CURRENT_TIMESTAMP

**Status:**
- `is_active` (boolean) - Default: true

**Use Cases:**
- Market price monitoring
- Competitive pricing strategy
- Price positioning analysis
- Alert generation for price changes

---

### 15. price_alerts ⭐ NEW
**Automated price monitoring and alerts**

**Key Columns:**
- `alert_id` (serial, PK)
- `org_id` (int, FK, REQUIRED) - ⚠️ Should be UUID
- `product_id` (int, FK)
- `batch_id` (int, FK)

**Alert Details:**
- `alert_type` (text, REQUIRED) - spike/drop/volatility/margin/competitor
- `alert_severity` (text) - low/medium/high/critical
- `alert_message` (text, REQUIRED)

**Price Analysis:**
- `current_price` (numeric 12,2)
- `average_price` (numeric 12,2)
- `competitor_price` (numeric 12,2)
- `price_change_percent` (numeric 5,2)
- `margin_impact_percent` (numeric 5,2)
- `price_volatility` (numeric 12,2)
- `price_difference_percent` (numeric 5,2)

**Data:**
- `price_data` (jsonb) - Full price context
- `price_variance_data` (jsonb) - Statistical variance
- `competitor_data` (jsonb) - Competitor comparison

**Acknowledgment:**
- `acknowledged` (boolean) - Default: false
- `acknowledged_by` (int, FK)
- `acknowledged_at` (timestamp)
- `created_at` (timestamp) - Default: CURRENT_TIMESTAMP

**Use Cases:**
- Price spike alerts
- Margin erosion warnings
- Volatility monitoring
- Competitive undercutting alerts

---

### 16. price_change_log ⭐ NEW
**Complete audit trail of all price changes**

**Key Columns:**
- `log_id` (serial, PK)
- `org_id` (int, FK, REQUIRED) - ⚠️ Should be UUID
- `product_id` (int, FK)
- `batch_id` (int, FK)

**Change Details:**
- `change_type` (text, REQUIRED) - cost/mrp/sale_price/purchase_price
- `old_value` (numeric 12,2)
- `new_value` (numeric 12,2)
- `change_reason` (text)

**Approval Workflow:**
- `requires_approval` (boolean) - Default: false
- `changed_by` (int, FK)
- `approved_by` (int, FK)
- `approved_at` (timestamp)
- `created_at` (timestamp) - Default: CURRENT_TIMESTAMP

**Use Cases:**
- Price change audit trail
- Approval workflow
- Regulatory compliance
- Change analysis

---

### 17. price_history ⭐ NEW
**Historical price tracking for trend analysis**

**Key Columns:**
- `history_id` (serial, PK)
- `org_id` (int, FK, REQUIRED) - ⚠️ Should be UUID
- `product_id` (int, FK)
- `batch_id` (int, FK)

**Price Data:**
- `price_type` (text, REQUIRED) - cost/mrp/sale/purchase
- `old_price` (numeric 12,2)
- `new_price` (numeric 12,2)
- `change_percent` (numeric 5,2)

**Audit:**
- `change_reason` (text)
- `changed_by` (int, FK)
- `changed_at` (timestamp) - Default: CURRENT_TIMESTAMP
- `source_reference` (text) - Document reference

**Use Cases:**
- Price trend analysis
- Time-series charting
- Inflation tracking
- Historical cost analysis

---

## Relationships

### Product Hierarchy:
```
organizations
 └─ product_categories (hierarchical)
     └─ products
         ├─ batches (many)
         │   └─ location_wise_stock (many)
         ├─ stock_reservations (many)
         └─ competitor_pricing (many)
```

### Stock Movement Flow:
```
products + batches
 ├─ inventory_movements (audit trail)
 ├─ stock_transfers → stock_transfer_items
 └─ stock_reservations → allocation
```

### Pricing Intelligence:
```
products
 ├─ competitor_pricing (market data)
 ├─ price_alerts (monitoring)
 ├─ price_change_log (audit)
 └─ price_history (trends)
```

---

## Multi-Tenant Security

### RLS Policies:
- **products, batches, locations:** ✅ Enabled
- **stock_reservations, movements:** Filtered by org_id FK

### ⚠️ Data Type Inconsistency:
New pricing tables use `org_id INTEGER` instead of `UUID`:
- competitor_pricing.org_id: INTEGER (should be UUID)
- price_alerts.org_id: INTEGER (should be UUID)
- price_change_log.org_id: INTEGER (should be UUID)
- price_history.org_id: INTEGER (should be UUID)

**Recommendation:** Standardize to UUID for consistency with rest of schema.

---

## Performance Optimizations

### Indexes:
- **products:** Full-text search (name, code), barcode lookup
- **batches:** Expiry date range, product+batch lookup, FIFO sorting
- **location_wise_stock:** (product_id, batch_id, location_id) composite
- **inventory_movements:** Reference lookup, date range

### Common Queries:
- Expiring batches (next 90/60/30 days)
- Available stock by product/location
- FIFO batch allocation
- Reorder suggestions (below reorder level)
- Price trend analysis

---

## Business Intelligence Features

### 1. FIFO Allocation:
- Auto-allocate oldest batches first
- Consider expiry dates
- Location-aware allocation

### 2. Expiry Management:
- 90-day alerts (warning)
- 60-day alerts (urgent)
- 30-day alerts (critical)
- Auto-quarantine expired stock

### 3. Pricing Intelligence:
- Competitor price tracking
- Price volatility alerts
- Margin impact analysis
- Historical trend analysis

### 4. Reorder Automation:
- Consumption-based forecasting
- Lead time consideration
- Safety stock calculation
- Auto-generated POs

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [02_parties_schema.md](./02_parties_schema.md) - Suppliers
- [04_sales_schema.md](./04_sales_schema.md) - Sales allocation
- [05_procurement_schema.md](./05_procurement_schema.md) - Purchase orders

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 17 (+5 pricing tables from previous documentation)
**Key Features:** Batch Tracking, FIFO Allocation, Multi-Location, Pricing Intelligence, Expiry Management
**Data Type Issues:** 4 pricing tables use INTEGER for org_id (should be UUID)
