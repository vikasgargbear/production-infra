# Sales Module - Variable Alignment

> **Purpose**: Map frontend variable names to their canonical database column names from `sales` schema.

## Schema Tables

| Table | Description |
|-------|-------------|
| `sales.invoices` | 59 columns |
| `sales.invoice_items` | 38 columns |
| `sales.orders` | 57 columns |
| `sales.order_items` | 54 columns |

---

## sales.invoices

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `invoice_id` | `invoice_id` | ✅ |
| `invoice_number` | `invoice_number` | ✅ |
| `invoice_date` | `invoice_date` | ✅ |
| `invoice_type` | `invoice_type` | ✅ |
| `invoice_status` | `invoice_status` | ✅ |
| `customer_id` | `customer_id` | ✅ |
| `customer_name` | `customer_name` | ✅ |
| `subtotal_amount` | `subtotal_amount` | ✅ |
| `discount_amount` | `discount_amount` | ✅ |
| `taxable_amount` | `taxable_amount` | ✅ |
| `cgst_amount` | `cgst_amount` | ✅ |
| `sgst_amount` | `sgst_amount` | ✅ |
| `igst_amount` | `igst_amount` | ✅ |
| `cess_amount` | `cess_amount` | ✅ |
| `total_tax_amount` | `total_tax_amount` | ✅ |
| `final_amount` | `final_amount` | ✅ |
| `round_off_amount` | `round_off_amount` | ✅ |
| `freight_charges` | `freight_charges` | ✅ |
| `payment_status` | `payment_status` | ✅ |
| `paid_amount` | `paid_amount` | ✅ |
| `due_date` | `due_date` | ✅ |
| `payment_terms` | `payment_terms` | ✅ |
| `irn` | `irn` | ✅ E-Invoice |
| `qr_code` | `qr_code` | ✅ |
| `ack_number` | `ack_number` | ✅ |
| `notes` | `notes` | ✅ |
| `bank_account_id` | `bank_account_id` | ✅ |

### ⚠️ Frontend Aliases (Need Review)

| Frontend Alias | Canonical DB Name | Action Required |
|---------------|-------------------|-----------------|
| `invoice_no` | `invoice_number` | Remove alias, use `invoice_number` |
| `total_amount` | `final_amount` | Use `final_amount` |
| `grand_total` | `final_amount` | Use `final_amount` |
| `net_amount` | `final_amount` | Use `final_amount` |
| `gross_amount` | `subtotal_amount` | Use `subtotal_amount` |
| `tax_amount` | `total_tax_amount` | Use `total_tax_amount` |
| `total_tax` | `total_tax_amount` | Use `total_tax_amount` |
| `balance_amount` | N/A (computed) | Keep as computed value |
| `ack_no` | `ack_number` | Use `ack_number` |
| `status` | `invoice_status` | Use `invoice_status` |
| `delivery_charges` | `freight_charges` | Use `freight_charges` |

### 🔴 Missing in Frontend

| Database Column | Should Add? |
|-----------------|-------------|
| `scheme_discount` | Yes, for promotional discounts |
| `amount_in_words` | Yes, for print templates |
| `insurance_charges` | Yes, if needed |
| `other_charges` | Yes, for flexibility |
| `allocated_amount` | Yes, for payment tracking |
| `unallocated_amount` | Yes, for payment tracking |
| `loyalty_points_used` | Yes, for loyalty program |
| `loyalty_discount` | Yes, for loyalty program |
| `credit_amount` | Yes, for credit tracking |
| `items_count` | Yes, for summary displays |
| `total_quantity` | Yes, for summary displays |

---

## sales.invoice_items

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `invoice_item_id` | `invoice_item_id` | ✅ |
| `invoice_id` | `invoice_id` | ✅ |
| `product_id` | `product_id` | ✅ |
| `product_name` | `product_name` | ✅ |
| `hsn_code` | `hsn_code` | ✅ |
| `batch_id` | `batch_id` | ✅ |
| `batch_number` | `batch_number` | ✅ |
| `expiry_date` | `expiry_date` | ✅ |
| `manufacturing_date` | `manufacturing_date` | ✅ |
| `quantity` | `quantity` | ✅ |
| `free_quantity` | `free_quantity` | ✅ |
| `uom` | `uom` | ✅ Unit of measure |
| `pack_type` | `pack_type` | ✅ |
| `pack_size` | `pack_size` | ✅ |
| `mrp` | `mrp` | ✅ |
| `unit_price` | `unit_price` | ✅ CANONICAL selling price |
| `discount_percent` | `discount_percent` | ✅ CANONICAL |
| `discount_amount` | `discount_amount` | ✅ CANONICAL |
| `taxable_amount` | `taxable_amount` | ✅ |
| `cgst_rate` | `cgst_rate` | ✅ |
| `cgst_amount` | `cgst_amount` | ✅ |
| `sgst_rate` | `sgst_rate` | ✅ |
| `sgst_amount` | `sgst_amount` | ✅ |
| `igst_rate` | `igst_rate` | ✅ |
| `igst_amount` | `igst_amount` | ✅ |
| `cess_rate` | `cess_rate` | ✅ |
| `cess_amount` | `cess_amount` | ✅ |
| `total_tax_amount` | `total_tax_amount` | ✅ |
| `line_total` | `line_total` | ✅ CANONICAL line total |

### ⚠️ Frontend Aliases (Need Review)

| Frontend Alias | Canonical DB Name | Action Required |
|---------------|-------------------|-----------------|
| `batch_no` | `batch_number` | Use `batch_number` |
| `rate` | `unit_price` | Use `unit_price` |
| `sale_price` | `unit_price` | Use `unit_price` |
| `total` | `line_total` | Use `line_total` |
| `amount` | `line_total` | Use `line_total` |
| `gst_percent` | N/A | Use specific rates: `cgst_rate`, etc. |
| `tax_percent` | N/A | Use specific rates |
| `tax_amount` | `total_tax_amount` | Use `total_tax_amount` |

### 🔴 Missing in Frontend

| Database Column | Should Add? |
|-----------------|-------------|
| `product_description` | Optional |
| `base_quantity` | Yes, for pack calculations |
| `is_free_item` | Yes, for schemes |
| `display_order` | Yes, for item ordering |
| `quantity_returned` | Yes, for returns tracking |

---

## sales.orders

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `order_id` | `order_id` | ✅ |
| `order_number` | `order_number` | ✅ |
| `order_date` | `order_date` | ✅ |
| `order_type` | `order_type` | ✅ |
| `order_status` | `order_status` | ✅ |
| `customer_id` | `customer_id` | ✅ |
| `customer_name` | `customer_name` | ✅ |
| `customer_phone` | `customer_phone` | ✅ |
| `delivery_date` | `delivery_date` | ✅ |
| `subtotal_amount` | `subtotal_amount` | ✅ |
| `discount_amount` | `discount_amount` | ✅ |
| `taxable_amount` | `taxable_amount` | ✅ |
| `tax_amount` | `tax_amount` | ✅ |
| `final_amount` | `final_amount` | ✅ |
| `round_off_amount` | `round_off_amount` | ✅ |
| `payment_status` | `payment_status` | ✅ |
| `paid_amount` | `paid_amount` | ✅ |
| `balance_amount` | `balance_amount` | ✅ |
| `payment_mode` | `payment_mode` | ✅ |
| `payment_terms` | `payment_terms` | ✅ |
| `notes` | `notes` | ✅ |
| `items_count` | `items_count` | ✅ |

### ⚠️ Frontend Aliases (Need Review)

| Frontend Alias | Canonical DB Name | Action Required |
|---------------|-------------------|-----------------|
| `status` | `order_status` | Use `order_status` |
| `fulfillment_status` | `fulfillment_status` | ✅ Correct |
| `grand_total` | `final_amount` | Use `final_amount` |

---

## sales.order_items

### ✅ Already Aligned

| Frontend | Database | Notes |
|----------|----------|-------|
| `order_item_id` | `order_item_id` | ✅ |
| `order_id` | `order_id` | ✅ |
| `product_id` | `product_id` | ✅ |
| `product_name` | `product_name` | ✅ |
| `product_code` | `product_code` | ✅ |
| `hsn_code` | `hsn_code` | ✅ |
| `batch_id` | `batch_id` | ✅ |
| `batch_number` | `batch_number` | ✅ |
| `batch_expiry` | `batch_expiry` | ✅ |
| `quantity` | `quantity` | ✅ |
| `free_quantity` | `free_quantity` | ✅ |
| `uom` | `uom` | ✅ |
| `pack_type` | `pack_type` | ✅ |
| `pack_size` | `pack_size` | ✅ |
| `mrp` | `mrp` | ✅ |
| `unit_price` | `unit_price` | ✅ |
| `discount_percent` | `discount_percent` | ✅ |
| `discount_amount` | `discount_amount` | ✅ |
| `scheme_discount_percent` | `scheme_discount_percent` | ✅ |
| `scheme_discount_amount` | `scheme_discount_amount` | ✅ |
| `scheme_code` | `scheme_code` | ✅ |
| `line_total` | `line_total` | ✅ |
| `item_status` | `item_status` | ✅ |

---

## Summary: Key Canonical Names

### Pricing
| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Selling price | `unit_price` | `rate`, `sale_price`, `price` |
| Line item total | `line_total` | `total`, `amount` |
| Document total | `final_amount` | `grand_total`, `net_amount`, `total_amount` |
| Subtotal | `subtotal_amount` | `gross_amount` |

### Discounts
| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Discount % | `discount_percent` | `discount_pct`, `disc_percent` |
| Discount ₹ | `discount_amount` | `disc_amt`, `discount` |

### Tax
| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| GST rate (CGST) | `cgst_rate` | `cgst_percent` |
| GST amount (CGST) | `cgst_amount` | N/A |
| Total tax | `total_tax_amount` | `tax_amount`, `tax_total` |

### Batch
| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Batch number | `batch_number` | `batch_no` |
| Batch ID | `batch_id` | N/A |

### Status
| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Invoice status | `invoice_status` | `status` (ambiguous) |
| Order status | `order_status` | `status` |
| Payment status | `payment_status` | N/A |

---

## Changes Required

### Priority 1: Remove Fallback Patterns

The following fallback patterns should be eliminated:

```typescript
// ❌ AVOID
const price = item.rate || item.unit_price || item.sale_price;
const total = item.total || item.line_total || item.amount;

// ✅ USE CANONICAL ONLY
const price = item.unit_price;
const total = item.line_total;
```

### Priority 2: Update Type Definitions

Files to update:
1. ✅ `invoiceTypes.ts` - Already uses canonical names
2. ✅ `orderTypes.ts` - Already aligned
3. ✅ `salesSharedTypes.ts` - Already aligned

### Priority 3: Remove Aliases from Interfaces

Current `InvoiceItem` interface still has aliases for compatibility. These should be removed:
- `batch_no` → use `batch_number`
- `rate` → use `unit_price`
- `sale_price` → use `unit_price`
- `total` / `amount` → use `line_total`

---

## Status: ✅ Sales Module Well-Aligned

The sales module is already well-structured with canonical names. The type files explicitly mark canonical fields and the interfaces are clean. Minor cleanup needed:

1. Remove legacy aliases from `InvoiceItem`
2. Ensure all components use canonical names without fallbacks
3. Document the canonical names in code comments
