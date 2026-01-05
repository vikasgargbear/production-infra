# Inventory Module - Variable Alignment

> **Purpose**: Map frontend variable names to their canonical database column names from `inventory` schema.

> [!TIP]
> **Status**: ✅ **FIXED** on 2026-01-04
> `total_quantity_available` confirmed in backend `inventory.products` table for product-level stock aggregation.

| `inventory.products` | 47 | Product master data |
| `inventory.batches` | 58 | Batch tracking |
| `inventory.inventory_movements` | 29 | Stock movements |
| `inventory.location_wise_stock` | 17 | Stock by location |
| `inventory.reorder_suggestions` | 27 | Reorder alerts |
| `inventory.stock_transfers` | ~30 | Inter-location transfers |

---

## inventory.products

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `product_id` | `product_id` | ✅ |
| `product_code` | `product_code` | ✅ |
| `product_name` | `product_name` | ✅ |
| `generic_name` | `generic_name` | ✅ |
| `brand` | `brand` | ✅ |
| `manufacturer` | `manufacturer` | ✅ |
| `category_id` | `category_id` | ✅ |
| `product_type` | `product_type` | ✅ |
| `product_class` | `product_class` | ✅ |
| `hsn_code` | `hsn_code` | ✅ |
| `gst_percent` | `gst_percent` | ✅ |
| `cess_percentage` | `cess_percentage` | ✅ |
| `drug_schedule` | `drug_schedule` | ✅ |
| `is_narcotic` | `is_narcotic` | ✅ |
| `barcode` | `barcode` | ✅ |
| `min_stock_quantity` | `min_stock_quantity` | ✅ |
| `reorder_level` | `reorder_level` | ✅ |
| `reorder_quantity` | `reorder_quantity` | ✅ |
| `max_stock_quantity` | `max_stock_quantity` | ✅ |
| `product_status` | `product_status` | ✅ |
| `is_active` | `is_active` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `name` | `product_name` | Use `product_name` |
| `code` | `product_code` | Use `product_code` |
| `category` | `category_id` (+ join) | Use `category_id` |
| `tax_rate` | `gst_percent` | Use `gst_percent` |
| `cess_percent` | `cess_percentage` | Use `cess_percentage` |
| `minimum_stock` | `min_stock_quantity` | Use `min_stock_quantity` |
| `maximum_stock` | `max_stock_quantity` | Use `max_stock_quantity` |
| `minimum_stock_level` | `min_stock_quantity` | Use `min_stock_quantity` |
| `maximum_stock_level` | `max_stock_quantity` | Use `max_stock_quantity` |

---

## inventory.batches

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `batch_id` | `batch_id` | ✅ |
| `batch_number` | `batch_number` | ✅ |
| `product_id` | `product_id` | ✅ |
| `manufacturing_date` | `manufacturing_date` | ✅ CANONICAL |
| `expiry_date` | `expiry_date` | ✅ |
| `quantity_available` | `quantity_available` | ✅ CANONICAL |
| `quantity_reserved` | `quantity_reserved` | ✅ |
| `quantity_quarantine` | `quantity_quarantine` | ✅ |
| `initial_quantity` | `initial_quantity` | ✅ |
| `cost_per_unit` | `cost_per_unit` | ✅ CANONICAL |
| `mrp_per_unit` | `mrp_per_unit` | ✅ CANONICAL |
| `sale_price_per_unit` | `sale_price_per_unit` | ✅ CANONICAL |
| `pack_size` | `pack_size` | ✅ |
| `pack_type` | `pack_type` | ✅ |
| `pack_uom` | `pack_uom` | ✅ |
| `base_uom` | `base_uom` | ✅ |
| `units_per_pack` | `units_per_pack` | ✅ |
| `packages_per_box` | `packages_per_box` | ✅ |
| `tablets_per_strip` | `tablets_per_strip` | ✅ |
| `storage_location` | `storage_location` | ✅ |
| `storage_condition` | `storage_condition` | ✅ |
| `batch_status` | `batch_status` | ✅ |
| `expiry_status` | `expiry_status` | ✅ |
| `qc_status` | `qc_status` | ✅ |
| `quality_status` | `quality_status` | ✅ |
| `supplier_id` | `supplier_id` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `batch_no` | `batch_number` | Use `batch_number` |
| `mfg_date` | `manufacturing_date` | Use `manufacturing_date` |
| `exp_date` | `expiry_date` | Use `expiry_date` |
| `available_quantity` | `quantity_available` | Use `quantity_available` |
| `available_qty` | `quantity_available` | Use `quantity_available` |
| `current_stock` | `quantity_available` | Use `quantity_available` |
| `stock` | `quantity_available` | Use `quantity_available` |
| `quantity` | `quantity_available` | Use `quantity_available` |
| `mrp` | `mrp_per_unit` | Use `mrp_per_unit` |
| `cost_price` | `cost_per_unit` | Use `cost_per_unit` |
| `purchase_rate` | `cost_per_unit` | Use `cost_per_unit` |
| `sale_price` | `sale_price_per_unit` | Use `sale_price_per_unit` |
| `selling_price` | `sale_price_per_unit` | Use `sale_price_per_unit` |
| `unit_price` | `sale_price_per_unit` | Use `sale_price_per_unit` *(batch context)* |
| `rate` | `sale_price_per_unit` | Use `sale_price_per_unit` |
| `location` | `storage_location` | Use `storage_location` |
| `rack` | `storage_location` | Use `storage_location` |

### 🔴 Important: Batch Pricing vs Line Item Pricing

| Context | Canonical Name | Notes |
|---------|----------------|-------|
| Batch table | `mrp_per_unit` | Stored in batch |
| Batch table | `sale_price_per_unit` | Stored in batch |
| Batch table | `cost_per_unit` | Stored in batch |
| Invoice item | `mrp` | Short form for line items |
| Invoice item | `unit_price` | Short form for line items |

---

## inventory.inventory_movements

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `movement_id` | `movement_id` | ✅ |
| `movement_type` | `movement_type` | ✅ |
| `movement_date` | `movement_date` | ✅ |
| `movement_direction` | `movement_direction` | ✅ |
| `product_id` | `product_id` | ✅ |
| `batch_id` | `batch_id` | ✅ |
| `quantity` | `quantity` | ✅ |
| `base_quantity` | `base_quantity` | ✅ |
| `pack_type` | `pack_type` | ✅ |
| `location_id` | `location_id` | ✅ |
| `from_location_id` | `from_location_id` | ✅ |
| `to_location_id` | `to_location_id` | ✅ |
| `unit_cost` | `unit_cost` | ✅ |
| `total_cost` | `total_cost` | ✅ |
| `reference_type` | `reference_type` | ✅ |
| `reference_id` | `reference_id` | ✅ |
| `reference_number` | `reference_number` | ✅ |
| `reason` | `reason` | ✅ |
| `notes` | `notes` | ✅ |
| `created_by` | `created_by` | ✅ |
| `approved_by` | `approved_by` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `date` | `movement_date` | Use `movement_date` |
| `type` | `movement_type` | Use `movement_type` |
| `from_location` | `from_location_id` (+ join) | Use ID or separate field |
| `to_location` | `to_location_id` (+ join) | Use ID or separate field |
| `warehouse` | `location_id` (+ join) | Use `location_id` |

---

## inventory.location_wise_stock

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `stock_id` | `stock_id` | ✅ |
| `product_id` | `product_id` | ✅ |
| `batch_id` | `batch_id` | ✅ |
| `location_id` | `location_id` | ✅ |
| `quantity_available` | `quantity_available` | ✅ |
| `quantity_reserved` | `quantity_reserved` | ✅ |
| `quantity_quarantine` | `quantity_quarantine` | ✅ |
| `stock_in_date` | `stock_in_date` | ✅ |
| `unit_cost` | `unit_cost` | ✅ |
| `bin_number` | `bin_number` | ✅ |
| `pallet_number` | `pallet_number` | ✅ |
| `stock_status` | `stock_status` | ✅ |
| `last_movement_date` | `last_movement_date` | ✅ |
| `last_counted_date` | `last_counted_date` | ✅ |

---

## Summary: Key Canonical Names

### Quantities

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Available stock | `quantity_available` | `current_stock`, `stock`, `available_qty` |
| Reserved stock | `quantity_reserved` | `reserved`, `allocated` |
| Quarantine | `quantity_quarantine` | N/A |

### Batch Pricing

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Batch MRP | `mrp_per_unit` | `mrp` (ambiguous), `max_retail_price` |
| Batch selling price | `sale_price_per_unit` | `selling_price`, `unit_price`, `rate` |
| Batch cost | `cost_per_unit` | `cost_price`, `purchase_rate`, `purchase_price` |

### Dates

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Manufacturing | `manufacturing_date` | `mfg_date`, `mfg` |
| Expiry | `expiry_date` | `exp_date`, `expiry`, `exp` |
| Movement | `movement_date` | `date`, `txn_date` |

### Batch Identifiers

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Batch number | `batch_number` | `batch_no`, `batch` |
| Batch ID | `batch_id` | N/A |

---

## Changes Required

### Priority 1: Update inventorySharedTypes.ts

Current `BaseBatch` interface has aliases:
```typescript
// ❌ REMOVE aliases
mrp?: number;           // Use mrp_per_unit
cost_price?: number;    // Use cost_per_unit
sale_price?: number;    // Use sale_price_per_unit

// ✅ Use canonical
mrp_per_unit: number;
cost_per_unit: number;
sale_price_per_unit: number;
```

### Priority 2: Update BaseStockItem

```typescript
// ❌ REMOVE
selling_rate?: number;
purchase_rate?: number;
current_stock: number;

// ✅ Use canonical
quantity_available: number;
sale_price_per_unit?: number;
cost_per_unit?: number;
```

### Priority 3: Update Component Data Mapping

Files to audit:
- `CurrentStock.tsx` - uses `current_stock` → `quantity_available`
- `BatchTracking.tsx` - uses `mrp` → `mrp_per_unit`
- `StockAdjustmentFlow.tsx` - check all field names

---

## Status: ⚠️ Needs Minor Cleanup

The inventory module has good structure but uses some non-canonical field names that should be standardized:

1. **Batch pricing**: `mrp` → `mrp_per_unit`, `sale_price` → `sale_price_per_unit`
2. **Stock quantity**: `current_stock` → `quantity_available`
3. **Dates**: Ensure `manufacturing_date` not `mfg_date`
