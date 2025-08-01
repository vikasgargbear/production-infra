# Inventory Schema Documentation

## Overview
The `inventory` schema manages stock, batches, locations, and inventory movements. This is critical for pharmaceutical inventory management with batch tracking, expiry management, and regulatory compliance.

---

## Tables

### 1. batches
**Purpose**: Batch-wise inventory tracking with expiry and compliance
**API Endpoint**: `api.get_batches()`, `api.create_batch()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `batch_id` | SERIAL | ✓ | Unique batch identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `supplier_id` | INTEGER | - | Supplier reference | Supplier tracking |
| `batch_number` | TEXT | ✓ | Manufacturer's batch number | Batch identification |
| `manufacturing_date` | DATE | - | Date of manufacture | Batch information |
| `expiry_date` | DATE | ✓ | Product expiry date | Expiry alerts, validation |
| `quantity_received` | NUMERIC(15,3) | ✓ | Initial received quantity | Stock tracking |
| `quantity_available` | NUMERIC(15,3) | ✓ | Current available quantity | Stock availability |
| `quantity_sold` | NUMERIC(15,3) | - | Total sold quantity | Sales tracking |
| `quantity_returned` | NUMERIC(15,3) | - | Total returned quantity | Return tracking |
| `quantity_damaged` | NUMERIC(15,3) | - | Damaged quantity | Loss tracking |
| `quantity_expired` | NUMERIC(15,3) | - | Expired quantity | Waste tracking |
| `quantity_reserved` | NUMERIC(15,3) | - | Reserved quantity | Allocation tracking |
| `cost_per_unit` | NUMERIC(15,4) | ✓ | Unit cost price | Cost calculations |
| `selling_price` | NUMERIC(15,4) | - | Unit selling price | Price calculations |
| `mrp` | NUMERIC(15,4) | - | Maximum retail price | Price validation |
| `batch_status` | TEXT | - | Status: 'active', 'expired', 'damaged', 'recalled' | Status filtering |
| `expiry_status` | TEXT | - | Expiry status: 'fresh', 'near_expiry', 'expired' | Expiry management |
| `qc_status` | TEXT | - | Quality control: 'passed', 'failed', 'pending' | Quality tracking |
| `qc_date` | DATE | - | Quality check date | Quality records |
| `qc_notes` | TEXT | - | Quality check notes | Quality documentation |
| `storage_condition` | TEXT | - | Required storage conditions | Storage compliance |
| `last_movement_date` | DATE | - | Last stock movement date | Activity tracking |
| `is_narcotic` | BOOLEAN | - | Narcotic drug flag | Regulatory compliance |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "batch_id": 1,
  "product_id": 101,
  "batch_number": "BT240115001",
  "expiry_date": "2025-01-15",
  "quantity_available": 500.0,
  "cost_per_unit": 10.50,
  "selling_price": 15.75,
  "mrp": 18.00,
  "batch_status": "active",
  "expiry_status": "fresh",
  "days_to_expiry": 45
}
```

---

### 2. location_wise_stock
**Purpose**: Stock distribution across storage locations
**API Endpoint**: `api.get_location_stock()`, `api.move_stock()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `stock_id` | SERIAL | ✓ | Unique stock record identifier | Primary key |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `batch_id` | INTEGER | ✓ | Batch reference | Batch tracking |
| `location_id` | INTEGER | ✓ | Storage location reference | Location tracking |
| `zone_id` | INTEGER | - | Storage zone reference | Zone management |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `quantity_available` | NUMERIC(15,3) | ✓ | Available quantity | Stock availability |
| `quantity_reserved` | NUMERIC(15,3) | - | Reserved quantity | Allocation tracking |
| `quantity_quarantine` | NUMERIC(15,3) | - | Quarantined quantity | Quality control |
| `stock_in_date` | DATE | ✓ | Date stock entered location | Movement tracking |
| `stock_status` | TEXT | - | Status: 'available', 'reserved', 'quarantine', 'damaged' | Status filtering |
| `quarantine_reason` | TEXT | - | Reason for quarantine | Quality documentation |
| `unit_cost` | NUMERIC(15,4) | - | Cost per unit at this location | Cost tracking |
| `last_movement_date` | DATE | - | Last movement date | Activity tracking |
| `last_updated` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "stock_id": 1,
  "product_id": 101,
  "batch_id": 1,
  "location_id": 1,
  "quantity_available": 250.0,
  "quantity_reserved": 50.0,
  "stock_status": "available",
  "stock_in_date": "2024-01-15",
  "unit_cost": 10.50
}
```

---

### 3. storage_locations
**Purpose**: Physical storage location management
**API Endpoint**: `api.get_locations()`, `api.create_location()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `location_id` | SERIAL | ✓ | Unique location identifier | Primary key |
| `branch_id` | INTEGER | ✓ | Branch reference | Branch association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `location_code` | TEXT | ✓ | Location identification code | Location selection |
| `location_name` | TEXT | ✓ | Location display name | Display name |
| `location_type` | TEXT | ✓ | Type: 'warehouse', 'store', 'counter', 'cold_storage' | Location classification |
| `storage_class` | TEXT | - | Class: 'general', 'refrigerated', 'controlled', 'quarantine' | Storage requirements |
| `parent_location_id` | INTEGER | - | Parent location for hierarchy | Location hierarchy |
| `location_path` | TEXT | - | Full path (e.g., 'Warehouse/Zone-A/Rack-1') | Location navigation |
| `address` | TEXT | - | Physical address | Location information |
| `capacity_units` | NUMERIC(15,3) | - | Storage capacity | Capacity planning |
| `current_utilization` | NUMERIC(15,3) | - | Current stock volume | Utilization tracking |
| `temperature_min` | NUMERIC(5,2) | - | Minimum temperature | Environmental control |
| `temperature_max` | NUMERIC(5,2) | - | Maximum temperature | Environmental control |
| `humidity_min` | NUMERIC(5,2) | - | Minimum humidity | Environmental control |
| `humidity_max` | NUMERIC(5,2) | - | Maximum humidity | Environmental control |
| `is_receiving_location` | BOOLEAN | - | Receiving area flag | Goods receipt |
| `is_shipping_location` | BOOLEAN | - | Shipping area flag | Dispatch operations |
| `is_returns_location` | BOOLEAN | - | Returns processing flag | Return handling |
| `barcode` | TEXT | - | Location barcode | Scanning integration |
| `qr_code` | TEXT | - | Location QR code | Mobile integration |
| `is_active` | BOOLEAN | - | Location active status | Location filtering |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**Example API Response**:
```json
{
  "location_id": 1,
  "location_code": "WH-A-R01",
  "location_name": "Warehouse A - Rack 1",
  "location_type": "warehouse",
  "storage_class": "general",
  "capacity_units": 1000.0,
  "current_utilization": 650.0,
  "temperature_min": 15.0,
  "temperature_max": 25.0,
  "is_active": true
}
```

---

### 4. inventory_movements
**Purpose**: Complete audit trail of all stock movements
**API Endpoint**: `api.get_movements()`, `api.create_movement()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `movement_id` | SERIAL | ✓ | Unique movement identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `movement_type` | TEXT | ✓ | Type: 'purchase', 'sale', 'transfer', 'adjustment', 'return' | Movement classification |
| `movement_date` | DATE | ✓ | Movement date | Date filtering |
| `movement_direction` | TEXT | ✓ | Direction: 'in', 'out', 'transfer', 'none' | Direction filtering |
| `product_id` | INTEGER | ✓ | Product reference | Product tracking |
| `batch_id` | INTEGER | - | Batch reference | Batch tracking |
| `from_location_id` | INTEGER | - | Source location | Transfer tracking |
| `to_location_id` | INTEGER | - | Destination location | Transfer tracking |
| `location_id` | INTEGER | - | Primary location | Location tracking |
| `quantity` | NUMERIC(15,3) | ✓ | Movement quantity | Quantity tracking |
| `base_quantity` | NUMERIC(15,3) | - | Quantity in base UOM | Standardized tracking |
| `unit_cost` | NUMERIC(15,4) | - | Cost per unit | Cost tracking |
| `total_cost` | NUMERIC(15,2) | - | Total movement cost | Financial tracking |
| `reference_type` | TEXT | - | Reference document type | Document linking |
| `reference_id` | INTEGER | - | Reference document ID | Document linking |
| `reference_number` | TEXT | - | Reference document number | Document identification |
| `party_id` | INTEGER | - | Customer/supplier ID | Party tracking |
| `reason` | TEXT | - | Movement reason/notes | Documentation |
| `created_by` | INTEGER | - | User who created movement | User tracking |
| `approved_by` | INTEGER | - | User who approved movement | Approval tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "movement_id": 1,
  "movement_type": "sale",
  "movement_date": "2024-01-15",
  "movement_direction": "out",
  "product_id": 101,
  "batch_id": 1,
  "location_id": 1,
  "quantity": 10.0,
  "unit_cost": 10.50,
  "total_cost": 105.00,
  "reference_type": "invoice",
  "reference_number": "INV-2024-001",
  "reason": "Sale to customer"
}
```

---

### 5. stock_reservations
**Purpose**: Stock allocation and reservation management
**API Endpoint**: `api.get_reservations()`, `api.create_reservation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reservation_id` | SERIAL | ✓ | Unique reservation identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | ✓ | Product reference | Product tracking |
| `batch_id` | INTEGER | - | Specific batch reservation | Batch allocation |
| `location_id` | INTEGER | ✓ | Location reference | Location tracking |
| `customer_id` | INTEGER | - | Customer reference | Customer allocation |
| `reserved_quantity` | NUMERIC(15,3) | ✓ | Reserved quantity | Reservation tracking |
| `fulfilled_quantity` | NUMERIC(15,3) | - | Fulfilled quantity | Fulfillment tracking |
| `remaining_quantity` | NUMERIC(15,3) | - | Remaining to fulfill | Balance tracking |
| `reservation_date` | DATE | ✓ | Reservation date | Date tracking |
| `expires_at` | TIMESTAMPTZ | - | Reservation expiry | Expiry management |
| `priority` | INTEGER | - | Reservation priority | Priority management |
| `reservation_status` | TEXT | ✓ | Status: 'active', 'fulfilled', 'expired', 'cancelled' | Status filtering |
| `reference_type` | TEXT | - | Reference document type | Document linking |
| `reference_id` | INTEGER | - | Reference document ID | Document linking |
| `notes` | TEXT | - | Reservation notes | Documentation |
| `created_by` | INTEGER | - | User who created reservation | User tracking |
| `fulfilled_by` | INTEGER | - | User who fulfilled reservation | Fulfillment tracking |
| `released_at` | TIMESTAMPTZ | - | Release timestamp | Release tracking |
| `release_reason` | TEXT | - | Release reason | Release documentation |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "reservation_id": 1,
  "product_id": 101,
  "location_id": 1,
  "customer_id": 1,
  "reserved_quantity": 25.0,
  "fulfilled_quantity": 0.0,
  "remaining_quantity": 25.0,
  "reservation_date": "2024-01-15",
  "expires_at": "2024-01-22T18:00:00Z",
  "reservation_status": "active",
  "priority": 1
}
```

---

### 6. stock_adjustments
**Purpose**: Stock adjustment tracking for corrections
**API Endpoint**: `api.get_adjustments()`, `api.create_adjustment()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `adjustment_id` | SERIAL | ✓ | Unique adjustment identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `adjustment_number` | TEXT | ✓ | Adjustment document number | Document identification |
| `adjustment_date` | DATE | ✓ | Adjustment date | Date filtering |
| `adjustment_type` | TEXT | ✓ | Type: 'physical_count', 'damage', 'expiry', 'theft', 'correction' | Adjustment classification |
| `product_id` | INTEGER | ✓ | Product reference | Product tracking |
| `batch_id` | INTEGER | - | Batch reference | Batch tracking |
| `location_id` | INTEGER | ✓ | Location reference | Location tracking |
| `system_quantity` | NUMERIC(15,3) | ✓ | System recorded quantity | System tracking |
| `physical_quantity` | NUMERIC(15,3) | ✓ | Actual physical quantity | Physical count |
| `adjustment_quantity` | NUMERIC(15,3) | ✓ | Difference quantity | Adjustment amount |
| `adjustment_direction` | TEXT | ✓ | Direction: 'increase', 'decrease' | Direction tracking |
| `unit_cost` | NUMERIC(15,4) | - | Cost per unit | Cost impact |
| `total_cost_impact` | NUMERIC(15,2) | - | Total financial impact | Financial tracking |
| `reason` | TEXT | ✓ | Adjustment reason | Documentation |
| `approval_status` | TEXT | - | Status: 'pending', 'approved', 'rejected' | Approval workflow |
| `approved_by` | INTEGER | - | Approver user ID | Approval tracking |
| `approved_at` | TIMESTAMPTZ | - | Approval timestamp | Approval tracking |
| `created_by` | INTEGER | - | User who created adjustment | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**Example API Response**:
```json
{
  "adjustment_id": 1,
  "adjustment_number": "ADJ-2024-001",
  "adjustment_date": "2024-01-15",
  "adjustment_type": "physical_count",
  "product_id": 101,
  "system_quantity": 100.0,
  "physical_quantity": 95.0,
  "adjustment_quantity": -5.0,
  "adjustment_direction": "decrease",
  "reason": "Physical count discrepancy",
  "approval_status": "approved"
}
```

---

### 7. product_suppliers
**Purpose**: Product-supplier relationship mapping
**API Endpoint**: `api.get_product_suppliers()`, `api.create_product_supplier()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `mapping_id` | SERIAL | ✓ | Unique mapping identifier | Primary key |
| `product_id` | INTEGER | ✓ | Product reference | Product association |
| `supplier_id` | INTEGER | ✓ | Supplier reference | Supplier association |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `supplier_product_code` | TEXT | - | Supplier's product code | Supplier catalog |
| `supplier_product_name` | TEXT | - | Supplier's product name | Supplier reference |
| `purchase_unit` | TEXT | - | Purchase unit of measurement | Purchase planning |
| `minimum_order_quantity` | NUMERIC(15,3) | - | Minimum order quantity | Order planning |
| `purchase_rate` | NUMERIC(15,4) | - | Current purchase rate | Cost planning |
| `discount_percentage` | NUMERIC(5,2) | - | Standard discount % | Cost calculations |
| `lead_time_days` | INTEGER | - | Lead time in days | Planning calculations |
| `is_preferred_supplier` | BOOLEAN | - | Preferred supplier flag | Supplier prioritization |
| `quality_rating` | NUMERIC(3,2) | - | Quality rating (1-5) | Supplier evaluation |
| `last_purchase_date` | DATE | - | Last purchase date | Purchase tracking |
| `last_purchase_rate` | NUMERIC(15,4) | - | Last purchase rate | Rate tracking |
| `is_active` | BOOLEAN | - | Mapping active status | Supplier filtering |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

## API Integration Notes

### Batch Management
```javascript
// Create batch with expiry validation
const batch = {
  product_id: 101,
  batch_number: "BT240115001",
  expiry_date: "2025-01-15",
  quantity_received: 1000,
  cost_per_unit: 10.50
};

// Expiry status calculation
const daysToExpiry = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
const expiryStatus = daysToExpiry > 90 ? 'fresh' : daysToExpiry > 30 ? 'near_expiry' : 'expired';
```

### Stock Availability Check
```javascript
// Check stock availability across locations
GET /api/stock/availability?
  product_id=101&
  required_quantity=50&
  location_id=1&
  exclude_expired=true&
  exclude_reserved=false

// Response includes batch-wise availability
{
  "product_id": 101,
  "total_available": 245.0,
  "batches": [
    {
      "batch_id": 1,
      "batch_number": "BT240115001",
      "expiry_date": "2025-01-15",
      "available_quantity": 150.0,
      "location_id": 1
    }
  ]
}
```

### Stock Movement Tracking
```javascript
// Create stock movement
const movement = {
  movement_type: "sale",
  movement_direction: "out",
  product_id: 101,
  batch_id: 1,
  location_id: 1,
  quantity: 10,
  reference_type: "invoice",
  reference_id: 1,
  reason: "Sale to customer ABC"
};
```

### Reservation Management
```javascript
// Reserve stock for order
const reservation = {
  product_id: 101,
  location_id: 1,
  customer_id: 1,
  reserved_quantity: 25,
  expires_at: "2024-01-22T18:00:00Z",
  reference_type: "sales_order",
  reference_id: 1
};

// Auto-release expired reservations (handled by triggers)
```

### Search and Filtering
```javascript
// Advanced inventory search
GET /api/inventory/search?
  product_name=paracetamol&     // Product search
  batch_status=active&          // Active batches only
  location_type=warehouse&      // Warehouse locations
  expiry_date_from=2024-01-01&  // Expiry range
  expiry_date_to=2024-12-31&
  min_quantity=10&              // Minimum stock
  sort_by=expiry_date&          // Sort by expiry
  order=asc                     // Ascending order
```

### Compliance and Alerts
1. **Expiry Alerts**: Automatic alerts for near-expiry batches
2. **Low Stock Alerts**: Based on minimum stock levels
3. **Narcotic Tracking**: Special handling for controlled substances
4. **Quality Control**: QC status tracking for batches
5. **Temperature Monitoring**: Environmental compliance

### Validation Rules
1. **Batch Numbers**: Must be unique per product per supplier
2. **Expiry Dates**: Cannot be in the past for new batches
3. **Quantities**: Cannot be negative
4. **Movements**: Must balance (in = out + adjustments)
5. **Reservations**: Cannot exceed available stock