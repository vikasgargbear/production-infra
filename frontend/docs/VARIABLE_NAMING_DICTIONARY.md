# Frontend Variable Naming Dictionary

> **Purpose**: Master reference for variable naming across frontend → backend. Use ONLY canonical names from this document.
> 
> **Last Updated**: 2026-01-04

---

## Quick Reference: Don't Use → Use Instead

| ❌ Don't Use | ✅ Use Instead | Context |
|-------------|----------------|---------|
| `gstin` | `gst_number` | All party records |
| `pan` | `pan_number` | All party records |
| `dl_number` | `drug_license_number` | Customers/Suppliers |
| `batch_no` | `batch_number` | All batches |
| `mfg_date` | `manufacturing_date` | Batches |
| `exp_date` | `expiry_date` | Batches |
| `current_stock` | `total_quantity_available` | Product aggregate |
| `current_stock` | `quantity_available` | Batch level |
| `cost_price` | `cost_per_unit` | Batch pricing |
| `purchase_price` | `unit_price` | Purchase items |
| `purchase_rate` | `unit_price` | Purchase items |
| `rate` | `unit_price` | Transaction items |
| `mrp` | `mrp_per_unit` | Batch pricing |
| `sale_price` | `sale_price_per_unit` | Batch pricing |
| `final_amount` | `total_amount` | **Purchase/GRN only** |
| `grand_total` | `total_amount` | **Purchase/GRN only** |
| `final_amount` | `final_amount` | **Sales/Invoices (keep as-is)** |
| `order_number` | `po_number` | **Purchase orders only** |
| `order_number` | `order_number` | **Sales orders (keep as-is)** |
| `contact_person` | `contact_person_name` | Parties |
| `phone`/`mobile` | `primary_phone` | Customer/Supplier |
| `phone`/`mobile` | `personal_mobile` | Employee |
| `email` | `primary_email` | Customer/Supplier |
| `email` | `personal_email` | Employee |
| `outstanding` | `current_outstanding` | Party balances |
| `balance` | `current_outstanding` | Party balances |
| `location` | `storage_location` | Batches |

---

## By Database Schema

### 📦 inventory.products

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `product_id` | integer | - |
| `product_code` | text | `sku`, `item_code` |
| `product_name` | text | `name`, `item_name` |
| `generic_name` | text | - |
| `category_id` | integer | - |
| `gst_percent` | numeric | `gst_rate`, `tax_percent` |
| `hsn_code` | text | `hsn` |
| `base_uom` | text | `unit`, `uom` |
| `min_stock_quantity` | numeric | `min_stock`, `minimum_stock` |
| `reorder_level` | numeric | `reorder_point` |
| `total_quantity_available` | numeric | `current_stock`, `stock`, `quantity` |
| `is_active` | boolean | `active`, `status` |

### 📦 inventory.batches

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `batch_id` | integer | - |
| `batch_number` | text | `batch_no`, `batch` |
| `product_id` | integer | - |
| `quantity_available` | numeric | `current_stock`, `qty`, `available_qty` |
| `quantity_reserved` | numeric | `reserved_qty` |
| `quantity_quarantine` | numeric | - |
| `initial_quantity` | numeric | `original_qty` |
| `manufacturing_date` | date | `mfg_date` |
| `expiry_date` | date | `exp_date` |
| `mrp_per_unit` | numeric | `mrp` |
| `cost_per_unit` | numeric | `cost_price`, `purchase_price` |
| `sale_price_per_unit` | numeric | `sale_price`, `selling_price` |
| `storage_location` | text | `location`, `rack`, `warehouse` |
| `supplier_id` | integer | - |
| `is_active` | boolean | `active` |

### 📋 procurement.purchase_orders

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `purchase_order_id` | integer | `order_id` |
| `po_number` | text | `order_number`, `po_no` |
| `po_date` | date | `order_date`, `date` |
| `po_status` | text | `status`, `order_status` |
| `supplier_id` | integer | - |
| `supplier_name` | text | - |
| `total_amount` | numeric | `final_amount`, `grand_total` |
| `tax_amount` | numeric | - |
| `subtotal_amount` | numeric | `subtotal` |
| `discount_amount` | numeric | `discount` |

### 📋 procurement.purchase_order_items

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `po_item_id` | integer | - |
| `product_id` | integer | - |
| `ordered_quantity` | numeric | `quantity`, `qty` |
| `received_quantity` | numeric | `qty_received` |
| `unit_price` | numeric | `rate`, `purchase_price`, `cost_price`, `purchase_rate` |
| `line_total` | numeric | `total`, `amount` |
| `batch_number` | text | `batch_no` |
| `expiry_date` | date | `exp_date` |
| `manufacturing_date` | date | `mfg_date` |

### 📋 procurement.goods_receipt_notes

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `grn_id` | integer | - |
| `grn_number` | text | `grn_no`, `receipt_number` |
| `grn_date` | date | `receipt_date`, `date` |
| `grn_status` | text | `status` |
| `total_amount` | numeric | `final_amount`, `grand_total` |

### 📋 procurement.grn_items

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `grn_item_id` | integer | - |
| `batch_number` | text | `batch_no` |
| `manufacturing_date` | date | `mfg_date` |
| `received_quantity` | numeric | `qty_received`, `quantity` |
| `unit_price` | numeric | `rate`, `purchase_price` |

### 💰 sales.invoices

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `invoice_id` | integer | - |
| `invoice_number` | text | `inv_no`, `invoice_no` |
| `invoice_date` | date | `date` |
| `invoice_status` | text | `status` |
| `customer_id` | integer | - |
| `customer_name` | text | `name` |
| `final_amount` | numeric | **KEEP - different from purchase** |
| `tax_amount` | numeric | - |
| `subtotal_amount` | numeric | `subtotal` |

### 💰 sales.invoice_items

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `invoice_item_id` | integer | - |
| `product_id` | integer | - |
| `quantity` | numeric | `qty` |
| `unit_price` | numeric | `rate`, `price` |
| `line_total` | numeric | `total`, `amount` |
| `batch_number` | text | `batch_no` |

### 💰 sales.orders

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `order_id` | integer | - |
| `order_number` | text | **KEEP for sales** |
| `order_date` | date | `date` |
| `order_status` | text | `status` |
| `final_amount` | numeric | **KEEP for sales** |

### 👥 parties.customers

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `customer_id` | integer | - |
| `customer_code` | text | `code` |
| `customer_name` | text | `name` |
| `customer_type` | text | `type` |
| `primary_phone` | text | `phone`, `mobile`, `contact_no` |
| `primary_email` | text | `email` |
| `gst_number` | text | `gstin`, `gst`, `gst_no` |
| `pan_number` | text | `pan`, `pan_no` |
| `drug_license_number` | text | `dl_number`, `dl`, `license` |
| `drug_license_validity` | date | `dl_validity` |
| `current_outstanding` | numeric | `outstanding`, `balance`, `outstanding_amount` |
| `credit_limit` | numeric | - |
| `credit_days` | integer | - |
| `contact_person_name` | text | `contact_person`, `contact` |
| `contact_person_phone` | text | - |
| `is_active` | boolean | `active`, `status` |

### 👥 parties.suppliers

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `supplier_id` | integer | - |
| `supplier_code` | text | `code` |
| `supplier_name` | text | `name` |
| `supplier_type` | text | `type` |
| `primary_phone` | text | `phone`, `mobile` |
| `primary_email` | text | `email` |
| `gst_number` | text | `gstin` |
| `pan_number` | text | `pan` |
| `drug_license_number` | text | `dl_number` |
| `payment_days` | integer | `credit_days` |
| `current_outstanding` | numeric | `outstanding`, `balance` |
| `contact_person_name` | text | `contact_person` |
| `is_active` | boolean | `active` |

### 👤 master.employees

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `employee_id` | integer | - |
| `employee_code` | text | `code` |
| `full_name` | text | `name` |
| `first_name` | text | - |
| `last_name` | text | - |
| `personal_mobile` | text | `phone`, `mobile` |
| `personal_email` | text | `email` |
| `date_of_birth` | date | `dob` |
| `joining_date` | date | - |
| `pan_number` | text | `pan` |
| `aadhar_number` | text | `aadhar` |
| `designation` | text | - |
| `department_id` | integer | - |
| `is_active` | boolean | `active` |

### 📊 inventory.inventory_movements

| Canonical Name | Type | ❌ Known Aliases |
|---------------|------|-----------------|
| `movement_id` | integer | - |
| `movement_type` | text | `type` |
| `movement_date` | timestamp | `date` |
| `quantity` | numeric | `qty` |
| `unit_cost` | numeric | `unit_price`, `rate` |
| `total_cost` | numeric | `total_value` |
| `reference_number` | text | `ref_no`, `reference` |

---

## Module-Specific Notes

### Sales vs Purchase: Key Differences

| Field | Sales | Purchase |
|-------|-------|----------|
| Document total | `final_amount` | `total_amount` |
| Order number | `order_number` | `po_number` |
| Status field | `invoice_status` | `po_status` / `grn_status` |
| Quantity | `quantity` | `ordered_quantity` / `received_quantity` |

### Pricing Fields by Context

| Context | Use This |
|---------|----------|
| Batch pricing | `mrp_per_unit`, `cost_per_unit`, `sale_price_per_unit` |
| Purchase items | `unit_price` |
| Sales items | `unit_price` |
| Stock movements | `unit_cost` |
| Product master (aggregate) | `mrp_per_unit`, `cost_per_unit` |

### Quantity Fields by Context

| Context | Use This |
|---------|----------|
| Product aggregate | `total_quantity_available` |
| Batch level | `quantity_available`, `quantity_reserved` |
| Purchase order | `ordered_quantity`, `received_quantity`, `pending_quantity` |
| GRN | `received_quantity`, `accepted_quantity`, `rejected_quantity` |
| Sales/Invoice | `quantity` |
| Stock movement | `quantity` |

---

## Search & Replace Commands

Use these to quickly fix aliases:

```bash
# Batch aliases
sed -i '' 's/batch_no/batch_number/g' FILE
sed -i '' 's/mfg_date/manufacturing_date/g' FILE
sed -i '' 's/exp_date/expiry_date/g' FILE

# Pricing aliases
sed -i '' 's/cost_price/cost_per_unit/g' FILE
sed -i '' 's/purchase_price/unit_price/g' FILE
sed -i '' 's/purchase_rate/unit_price/g' FILE

# Party aliases
sed -i '' 's/\.gstin/.gst_number/g' FILE
sed -i '' 's/\.pan[^_]/.pan_number /g' FILE
sed -i '' 's/dl_number/drug_license_number/g' FILE
sed -i '' 's/contact_person:/contact_person_name:/g' FILE

# Stock aliases
sed -i '' 's/current_stock/total_quantity_available/g' FILE  # For products
sed -i '' 's/current_stock/quantity_available/g' FILE  # For batches
```

---

## Validation Regex Patterns

```typescript
// GST Number
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// PAN Number
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// Drug License
const DL_REGEX = /^[A-Z]{2}[A-Z0-9]{4,}$/;

// Batch Number (alphanumeric)
const BATCH_REGEX = /^[A-Z0-9]{3,20}$/i;

// Phone (Indian)
const PHONE_REGEX = /^[6-9]\d{9}$/;
```

---

## Status: Alignment Complete ✅

| Module | Status |
|--------|--------|
| Inventory | ✅ Fixed |
| Purchase | ✅ Fixed |
| Master | ✅ Fixed |
| Sales | ⚠️ Review needed |
| Ledger | ⚠️ Review needed |
| GST | ⚠️ Review needed |
| Returns | ⚠️ Review needed |
