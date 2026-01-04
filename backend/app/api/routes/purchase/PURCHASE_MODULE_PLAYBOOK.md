# Purchase Module Optimization Playbook

**Purpose:** Comprehensive guide to fix and optimize the purchase module.

**Author:** Based on Deep Schema Audit (Jan 2026)  
**Status:** In Progress 🔧

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Files Audited](#files-audited)
3. [Critical Schema Mismatches](#critical-schema-mismatches)
4. [Detailed Fix List](#detailed-fix-list)
5. [Execution Plan](#execution-plan)
6. [Verification Checklist](#verification-checklist)

---

## Executive Summary

### ✅ Working Correctly
- `orders.py` → `procurement.supplier_invoices` INSERT (lines 617-663)
- `orders.py` → `procurement.supplier_invoice_items` INSERT (lines 829-867)
- `orders.py` → `procurement.purchase_orders` INSERT (lines 364-377)
- `orders.py` → `procurement.purchase_order_items` INSERT (lines 466-493)
- `grn.py` → `procurement.goods_receipt_notes` INSERT (lines 87-107)
- `grn.py` → `procurement.grn_items` INSERT (lines 139-154)

### ❌ Broken / Wrong Column Names
- `purchase_service.py` → `create_supplier_invoice()` - COMPLETELY BROKEN
- `purchase_service.py` → `receive_purchase_items()` - MULTIPLE ERRORS
- `grn.py` → `inventory.batches` INSERT (lines 180-200) - WRONG COLUMNS

---

## Files Audited

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| `purchase_service.py` | 329 | ❌ Broken | 6 critical issues |
| `orders.py` | 1467 | ✅ Mostly OK | 0 issues found |
| `grn.py` | 531 | ⚠️ Partial | 4 column issues |
| `supplier_invoices.py` | 310~ | ⏳ To Audit | Not audited yet |
| `upload.py` | 994~ | ⏳ To Audit | Not audited yet |

---

## Critical Schema Mismatches

### 1. `purchase_service.py` - `create_supplier_invoice()` (Lines 179-205)

**CRITICAL: This method is completely broken and will crash at runtime!**

**Current Code:**
```python
INSERT INTO procurement.supplier_invoices (
    org_id, branch_id, invoice_number, invoice_date,
    supplier_id, po_id, due_date,
    subtotal, tax_amount, total_amount,
    payment_status, notes, created_by, created_at
)
```

**Schema Reality (`procurement.supplier_invoices`):**
| Code Uses | Should Be | Status |
|-----------|-----------|--------|
| `invoice_number` | `supplier_invoice_number` | ❌ WRONG |
| `po_id` | `purchase_order_ids` (ARRAY!) | ❌ WRONG |
| `subtotal` | `subtotal_amount` | ❌ WRONG |
| `total_amount` | `invoice_total` | ❌ WRONG |
| - | `taxable_amount` | ❌ MISSING (required) |
| - | `invoice_status` | ❌ MISSING |

---

### 2. `purchase_service.py` - `receive_purchase_items()` (Lines 259-268)

**Query references non-existent columns!**

**Current Code:**
```python
SELECT * FROM procurement.purchase_order_items
WHERE po_item_id = :item_id
    AND po_id = :purchase_id        # ❌ WRONG
    AND org_id = :org_id            # ❌ DOESN'T EXIST
```

**Schema Reality:**
- Column is `purchase_order_id` NOT `po_id`
- NO `org_id` column in this table!

---

### 3. `purchase_service.py` - `receive_purchase_items()` (Line 284)

**Uses wrong column name:**
- `cost_price` should be `unit_price`

---

### 4. `purchase_service.py` - `receive_purchase_items()` (Lines 305-315)

**Updates columns that don't exist!**

**Current Code:**
```python
UPDATE procurement.purchase_orders 
SET po_status = :po_status,
    grn_number = :grn_number,      # ❌ DOESN'T EXIST
    grn_date = CURRENT_DATE        # ❌ DOESN'T EXIST
```

**Reality:** GRN data is stored in `procurement.goods_receipt_notes` table

---

### 5. `grn.py` - Batch INSERT (Lines 180-200)

**Several column name mismatches for `inventory.batches`:**

| Code Uses | Should Be | Status |
|-----------|-----------|--------|
| `mrp` | `mrp_per_unit` | ❌ WRONG |
| `quantity_received` | `initial_quantity` | ❌ WRONG |
| `reference_type` | NOT IN SCHEMA | ❌ REMOVE |
| `reference_id` | `source_reference_id` | ❌ WRONG |
| `storage_temperature` | `storage_condition` | ❌ WRONG |

---

## Execution Plan

### Phase 1: Fix Critical Broken Code
- [ ] 1.1 Fix `purchase_service.py:create_supplier_invoice()`
- [ ] 1.2 Fix `purchase_service.py:receive_purchase_items()` query
- [ ] 1.3 Fix `purchase_service.py:receive_purchase_items()` field access
- [ ] 1.4 Fix `purchase_service.py:receive_purchase_items()` PO update

### Phase 2: Fix GRN Batch Creation
- [ ] 2.1 Fix `grn.py` batch INSERT column names
- [ ] 2.2 Add missing required columns

### Phase 3: Audit Remaining Files
- [ ] 3.1 Audit `supplier_invoices.py`
- [ ] 3.2 Audit `upload.py`
- [ ] 3.3 Audit `pharma_invoice_parser.py`

---

## Verification Checklist

After all fixes:
1. Run Python syntax check
2. Test purchase order creation
3. Test supplier invoice creation
4. Test GRN creation
5. Verify batches created correctly

---

## Schema Reference

### Key Tables

| Table | Primary Key | Notes |
|-------|-------------|-------|
| `procurement.purchase_orders` | `purchase_order_id` | Main PO table |
| `procurement.purchase_order_items` | `po_item_id` | PO line items |
| `procurement.supplier_invoices` | `supplier_invoice_id` | Supplier bills |
| `procurement.supplier_invoice_items` | `invoice_item_id` | Bill line items |
| `procurement.goods_receipt_notes` | `grn_id` | GRN header |
| `procurement.grn_items` | `grn_item_id` | GRN line items |
| `inventory.batches` | `batch_id` | Inventory batches |

### Common Mistakes to Avoid

| Wrong | Correct |
|-------|---------|
| `po_id` | `purchase_order_id` |
| `invoice_number` | `supplier_invoice_number` |
| `subtotal` | `subtotal_amount` |
| `total_amount` (supplier invoice) | `invoice_total` |
| `mrp` (batches) | `mrp_per_unit` |
| `quantity_received` (batches) | `initial_quantity` |
| `reference_id` | `source_reference_id` |
| `storage_temperature` | `storage_condition` |
