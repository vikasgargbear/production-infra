# Inventory Schema Documentation

## Overview
The `inventory` schema manages stock, batches, locations, and inventory movements. This is critical for pharmaceutical inventory management with batch tracking, expiry management, and regulatory compliance.

---

## Tables

### 1. product_categories

### product_categories
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_product_categories()`, `api.create_product_categorie()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `category_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `parent_category_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `category_code` | TEXT | ✓ | Description needed | Standard field usage |
| `category_name` | TEXT | ✓ | Description needed | Standard field usage |
| `category_level` | INTEGER | - | Description needed | Standard field usage |
| `category_path` | TEXT | - | Description needed | Standard field usage |
| `category_type` | TEXT | - | Description needed | Standard field usage |
| `requires_prescription` | BOOLEAN | - | Description needed | Standard field usage |
| `requires_license` | BOOLEAN | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `icon_name` | TEXT | - | Description needed | Standard field usage |
| `color_code` | TEXT | - | Description needed | Standard field usage |
| `default_hsn_code` | TEXT | - | Description needed | Standard field usage |
| `default_gst_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_category_id` → `inventory.product_categories.category_id`

---

### 2. product_types

### product_types
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_product_types()`, `api.create_product_type()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `type_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `type_code` | TEXT | ✓ | Description needed | Standard field usage |
| `type_name` | TEXT | ✓ | Description needed | Standard field usage |
| `default_base_uom` | TEXT | ✓ | Description needed | Standard field usage |
| `default_purchase_uom` | TEXT | - | Description needed | Standard field usage |
| `default_sale_uom` | TEXT | - | Description needed | Standard field usage |
| `default_display_uom` | TEXT | - | Description needed | Standard field usage |
| `typical_pack_sizes` | INTEGER[] | - | Description needed | Standard field usage |
| `is_liquid` | BOOLEAN | - | Description needed | Standard field usage |
| `is_injectable` | BOOLEAN | - | Description needed | Standard field usage |
| `requires_cold_storage` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |

---

### 3. units_of_measure

### units_of_measure
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_units_of_measure()`, `api.create_units_of_measure()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `uom_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `uom_code` | TEXT | ✓ | Description needed | Standard field usage |
| `uom_name` | TEXT | ✓ | Description needed | Standard field usage |
| `uom_type` | TEXT | ✓ | Description needed | Standard field usage |
| `base_uom_code` | TEXT | - | Description needed | Standard field usage |
| `conversion_factor` | NUMERIC(15 | - | Description needed | Standard field usage |
| `symbol` | TEXT | - | Description needed | Standard field usage |
| `decimal_places` | INTEGER | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 4. products

### products
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_products()`, `api.create_product()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `product_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_code` | TEXT | ✓ | Description needed | Standard field usage |
| `product_name` | TEXT | ✓ | Description needed | Standard field usage |
| `generic_name` | TEXT | - | Description needed | Standard field usage |
| `brand` | TEXT | - | Description needed | Standard field usage |
| `manufacturer` | TEXT | - | Description needed | Standard field usage |
| `category_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_type` | TEXT | - | Description needed | Standard field usage |
| `product_class` | TEXT | - | Description needed | Standard field usage |
| `composition` | JSONB | - | Description needed | Standard field usage |
| `strength` | TEXT | - | Description needed | Standard field usage |
| `hsn_code` | TEXT | - | Description needed | Standard field usage |
| `drug_schedule` | TEXT | - | Description needed | Standard field usage |
| `requires_prescription` | BOOLEAN | - | Description needed | Standard field usage |
| `is_narcotic` | BOOLEAN | - | Description needed | Standard field usage |
| `is_controlled_substance` | BOOLEAN | - | Description needed | Standard field usage |
| `barcode` | TEXT | - | Description needed | Standard field usage |
| `manufacturer_code` | TEXT | - | Description needed | Standard field usage |
| `pack_config` | JSONB | - | Description needed | Standard field usage |
| `base_uom_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `gst_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cess_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `storage_conditions` | TEXT | - | Description needed | Standard field usage |
| `requires_cold_chain` | BOOLEAN | - | Description needed | Standard field usage |
| `maintain_batch` | BOOLEAN | - | Description needed | Standard field usage |
| `maintain_expiry` | BOOLEAN | - | Description needed | Standard field usage |
| `allow_negative_stock` | BOOLEAN | - | Description needed | Standard field usage |
| `min_stock_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reorder_level` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reorder_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `max_stock_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `critical_stock_level` | NUMERIC(15 | - | Description needed | Standard field usage |
| `product_status` | TEXT | - | Description needed | Standard field usage |
| `launch_date` | DATE | - | Description needed | Standard field usage |
| `discontinuation_date` | DATE | - | Description needed | Standard field usage |
| `search_keywords` | TEXT[] | - | Description needed | Standard field usage |
| `tags` | TEXT[] | - | Description needed | Standard field usage |
| `product_images` | JSONB | - | Description needed | Standard field usage |
| `documents` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_saleable` | BOOLEAN | - | Description needed | Standard field usage |
| `is_purchasable` | BOOLEAN | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `category_id` → `inventory.product_categories.category_id`
- `base_uom_id` → `inventory.units_of_measure.uom_id`
- `created_by` → `master.org_users.user_id`

---

### 5. product_pack_configurations

### product_pack_configurations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_product_pack_configurations()`, `api.create_product_pack_configuration()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `pack_config_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `config_name` | TEXT | ✓ | Description needed | Standard field usage |
| `base_uom` | TEXT | ✓ | Description needed | Standard field usage |
| `base_units_per_pack` | INTEGER | ✓ | Description needed | Standard field usage |
| `pack_uom` | TEXT | ✓ | Description needed | Standard field usage |
| `packs_per_box` | INTEGER | - | Description needed | Standard field usage |
| `box_uom` | TEXT | - | Description needed | Standard field usage |
| `boxes_per_case` | INTEGER | - | Description needed | Standard field usage |
| `case_uom` | TEXT | - | Description needed | Standard field usage |
| `pack_label_format` | TEXT | - | Description needed | Standard field usage |
| `barcode_format` | TEXT | - | Description needed | Standard field usage |
| `pricing_levels` | JSONB | - | Description needed | Standard field usage |
| `is_default` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `product_id` → `inventory.products.product_id`

---

### 6. batches

### batches
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_batches()`, `api.create_batche()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `batch_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | ✓ | Description needed | Standard field usage |
| `alternate_batch_number` | TEXT | - | Description needed | Standard field usage |
| `manufacturing_date` | DATE | - | Description needed | Standard field usage |
| `expiry_date` | DATE | ✓ | Description needed | Standard field usage |
| `retesting_date` | DATE | - | Description needed | Standard field usage |
| `initial_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `quantity_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_reserved` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_quarantine` | NUMERIC(15 | - | Description needed | Standard field usage |
| `location_count` | INTEGER | - | Description needed | Standard field usage |
| `primary_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `cost_per_unit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `mrp_per_unit` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `sale_price_per_unit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `trade_price_per_unit` | NUMERIC(15 | - | Description needed | Standard field usage |
| `strip_mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `strip_ptr` | NUMERIC(15 | - | Description needed | Standard field usage |
| `strip_pts` | NUMERIC(15 | - | Description needed | Standard field usage |
| `box_mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `box_ptr` | NUMERIC(15 | - | Description needed | Standard field usage |
| `box_pts` | NUMERIC(15 | - | Description needed | Standard field usage |
| `case_mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `case_ptr` | NUMERIC(15 | - | Description needed | Standard field usage |
| `case_pts` | NUMERIC(15 | - | Description needed | Standard field usage |
| `qc_status` | TEXT | - | Description needed | Standard field usage |
| `qc_date` | DATE | - | Description needed | Standard field usage |
| `qc_certificate_number` | TEXT | - | Description needed | Standard field usage |
| `qc_performed_by` | INTEGER | - | Description needed | Standard field usage |
| `source_type` | TEXT | ✓ | Description needed | Standard field usage |
| `source_reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `supplier_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `weighted_average_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `last_cost_update` | TIMESTAMP | - | Description needed | Standard field usage |
| `cost_calculation_method` | TEXT | - | Description needed | Standard field usage |
| `batch_status` | TEXT | - | Description needed | Standard field usage |
| `expiry_status` | TEXT | - | Description needed | Standard field usage |
| `recall_status` | TEXT | - | Description needed | Standard field usage |
| `recall_date` | DATE | - | Description needed | Standard field usage |
| `recall_reason` | TEXT | - | Description needed | Standard field usage |
| `serial_numbers` | TEXT[] | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `qc_performed_by` → `master.org_users.user_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `created_by` → `master.org_users.user_id`

---

### 7. storage_locations

### storage_locations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_storage_locations()`, `api.create_storage_location()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `location_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `parent_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `location_code` | TEXT | ✓ | Description needed | Standard field usage |
| `location_name` | TEXT | ✓ | Description needed | Standard field usage |
| `location_type` | TEXT | ✓ | Description needed | Standard field usage |
| `location_path` | TEXT | - | Description needed | Standard field usage |
| `storage_capacity` | JSONB | - | Description needed | Standard field usage |
| `dimensions` | JSONB | - | Description needed | Standard field usage |
| `temperature_controlled` | BOOLEAN | - | Description needed | Standard field usage |
| `temperature_range` | JSONB | - | Description needed | Standard field usage |
| `humidity_controlled` | BOOLEAN | - | Description needed | Standard field usage |
| `humidity_range` | JSONB | - | Description needed | Standard field usage |
| `restricted_access` | BOOLEAN | - | Description needed | Standard field usage |
| `allowed_product_categories` | INTEGER[] | - | Description needed | Standard field usage |
| `storage_class` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_full` | BOOLEAN | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `parent_location_id` → `inventory.storage_locations.location_id`

---

### 8. location_wise_stock

### location_wise_stock
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_location_wise_stock()`, `api.create_location_wise_stock()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `stock_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `quantity_available` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_reserved` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_quarantine` | NUMERIC(15 | - | Description needed | Standard field usage |
| `stock_in_date` | DATE | - | Description needed | Standard field usage |
| `unit_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `bin_number` | TEXT | - | Description needed | Standard field usage |
| `pallet_number` | TEXT | - | Description needed | Standard field usage |
| `stock_status` | TEXT | - | Description needed | Standard field usage |
| `last_movement_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `last_counted_date` | DATE | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `last_updated` | TIMESTAMP | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `product_id` → `inventory.products.product_id`
- `batch_id` → `inventory.batches.batch_id`
- `location_id` → `inventory.storage_locations.location_id`
- `org_id` → `master.organizations.org_id`

---

### 9. stock_reservations

### stock_reservations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_stock_reservations()`, `api.create_stock_reservation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `reservation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reserved_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `fulfilled_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reference_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `reservation_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `expires_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `priority` | INTEGER | - | Description needed | Standard field usage |
| `reservation_status` | TEXT | - | Description needed | Standard field usage |
| `reserved_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `batch_id` → `inventory.batches.batch_id`
- `location_id` → `inventory.storage_locations.location_id`
- `reserved_by` → `master.org_users.user_id`

---

### 10. inventory_movements

### inventory_movements
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_inventory_movements()`, `api.create_inventory_movement()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `movement_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `movement_type` | TEXT | ✓ | Description needed | Standard field usage |
| `movement_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `movement_direction` | TEXT | ✓ | Description needed | Standard field usage |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | - | Description needed | Standard field usage |
| `base_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `from_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `to_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `unit_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_cost` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `reference_number` | TEXT | - | Description needed | Standard field usage |
| `transfer_type` | TEXT | - | Description needed | Standard field usage |
| `transfer_pair_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `reason` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `pack_display_data` | JSONB | - | Description needed | Standard field usage |
| `cost_details` | JSONB | - | Description needed | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `batch_id` → `inventory.batches.batch_id`
- `location_id` → `inventory.storage_locations.location_id`
- `from_location_id` → `inventory.storage_locations.location_id`
- `to_location_id` → `inventory.storage_locations.location_id`
- `transfer_pair_id` → `inventory.inventory_movements.movement_id`
- `created_by` → `master.org_users.user_id`
- `approved_by` → `master.org_users.user_id`

---

### 11. stock_transfers

### stock_transfers
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_stock_transfers()`, `api.create_stock_transfer()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `transfer_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `transfer_number` | TEXT | ✓ | Description needed | Standard field usage |
| `transfer_date` | DATE | ✓ | Description needed | Standard field usage |
| `transfer_type` | TEXT | ✓ | Description needed | Standard field usage |
| `from_branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `to_branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `from_location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `to_location_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `transfer_reason` | TEXT | ✓ | Description needed | Standard field usage |
| `priority` | TEXT | - | Description needed | Standard field usage |
| `expected_dispatch_date` | DATE | - | Description needed | Standard field usage |
| `expected_delivery_date` | DATE | - | Description needed | Standard field usage |
| `actual_dispatch_date` | DATE | - | Description needed | Standard field usage |
| `actual_delivery_date` | DATE | - | Description needed | Standard field usage |
| `transport_mode` | TEXT | - | Description needed | Standard field usage |
| `transporter_name` | TEXT | - | Description needed | Standard field usage |
| `vehicle_number` | TEXT | - | Description needed | Standard field usage |
| `lr_number` | TEXT | - | Description needed | Standard field usage |
| `lr_date` | DATE | - | Description needed | Standard field usage |
| `transfer_status` | TEXT | - | Description needed | Standard field usage |
| `requested_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `received_by` | INTEGER | - | Description needed | Standard field usage |
| `received_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `documents` | JSONB | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `from_branch_id` → `master.org_branches.branch_id`
- `to_branch_id` → `master.org_branches.branch_id`
- `from_location_id` → `inventory.storage_locations.location_id`
- `to_location_id` → `inventory.storage_locations.location_id`
- `requested_by` → `master.org_users.user_id`
- `approved_by` → `master.org_users.user_id`
- `received_by` → `master.org_users.user_id`

---

### 12. stock_transfer_items

### stock_transfer_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_stock_transfer_items()`, `api.create_stock_transfer_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `transfer_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `transfer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `requested_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `approved_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `dispatched_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `received_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_size` | INTEGER | - | Description needed | Standard field usage |
| `shortage_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `damage_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discrepancy_reason` | TEXT | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `dispatch_notes` | TEXT | - | Description needed | Standard field usage |
| `receipt_notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `transfer_id` → `inventory.stock_transfers.transfer_id`
- `product_id` → `inventory.products.product_id`
- `batch_id` → `inventory.batches.batch_id`

---

### 13. reorder_suggestions

### reorder_suggestions
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_reorder_suggestions()`, `api.create_reorder_suggestion()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `suggestion_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `current_stock` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `reserved_stock` | NUMERIC(15 | - | Description needed | Standard field usage |
| `available_stock` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reorder_level` | NUMERIC(15 | - | Description needed | Standard field usage |
| `min_stock_level` | NUMERIC(15 | - | Description needed | Standard field usage |
| `suggested_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `average_daily_consumption` | NUMERIC(15 | - | Description needed | Standard field usage |
| `lead_time_days` | INTEGER | - | Description needed | Standard field usage |
| `safety_stock_days` | INTEGER | - | Description needed | Standard field usage |
| `preferred_supplier_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `last_purchase_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `last_purchase_date` | DATE | - | Description needed | Standard field usage |
| `urgency` | TEXT | ✓ | Description needed | Standard field usage |
| `suggested_order_date` | DATE | - | Description needed | Standard field usage |
| `suggestion_status` | TEXT | - | Description needed | Standard field usage |
| `action_taken` | TEXT | - | Description needed | Standard field usage |
| `action_taken_by` | INTEGER | - | Description needed | Standard field usage |
| `action_taken_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `product_id` → `inventory.products.product_id`
- `preferred_supplier_id` → `parties.suppliers.supplier_id`
- `action_taken_by` → `master.org_users.user_id`

---
