# Purchase Module - Variable Alignment

> **Purpose**: Map frontend variable names to their canonical database column names from `procurement` schema.

> [!TIP]
> **Status**: ✅ **FIXED** on 2026-01-04

## Schema Tables

| Table | Columns | Description |
|-------|---------|-------------|
| `procurement.purchase_orders` | 44 | Purchase order headers |
| `procurement.purchase_order_items` | 38 | PO line items |
| `procurement.goods_receipt_notes` | 40 | GRN headers |
| `procurement.grn_items` | 31 | GRN line items |
| `procurement.purchase_returns` | ~35 | Purchase returns |
| `procurement.supplier_invoices` | ~45 | Supplier invoices |

---

## procurement.purchase_orders

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `purchase_order_id` | `purchase_order_id` | ✅ |
| `po_number` | `po_number` | ✅ CANONICAL |
| `po_date` | `po_date` | ✅ CANONICAL |
| `po_type` | `po_type` | ✅ |
| `po_status` | `po_status` | ✅ CANONICAL |
| `supplier_id` | `supplier_id` | ✅ |
| `supplier_name` | `supplier_name` | ✅ |
| `supplier_reference` | `supplier_reference` | ✅ |
| `expected_delivery_date` | `expected_delivery_date` | ✅ |
| `payment_terms` | `payment_terms` | ✅ |
| `payment_days` | `payment_days` | ✅ |
| `due_date` | `due_date` | ✅ |
| `subtotal_amount` | `subtotal_amount` | ✅ |
| `discount_amount` | `discount_amount` | ✅ |
| `taxable_amount` | `taxable_amount` | ✅ |
| `tax_amount` | `tax_amount` | ✅ |
| `total_amount` | `total_amount` | ✅ **NOTE: Not `final_amount`** |
| `other_charges` | `other_charges` | ✅ |
| `round_off_amount` | `round_off_amount` | ✅ |
| `igst_amount` | `igst_amount` | ✅ |
| `cgst_amount` | `cgst_amount` | ✅ |
| `sgst_amount` | `sgst_amount` | ✅ |
| `cess_amount` | `cess_amount` | ✅ |
| `approval_status` | `approval_status` | ✅ |
| `items_count` | `items_count` | ✅ |
| `items_received` | `items_received` | ✅ |
| `receipt_status` | `receipt_status` | ✅ |
| `notes` | `notes` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `order_id` | `purchase_order_id` | Use `purchase_order_id` |
| `order_number` | `po_number` | Use `po_number` |
| `order_date` | `po_date` | Use `po_date` |
| `status` | `po_status` | Use `po_status` |
| `final_amount` | `total_amount` | **Purchase uses `total_amount`** |
| `grand_total` | `total_amount` | Use `total_amount` |

### ⚠️ Sales vs Purchase Difference

| Concept | Sales Schema | Purchase Schema |
|---------|--------------|-----------------|
| Document total | `final_amount` | `total_amount` |
| Status field | `invoice_status` / `order_status` | `po_status` / `grn_status` |

---

## procurement.purchase_order_items

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `po_item_id` | `po_item_id` | ✅ |
| `purchase_order_id` | `purchase_order_id` | ✅ |
| `product_id` | `product_id` | ✅ |
| `product_name` | `product_name` | ✅ |
| `manufacturer` | `manufacturer` | ✅ |
| `hsn_code` | `hsn_code` | ✅ |
| `ordered_quantity` | `ordered_quantity` | ✅ CANONICAL |
| `received_quantity` | `received_quantity` | ✅ |
| `pending_quantity` | `pending_quantity` | ✅ |
| `cancelled_quantity` | `cancelled_quantity` | ✅ |
| `free_quantity` | `free_quantity` | ✅ |
| `bonus_quantity` | `bonus_quantity` | ✅ |
| `uom` | `uom` | ✅ |
| `pack_type` | `pack_type` | ✅ |
| `pack_size` | `pack_size` | ✅ |
| `base_quantity` | `base_quantity` | ✅ |
| `unit_price` | `unit_price` | ✅ CANONICAL |
| `mrp` | `mrp` | ✅ |
| `selling_price` | `selling_price` | ✅ Expected SP |
| `discount_percent` | `discount_percent` | ✅ |
| `discount_amount` | `discount_amount` | ✅ |
| `taxable_amount` | `taxable_amount` | ✅ |
| `tax_percent` | `tax_percent` | ✅ |
| `tax_amount` | `tax_amount` | ✅ |
| `line_total` | `line_total` | ✅ CANONICAL |
| `item_status` | `item_status` | ✅ |
| `batch_number` | `batch_number` | ✅ |
| `expiry_date` | `expiry_date` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `quantity` | `ordered_quantity` | Use `ordered_quantity` for PO |
| `rate` | `unit_price` | Use `unit_price` |
| `total` | `line_total` | Use `line_total` |
| `amount` | `line_total` | Use `line_total` |
| `batch_no` | `batch_number` | Use `batch_number` |

---

## procurement.goods_receipt_notes

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `grn_id` | `grn_id` | ✅ |
| `grn_number` | `grn_number` | ✅ CANONICAL |
| `grn_date` | `grn_date` | ✅ CANONICAL |
| `grn_type` | `grn_type` | ✅ |
| `grn_status` | `grn_status` | ✅ CANONICAL |
| `purchase_order_id` | `purchase_order_id` | ✅ |
| `supplier_id` | `supplier_id` | ✅ |
| `supplier_invoice_number` | `supplier_invoice_number` | ✅ |
| `supplier_invoice_date` | `supplier_invoice_date` | ✅ |
| `supplier_challan_number` | `supplier_challan_number` | ✅ |
| `received_by` | `received_by` | ✅ |
| `received_at` | `received_at` | ✅ |
| `storage_location_id` | `storage_location_id` | ✅ |
| `vehicle_number` | `vehicle_number` | ✅ |
| `lr_number` | `lr_number` | ✅ |
| `qc_required` | `qc_required` | ✅ |
| `qc_status` | `qc_status` | ✅ |
| `supplier_amount` | `supplier_amount` | ✅ |
| `calculated_amount` | `calculated_amount` | ✅ |
| `variance_amount` | `variance_amount` | ✅ |
| `approval_status` | `approval_status` | ✅ |
| `notes` | `notes` | ✅ |

---

## procurement.grn_items

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `grn_item_id` | `grn_item_id` | ✅ |
| `grn_id` | `grn_id` | ✅ |
| `po_item_id` | `po_item_id` | ✅ |
| `product_id` | `product_id` | ✅ |
| `batch_number` | `batch_number` | ✅ CANONICAL |
| `manufacturing_date` | `manufacturing_date` | ✅ CANONICAL |
| `expiry_date` | `expiry_date` | ✅ |
| `ordered_quantity` | `ordered_quantity` | ✅ |
| `received_quantity` | `received_quantity` | ✅ CANONICAL |
| `accepted_quantity` | `accepted_quantity` | ✅ |
| `rejected_quantity` | `rejected_quantity` | ✅ |
| `free_quantity` | `free_quantity` | ✅ |
| `uom` | `uom` | ✅ |
| `pack_type` | `pack_type` | ✅ |
| `pack_size` | `pack_size` | ✅ |
| `unit_price` | `unit_price` | ✅ |
| `mrp` | `mrp` | ✅ |
| `ptr` | `ptr` | ✅ Price to retailer |
| `pts` | `pts` | ✅ Price to stockist |
| `ptr_margin_percent` | `ptr_margin_percent` | ✅ |
| `pts_margin_percent` | `pts_margin_percent` | ✅ |
| `qc_status` | `qc_status` | ✅ |
| `item_status` | `item_status` | ✅ |
| `rejection_reason` | `rejection_reason` | ✅ |
| `storage_location_id` | `storage_location_id` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `mfg_date` | `manufacturing_date` | Use `manufacturing_date` |
| `batch_no` | `batch_number` | Use `batch_number` |
| `qty_received` | `received_quantity` | Use `received_quantity` |

---

## Summary: Key Canonical Names

### Document Numbers

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| PO number | `po_number` | `order_number`, `po_no` |
| GRN number | `grn_number` | `grn_no`, `receipt_number` |

### Document Dates

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| PO date | `po_date` | `order_date`, `date` |
| GRN date | `grn_date` | `receipt_date`, `date` |

### Status Fields

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| PO status | `po_status` | `status`, `order_status` |
| GRN status | `grn_status` | `status`, `receipt_status` |

### Quantities

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| PO quantity | `ordered_quantity` | `quantity`, `qty` |
| GRN quantity | `received_quantity` | `quantity`, `qty_received` |
| Accepted | `accepted_quantity` | `accepted_qty` |
| Rejected | `rejected_quantity` | `rejected_qty` |

### Totals

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Document total | `total_amount` | `final_amount`, `grand_total` |
| Line total | `line_total` | `total`, `amount` |

---

## Status: ✅ Well Aligned

The purchase module schema is well-structured. Key notes:

1. **Purchase uses `total_amount`** not `final_amount` (unlike sales)
2. **PO quantity is `ordered_quantity`** not just `quantity`
3. **GRN uses `received_quantity`** as the canonical received amount
4. **PTR/PTS fields** are pharma-specific pricing fields
