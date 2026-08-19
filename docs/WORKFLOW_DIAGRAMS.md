# AASO ERP -- Complete Workflow Documentation

> **Purpose:** Production-grade workflow reference for AI agents, debugging, and analytics.
> Each flow documents: API endpoint, step-by-step execution, exact SQL tables, calculations, side effects, and known issues.
>
> **Last Updated:** 2026-02-06
> **Codebase:** production-infra/backend

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Invoice Creation (BENCHMARK)](#2-invoice-creation-benchmark)
3. [Invoice Cancellation](#3-invoice-cancellation)
4. [Sales Returns](#4-sales-returns)
5. [Purchase Orders](#5-purchase-orders)
6. [Goods Receipt Notes (GRN)](#6-goods-receipt-notes-grn)
7. [Supplier Invoices](#7-supplier-invoices)
8. [Purchase Returns](#8-purchase-returns)
9. [Sales Orders](#9-sales-orders)
10. [Delivery Challans](#10-delivery-challans)
11. [Document Conversions](#11-document-conversions)
12. [Payments & Receipts](#12-payments--receipts)
13. [Payment Allocation](#13-payment-allocation)
14. [Credit Notes](#14-credit-notes)
15. [Customer Outstanding & Ledger](#15-customer-outstanding--ledger)
16. [Journal Entries](#16-journal-entries)
17. [Expense Claims](#17-expense-claims)
18. [Inventory Management](#18-inventory-management)
19. [Stock Adjustments & Write-offs](#19-stock-adjustments--write-offs)
20. [Master Data (Customers, Products, Suppliers)](#20-master-data)
21. [Authentication & Multi-tenancy](#21-authentication--multi-tenancy)
22. [Offline Sync](#22-offline-sync)
23. [Loyalty Program](#23-loyalty-program)
24. [GST & Compliance](#24-gst--compliance)
25. [Dashboard & Analytics](#25-dashboard--analytics)
26. [Cross-Module Interaction Map](#26-cross-module-interaction-map)
27. [Critical Issues & Production Blockers](#27-critical-issues--production-blockers)
28. [Database Schema Reference](#28-database-schema-reference)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### Tech Stack
- **Framework:** FastAPI (Python)
- **Database:** PostgreSQL (Railway) with schema-based multi-tenancy
- **Auth:** Supabase Auth + JWT + Row-Level Security
- **Caching:** In-memory (process-local, 5-min TTL)

### Database Schemas
| Schema | Purpose |
|--------|---------|
| `sales` | Orders, invoices, challans, returns, loyalty |
| `procurement` | Purchase orders, GRNs, supplier invoices, purchase returns |
| `inventory` | Products, batches, movements, categories |
| `financial` | Payments, allocations, outstanding, credit/debit notes, journal entries |
| `parties` | Customers, suppliers |
| `master` | Organizations, branches, users, addresses, settings, HSN codes |
| `auth` | Users (Supabase) |
| `compliance` | GST filings |
| `public` | Stock writeoffs, GST adjustments (legacy tables) |

### Multi-tenancy Model
Every request passes through `TenantAwareSession` which:
1. Sets PostgreSQL RLS config: `SET app.org_id = :org_id`
2. Injects `WHERE org_id = :org_id` into all queries via regex parsing
3. Injects `branch_id` filtering for branch-scoped users
4. 50+ tables are tenant-aware, 14 are branch-aware

### Document Number Generation
**Service:** `DocumentNumberService.generate_number(db, document_type, org_id)`
**Format:** `{PREFIX}-{YYYYMMDD}{NNNN}` (date-based + 4-digit sequence)
**Supported types:** invoice, sales_order, delivery_challan, sales_return, purchase_order, purchase_return, grn, supplier_invoice, receipt, payment, credit_note, debit_note, adjustment, stock_receipt, product, journal
**Race Condition:** **FIXED** -- uses atomic `INSERT ... ON CONFLICT DO UPDATE` on `public.document_number_sequences` table. PostgreSQL row-level lock guarantees uniqueness under concurrent requests.

---

## 2. INVOICE CREATION (BENCHMARK)

> **Status: MOST MATURE FLOW -- Use as reference pattern**

### API Endpoint
```
POST /api/v1/sales/invoices/
Permission: sales:create
```

### Request Schema
```json
{
  "customer_id": 123,
  "invoice_date": "2026-02-06",
  "items": [
    {
      "product_id": 1, "batch_id": 10, "quantity": 5,
      "unit_price": 100.00, "discount_percent": 10,
      "gst_rate": 12, "free_quantity": 0
    }
  ],
  "discount_type": "percentage",  // or "amount"/"fixed"
  "discount_percent": 5,
  "discount_amount": 0,
  "payment_terms": "credit",
  "payments": [
    {"method": "cash", "amount": 500},
    {"method": "upi", "amount": 200}
  ],
  "transport_company": "ABC Transport",
  "vehicle_number": "MH12AB1234"
}
```

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    INVOICE CREATION FLOW                      │
├──────┬──────────────────────────────────────────────────────┤
│ Step │ Action                                                │
├──────┼──────────────────────────────────────────────────────┤
│  0   │ RBAC check (sales:create) + Tenant context from JWT  │
│      │                                                       │
│  1   │ VALIDATE INPUT                                        │
│      │ - customer_id required & > 0                          │
│      │ - items array non-empty                               │
│      │ - each item: product_id, quantity > 0, unit_price > 0 │
│      │ - discount_percent 0-100, gst_rate in [0,5,12,18,28] │
│      │                                                       │
│  2   │ GET CONTEXT                                           │
│      │ → SELECT parties.customers (name, gst_number)         │
│      │ → SELECT master.addresses (billing/shipping)          │
│      │ → SELECT master.org_branches (branch_id, state)       │
│      │                                                       │
│  3   │ DETERMINE GST TYPE                                    │
│      │ → Company state from org_branches.branch_gst_number   │
│      │ → Party state from addresses (cascade: delivery →     │
│      │   billing → customer default)                         │
│      │ → Same state = "CGST/SGST", different = "IGST"       │
│      │ → Default: "CGST/SGST" if lookup fails                │
│      │                                                       │
│  3.5 │ CALCULATE ALL TOTALS (backend source of truth)        │
│      │ → Per item: subtotal, discount, taxable, GST, total   │
│      │ → Invoice-level: scheme discount, freight, round-off  │
│      │ → Compare frontend total (warn if >₹1 difference)    │
│      │                                                       │
│  4   │ GENERATE DOCUMENT NUMBERS                             │
│      │ → DocumentNumberService("sales_order") → SO-YYYYMMDD │
│      │ → DocumentNumberService("invoice") → INV-YYYYMMDD    │
│      │                                                       │
│  5   │ CREATE SALES ORDER                                    │
│      │ → INSERT sales.orders (header)                        │
│      │                                                       │
│  6   │ CALCULATE DUE DATE                                    │
│      │ → Priority: due_date > due_days > payment_terms       │
│      │ → cash/cod → same day                                 │
│      │ → credit → +30 days                                   │
│      │ → default → +7 days                                   │
│      │                                                       │
│  6.5 │ PROCESS PAYMENTS (in-memory only)                     │
│      │ → paid_amount = SUM(payments where method != credit)  │
│      │ → credit_amount = final_amount - paid_amount          │
│      │ → status: paid/partial/pending                        │
│      │ ⚠ Does NOT create financial.payments records          │
│      │                                                       │
│  7   │ CREATE INVOICE (always status = 'posted')             │
│      │ → INSERT sales.invoices                               │
│      │                                                       │
│  8   │ PREPARE ITEMS                                         │
│      │ → Batch-fetch: inventory.products + inventory.batches │
│      │ → FEFO assignment for items without batch_id          │
│      │   (ORDER BY expiry_date NULLS LAST, batch_id)        │
│      │                                                       │
│  9   │ BULK INSERT ITEMS                                     │
│      │ → INSERT sales.invoice_items (single bulk query)      │
│      │ → UPDATE sales.invoices (items_count, total_quantity) │
│      │                                                       │
│  9.1 │ AUTO-CREATE CHALLAN (conditional)                     │
│      │ → Trigger: transport_company OR vehicle_number OR     │
│      │   delivery_type in (DELIVERY,COURIER,transport,etc)   │
│      │ → INSERT sales.delivery_challans                      │
│      │ → UPDATE sales.invoices SET challan_ids               │
│      │                                                       │
│  9.5 │ DEDUCT INVENTORY                                      │
│      │ → UPDATE inventory.batches                            │
│      │   SET quantity_available -= quantity                   │
│      │   (bulk CASE-WHEN for all batches at once)            │
│      │                                                       │
│  10  │ COMMIT (all-or-nothing transaction)                   │
│      │                                                       │
│ RET  │ → invoice_id, invoice_number, order_id, final_amount, │
│      │   challan_id, items_created                           │
└──────┴──────────────────────────────────────────────────────┘
```

### Database Tables Touched

| Table | Op | Step | Details |
|-------|-----|------|---------|
| `parties.customers` | SELECT | 2 | customer_name, gst_number |
| `master.addresses` | SELECT | 2,3 | billing/shipping/default addresses |
| `master.org_branches` | SELECT | 2,3 | branch_id, branch_gst_number, state |
| `master.org_users` | SELECT | 2 | user_id fallback |
| `sales.orders` | SELECT | 4 | latest number for sequence |
| `sales.invoices` | SELECT | 4 | latest number for sequence |
| `sales.orders` | **INSERT** | 5 | order header |
| `sales.invoices` | **INSERT** | 7 | invoice header |
| `inventory.products` | SELECT | 8 | product_name, hsn_code |
| `inventory.batches` | SELECT | 8 | batch details + FEFO selection |
| `sales.invoice_items` | **INSERT** | 9 | all line items (bulk) |
| `sales.invoices` | **UPDATE** | 9 | items_count, total_quantity |
| `sales.delivery_challans` | **INSERT** | 9.1 | auto-challan (conditional) |
| `sales.invoices` | **UPDATE** | 9.1 | challan_ids array (conditional) |
| `inventory.batches` | **UPDATE** | 9.5 | quantity_available deduction |

### Calculations

#### Line-Item Level
```python
subtotal = quantity * unit_price
discount_amount = subtotal * discount_percent / 100
taxable_amount = subtotal - discount_amount

# GST (all Decimal, quantized to 0.01)
if gst_type == "CGST/SGST":
    cgst = taxable_amount * (gst_rate / 2) / 100
    sgst = taxable_amount * (gst_rate / 2) / 100
    igst = 0
elif gst_type == "IGST":
    igst = taxable_amount * gst_rate / 100
    cgst = sgst = 0

total_tax = cgst + sgst + igst
line_total = taxable_amount + total_tax
```

#### Invoice Level
```python
subtotal = SUM(line_total)
item_discount = SUM(line_discount_amount)

# Scheme discount (invoice-level)
if discount_type == "percentage":
    scheme_discount = subtotal * discount_percent / 100
elif discount_type in ("amount", "fixed"):
    scheme_discount = discount_amount

taxable_amount = subtotal - scheme_discount
total_tax = SUM(line_cgst) + SUM(line_sgst) + SUM(line_igst)

amount_before_round = taxable_amount + freight + insurance + other_charges
final_amount = round(amount_before_round)  # nearest integer
round_off = final_amount - amount_before_round

# Credit tracking
credit_amount = final_amount - paid_amount
```

### Known Issues (Invoice)
| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| INV-1 | **CRITICAL** | `inventory.inventory_movements` NOT created | **FIXED** -- bulk_insert_movements called in step 9.6 |
| INV-2 | **CRITICAL** | `financial.customer_outstanding` NOT created | **FIXED** -- update_customer_outstanding called in step 9.7 with paid_amount support |
| INV-3 | **HIGH** | No stock validation before deduction | **FIXED** -- InvoiceRepository.validate_stock_availability called before deduction |
| INV-4 | **HIGH** | Scheme discount does NOT recalculate per-item GST | **FIXED** -- scheme discount apportioned across items, GST recalculated per CGST Act Section 15 |
| INV-5 | **MEDIUM** | Frontend amounts trusted without strict validation (warn-only if >₹1 mismatch) | Open |
| INV-6 | **MEDIUM** | Always created as 'posted' -- no draft flow | **FIXED** -- save_as_draft flag, drafts skip inventory/financial ops |
| INV-7 | **LOW** | `information_schema.columns` queried on every DocumentNumber call | **FIXED** -- results cached in _table_columns_cache |
| INV-8 | **LOW** | FIFO naming is actually FEFO (First-Expiry-First-Out) | **FIXED** -- variables renamed to fefo_batches |
| INV-9 | **CRITICAL** | `batch_id` not included in `_prepare_invoice_items` output -- invoice_items always had NULL batch_id, stock deduction/validation never ran | **FIXED** -- batch_id added to invoice_items_data dict |
| INV-10 | **HIGH** | `cancel_invoice` does not reverse inventory_movements or customer_outstanding | **FIXED** -- movements DELETEd, outstanding set to cancelled |

---

## 3. INVOICE CANCELLATION

### API Endpoint
```
POST /api/v1/sales/invoices/{invoice_id}/cancel
Permission: sales:delete
```

### Flow
```
┌──────────────────────────────────────────────────────────┐
│               INVOICE CANCELLATION FLOW                   │
├──────┬───────────────────────────────────────────────────┤
│  1   │ SELECT sales.invoices → status, paid_amount,      │
│      │   invoice_date, gstr1_reported_date               │
│      │                                                    │
│  2   │ VALIDATE                                           │
│      │ ✗ Already cancelled → 400                         │
│      │ ✗ Has payments (paid_amount > 0) → 400            │
│      │ ✗ GSTR-1 deadline passed (11th of next month      │
│      │   after invoice_date) → 400 (use credit note)     │
│      │ ✗ gstr1_reported_date is set → 400                │
│      │                                                    │
│  3   │ UPDATE sales.invoices                              │
│      │   SET status='cancelled', cancelled_at,            │
│      │       cancelled_by, cancellation_reason            │
│      │                                                    │
│  4   │ REVERSE INVENTORY (if was 'posted')                │
│      │ → SELECT sales.invoice_items (product_id,          │
│      │   batch_id, quantity)                              │
│      │ → For each: UPDATE inventory.batches               │
│      │   SET quantity_available += quantity                │
│      │                                                    │
│  5   │ OPTIONAL: Create credit note                       │
│      │ → CreditNoteService.create_from_cancelled_invoice()│
│      │ → INSERT financial.credit_notes                    │
│      │                                                    │
│  6   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

---

## 4. SALES RETURNS

### API Endpoints
| Endpoint | Method | Permission | Purpose |
|----------|--------|-----------|---------|
| `/returns/sales/` | GET | sales_returns:view | List returns |
| `/returns/sales/` | POST | sales_returns:create | **Create return** |
| `/returns/sales/{id}` | GET | sales_returns:view | Return detail |
| `/returns/sales/{id}` | DELETE | sales_returns:delete | Cancel return |
| `/returns/sales/returnable-invoices` | GET | sales_returns:view | Invoices available for return |
| `/returns/sales/invoice/{id}/returnable-items` | GET | sales_returns:view | Items with returnable qty |

### Create Sales Return -- Step-by-Step

```
┌──────────────────────────────────────────────────────────┐
│             SALES RETURN CREATION FLOW                    │
├──────┬───────────────────────────────────────────────────┤
│  1   │ VALIDATE: at least 1 item                         │
│      │                                                    │
│  2   │ GENERATE return_number                             │
│      │ → DocumentNumberService("sales_return")            │
│      │                                                    │
│  3   │ CUSTOMER LOOKUP                                    │
│      │ → SELECT parties.customers (name, gst_number)     │
│      │                                                    │
│  4   │ DETERMINE GST TYPE                                 │
│      │ → GSTService.determine_gst_type()                 │
│      │                                                    │
│  5   │ CALCULATE TOTALS                                   │
│      │ → Per item: base = qty * rate                      │
│      │ → discount = base * discount% / 100                │
│      │ → taxable = base - discount                        │
│      │ → GST components via GSTService                    │
│      │ → Accumulate: subtotal, tax, total, return_qty     │
│      │                                                    │
│  6   │ INSERT RETURN HEADER                               │
│      │ → INSERT sales.sales_returns                       │
│      │   (return_number, return_method, invoice_id,       │
│      │    customer_id, amounts, credit_note_info)         │
│      │ → return_method: credit_note | replacement |       │
│      │   refund | no_adjustment                           │
│      │ → If refund: approval_required=true                │
│      │                                                    │
│  7   │ PREPARE ITEMS (in-memory)                          │
│      │ → creditable_qty = max(0, return_qty - free_qty)   │
│      │ → return_value calculation per item                │
│      │ → Disposition: RESTOCK / QUARANTINE / DESTROY      │
│      │   (based on reason keywords: expired, damaged,     │
│      │    broken, contaminated, manufacturing defect)     │
│      │                                                    │
│  8   │ BULK INSERT RETURN ITEMS                           │
│      │ → INSERT sales.sales_return_items                  │
│      │                                                    │
│  9   │ BULK UPDATE BATCH STOCK                            │
│      │ → UPDATE inventory.batches                         │
│      │   SET quantity_available += saleable_qty            │
│      │   SET quantity_sold -= total_qty                    │
│      │   ⚠ Does NOT update quantity_returned              │
│      │                                                    │
│ 10   │ BULK RECORD STOCK MOVEMENTS                        │
│      │ → INSERT inventory.inventory_movements             │
│      │   (type='return'/'return_damaged', direction='in') │
│      │   ⚠ quantity cast to int (truncates decimals)     │
│      │                                                    │
│ 11   │ FINANCIAL PROCESSING                               │
│      │ ┌─ If return_method == "credit_note":             │
│      │ │  → CreditNoteService.create_credit_note_for_    │
│      │ │    return()                                      │
│      │ │  → INSERT financial.credit_notes (approved)      │
│      │ │  → INSERT financial.customer_outstanding          │
│      │ │    (NEGATIVE amount = reduces balance)           │
│      │ │  → UPDATE sales.sales_returns                    │
│      │ │    SET credit_note_number                        │
│      │ ├─ If return_method == "refund":                   │
│      │ │  → Log only (no DB change)                       │
│      │ ├─ If return_method == "replacement":              │
│      │ │  → Log only (no DB change)                       │
│      │ └─ If return_method == "no_adjustment":            │
│      │    → Log only (no DB change)                       │
│      │                                                    │
│ 12   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Database Tables Touched (Sales Return)

| Table | Op | Step | Details |
|-------|-----|------|---------|
| `parties.customers` | SELECT | 3 | customer_name, gst_number |
| `master.org_branches` | SELECT | 4 | company state for GST |
| `master.addresses` | SELECT | 4 | party state |
| `sales.sales_returns` | **INSERT** | 6 | return header |
| `sales.sales_return_items` | **INSERT** | 8 | all items (bulk) |
| `inventory.batches` | **UPDATE** | 9 | restore quantity_available, reduce quantity_sold |
| `inventory.inventory_movements` | **INSERT** | 10 | stock movement records (bulk) |
| `financial.credit_notes` | **INSERT** | 11 | if credit_note method |
| `financial.customer_outstanding` | **INSERT** | 11 | negative amount entry |
| `sales.sales_returns` | **UPDATE** | 11 | sync credit_note_number |

### Known Issues (Sales Returns)
| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| RET-1 | **CRITICAL** | No return quantity validation -- can return MORE than invoiced | **FIXED** -- validate_return_quantity called before processing |
| RET-2 | **CRITICAL** | Cancel flow has wrong table name: `sale_returns` instead of `sales.sales_returns` | **FIXED** -- corrected to sales.sales_returns |
| RET-3 | **HIGH** | Cancel does NOT reverse: credit notes, customer_outstanding, inventory movements | **FIXED** -- cancel now voids credit notes, customer_outstanding, deletes movements |
| RET-4 | **HIGH** | Per-item GST hardcoded to "CGST/SGST" ignoring determined gst_type | **FIXED** -- now uses gst_type variable from GSTService.determine_gst_type |
| RET-5 | **MEDIUM** | Bulk batch update uses `quantity_sold` instead of `quantity_returned` | **FIXED** -- changed to COALESCE(quantity_returned, 0) + total_qty |
| RET-6 | **MEDIUM** | Stock movement quantity cast to `int` -- truncates decimals | **FIXED** -- removed int() cast, uses already-rounded float value |
| RET-7 | **LOW** | `WHERE sr.org_id = sr.org_id` tautology (relies on TenantAwareSession) | **FIXED** -- all queries now use explicit `WHERE x.org_id = :org_id` parameterization across sales and purchase returns |
| RET-8 | **MEDIUM** | No 2-decimal rounding on calculation values or prepared_items | **FIXED** -- round(, 2) on all monetary values in calculate_return_value, calculate_return_totals, and prepared_items |
| RET-9 | **MEDIUM** | batch_id not resolved from invoice_item when frontend omits it | **FIXED** -- ReturnService.resolve_batch called for items without batch_id |
| RET-10 | **MEDIUM** | bulk_insert_return_items uses wrong column name `return_reason` vs `item_return_reason` | **FIXED** -- column name corrected in INSERT SQL |
| RET-11 | **CRITICAL** | Header totals (return_amount, tax_amount, total_amount) computed from full return_quantity but per-item values use creditable_qty (excluding free items). Credit note over-credits customer for value of free items. | **FIXED** -- header totals recomputed from prepared_items after per-item calc; UPDATE corrects the header record |
| RET-12 | **HIGH** | `int(item["return_quantity"])` in bulk_record_stock_movements truncates decimal quantities (2.5 → 2) | **FIXED** -- removed int() cast, quantity already rounded to 2 decimals |
| RET-13 | **MEDIUM** | reference_type case mismatch: bulk insert writes 'SALES_RETURN' but verification queries 'sales_return' | **FIXED** -- verification query updated to match 'SALES_RETURN' |
| RET-14 | **HIGH** | `get_returnable_invoices()` filters `invoice_status = 'generated'` but invoices are created as `'posted'` -- no invoices appear as returnable | **FIXED** -- changed to `invoice_status = 'posted'` |
| RET-15 | **HIGH** | `get_returnable_items()` and `validate_return_quantity()` don't exclude cancelled returns -- cancelled return items still count as "already returned", blocking re-returns | **FIXED** -- added subquery filter `WHERE return_status != 'CANCELLED' AND approval_status != 'cancelled'` |

---

## 5. PURCHASE ORDERS

### API Endpoints
| Endpoint | Method | Permission | Purpose |
|----------|--------|-----------|---------|
| `/purchase/orders/` | POST | purchase:create | Create PO |
| `/purchase/orders/` | GET | purchase:view | List POs |
| `/purchase/orders/{id}` | GET | purchase:view | PO detail |
| `/purchase/orders/{id}` | PUT | purchase:edit | Update PO |

### Create Purchase Order Flow

```
┌──────────────────────────────────────────────────────────┐
│           PURCHASE ORDER CREATION FLOW                    │
├──────┬───────────────────────────────────────────────────┤
│  1   │ VALIDATE: supplier_id, items non-empty            │
│      │                                                    │
│  2   │ GENERATE po_number                                 │
│      │ → DocumentNumberService("purchase_order")          │
│      │                                                    │
│  3   │ INSERT procurement.purchase_orders                  │
│      │ (org_id, branch_id, po_number, po_date,           │
│      │  supplier_id, amounts, status='draft')             │
│      │                                                    │
│  4   │ For each item:                                     │
│      │ → INSERT procurement.purchase_order_items          │
│      │   (product_id, quantity, unit_price, tax,          │
│      │    line_total)                                     │
│      │                                                    │
│  5   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Tables
| Table | Op |
|-------|-----|
| `procurement.purchase_orders` | INSERT, SELECT, UPDATE |
| `procurement.purchase_order_items` | INSERT, SELECT |
| `parties.suppliers` | SELECT |
| `inventory.products` | SELECT |

---

## 6. GOODS RECEIPT NOTES (GRN)

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/purchase/grn/` | POST | Create GRN |
| `/purchase/grn/` | GET | List GRNs |
| `/purchase/grn/{id}` | GET | GRN detail |
| `/purchase/grn/{id}/approve` | POST | Approve + update stock |

### Create GRN Flow

```
┌──────────────────────────────────────────────────────────┐
│                 GRN CREATION FLOW                         │
├──────┬───────────────────────────────────────────────────┤
│  1   │ VALIDATE: supplier_id, items non-empty            │
│      │                                                    │
│  2   │ GENERATE grn_number                                │
│      │ → DocumentNumberService("grn")                     │
│      │                                                    │
│  3   │ INSERT procurement.goods_receipt_notes              │
│      │ (grn_number, grn_date, supplier_id, PO ref,       │
│      │  transport details, qc_required,                   │
│      │  stock_updated=false, status='created')            │
│      │                                                    │
│  4   │ BULK INSERT procurement.grn_items                  │
│      │ (product_id, batch_number, mfg/expiry dates,      │
│      │  ordered/received/accepted/rejected/free qty,      │
│      │  unit_price, mrp, ptr, pts, uom, pack details)    │
│      │                                                    │
│  5   │ BULK UPSERT inventory.batches                      │
│      │ → For each item with valid quantity:                │
│      │ → INSERT ... ON CONFLICT (org_id, product_id,      │
│      │   batch_number) DO UPDATE SET                      │
│      │   initial_quantity += EXCLUDED.initial_quantity,    │
│      │   quantity_available += EXCLUDED.quantity_available │
│      │ → Creates new batches or adds to existing          │
│      │                                                    │
│  6   │ UPDATE procurement.goods_receipt_notes              │
│      │   SET stock_updated=true, stock_updated_at=now     │
│      │                                                    │
│  7   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Approve GRN Flow
```
1. Validate GRN exists
2. UPDATE procurement.goods_receipt_notes
     SET approval_status='approved', approved_by, approved_at,
         stock_updated=true, grn_status='approved'
```

### Tables
| Table | Op | Purpose |
|-------|-----|---------|
| `procurement.goods_receipt_notes` | INSERT, UPDATE | GRN header |
| `procurement.grn_items` | INSERT (bulk) | GRN line items |
| `inventory.batches` | UPSERT (bulk) | Create/update stock batches |
| `inventory.products` | SELECT | Product details for items |
| `parties.suppliers` | SELECT | Supplier details |

### Known Issues (GRN)
| ID | Severity | Issue |
|----|----------|-------|
| GRN-1 | **HIGH** | No `inventory.inventory_movements` record created -- stock appears without audit trail |
| GRN-2 | **MEDIUM** | Batch UPSERT uses quantity as-is, doesn't track cumulative receipts separately |

---

## 7. SUPPLIER INVOICES

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/purchase/supplier-invoices/` | POST | Create supplier invoice |
| `/purchase/supplier-invoices/` | GET | List invoices |
| `/purchase/supplier-invoices/{id}` | GET | Detail |

### Tables
| Table | Op |
|-------|-----|
| `procurement.supplier_invoices` | INSERT, SELECT, UPDATE |
| `procurement.supplier_invoice_items` | INSERT, SELECT |
| `parties.suppliers` | SELECT |
| `procurement.goods_receipt_notes` | SELECT (link to GRN) |

---

## 8. PURCHASE RETURNS

### API Endpoint
```
POST /api/v1/returns/purchase/
Permission: purchase_returns:create
```

### Create Purchase Return Flow

```
┌──────────────────────────────────────────────────────────┐
│           PURCHASE RETURN CREATION FLOW                   │
├──────┬───────────────────────────────────────────────────┤
│  1   │ VALIDATE: at least 1 item with selected=true      │
│      │                                                    │
│  2   │ GENERATE return_number                             │
│      │ → DocumentNumberService (atomic sequence)          │
│      │                                                    │
│  3   │ SUPPLIER LOOKUP                                    │
│      │ → SELECT parties.suppliers (name, gst_number)     │
│      │                                                    │
│  3.5 │ DETERMINE GST TYPE                                 │
│      │ → GSTService.determine_gst_type(supplier_id=...)  │
│      │ → Same state = CGST/SGST, different = IGST        │
│      │                                                    │
│  4   │ CALCULATE TOTALS (DRY)                             │
│      │ → ReturnService.calculate_return_totals()          │
│      │ → Correctly accumulates CGST/SGST or IGST         │
│      │ → All values rounded to 2 decimals                │
│      │                                                    │
│  5   │ INSERT procurement.purchase_returns (header)        │
│      │                                                    │
│  6   │ FOR EACH selected item:                            │
│      │ │ a. VALIDATE return qty ≤ available                │
│      │ │    → SELECT procurement.supplier_invoice_items   │
│      │ │    → Fallback: SELECT procurement.grn_items      │
│      │ │ b. Resolve tax from invoice/GRN                   │
│      │ │ c. Calculate return value (rounded 2 decimals)    │
│      │ │ d. GST components via gst_type (not hardcoded)   │
│      │ │ e. Resolve batch_id                               │
│      │ │ f. Determine disposition                          │
│      │ │    (RETURN_TO_SUPPLIER or DESTROY)                │
│      │ │ g. INSERT procurement.purchase_return_items       │
│      │ │ h. UPDATE inventory.batches                       │
│      │ │    (quantity_available -= qty,                     │
│      │ │     quantity_returned += qty)                     │
│      │ │ i. INSERT inventory.inventory_movements           │
│      │ │    (type=PURCHASE_RETURN, direction=out)          │
│      │ │    qty = max(1, round(qty)) -- no truncation     │
│      │                                                    │
│  7   │ FINANCIAL PROCESSING                               │
│      │ → CreditNoteService.create_debit_note_for_         │
│      │   purchase_return()                                │
│      │ → UPDATE procurement.purchase_returns               │
│      │   SET debit_note_number, debit_note_status         │
│      │ → INSERT financial.supplier_outstanding             │
│      │   (NEGATIVE amount = reduces payable)              │
│      │                                                    │
│  8   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Cancel Purchase Return Flow

```
┌──────────────────────────────────────────────────────────┐
│          PURCHASE RETURN CANCELLATION FLOW                │
├──────┬───────────────────────────────────────────────────┤
│  1   │ VALIDATE: return exists, not already cancelled     │
│      │                                                    │
│  2   │ REVERSE BATCH STOCK                                │
│      │ → For RETURN_TO_SUPPLIER items:                   │
│      │   quantity_available += return_qty                 │
│      │   quantity_returned -= return_qty                  │
│      │                                                    │
│  3   │ DELETE inventory.inventory_movements               │
│      │   WHERE reference_type = 'PURCHASE_RETURN'        │
│      │                                                    │
│  4   │ VOID SUPPLIER OUTSTANDING                          │
│      │ → UPDATE financial.supplier_outstanding             │
│      │   SET status='cancelled', outstanding_amount=0    │
│      │                                                    │
│  5   │ MARK CANCELLED                                     │
│      │ → UPDATE procurement.purchase_returns               │
│      │   SET approval_status='cancelled',                 │
│      │       debit_note_status='cancelled'                │
│      │                                                    │
│  6   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Known Issues (Purchase Returns)
| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| PRET-1 | **CRITICAL** | No supplier outstanding/payable update -- debit note number stored but no financial record | **FIXED** -- CreditNoteService.create_debit_note_for_purchase_return() now inserts into financial.supplier_outstanding |
| PRET-2 | **HIGH** | IGST never accumulated in totals loop (always 0) | **FIXED** -- replaced manual loop with ReturnService.calculate_return_totals() which handles IGST |
| PRET-3 | **HIGH** | GST type hardcoded to "CGST/SGST" for all items regardless of inter/intra-state | **FIXED** -- now calls GSTService.determine_gst_type(db, org_id, supplier_id=...) |
| PRET-4 | **MEDIUM** | Per-item processing (not bulk) -- N queries instead of 1 | Open (deferred -- performance, not correctness) |
| PRET-5 | **MEDIUM** | No 2-decimal rounding on per-item monetary values | **FIXED** -- round(, 2) on all return_quantity, unit_price, return_value, tax_amount, damaged/saleable qty |
| PRET-6 | **HIGH** | No cancel endpoint -- purchase returns cannot be reversed | **FIXED** -- DELETE /{return_id} endpoint added, reverses batch stock, movements, supplier outstanding |
| PRET-7 | **CRITICAL** | Debit note generated early (before items) and only if supplier has GST number | **FIXED** -- debit note created after all items via CreditNoteService, always created |
| PRET-8 | **MEDIUM** | Movement quantity `int(float(return_qty))` truncates decimals (2.5 -> 2) | **FIXED** -- changed to `round(float(return_qty), 2)` (2 decimal precision) |
| PRET-9 | **CRITICAL** | Double batch deduction: `update_batch_stock_for_return()` reduces `quantity_available`, then `record_stock_movement()` reduces it again -- stock deducted 2x | **FIXED** -- removed redundant `update_batch_stock_for_return()` call; `record_stock_movement()` handles `quantity_available`; separate UPDATE for `quantity_returned` only |

---

## 9. SALES ORDERS

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sales-orders/` | POST | Create order |
| `/sales-orders/{id}` | PUT | Update (draft/pending only) |
| `/sales-orders/{id}/approve` | POST | Approve + inventory allocation |
| `/sales-orders/{id}/convert-to-invoice` | POST | **NOT IMPLEMENTED (501)** |

### Create Sales Order Flow

```
┌──────────────────────────────────────────────────────────┐
│             SALES ORDER CREATION FLOW                     │
├──────┬───────────────────────────────────────────────────┤
│  1   │ Validate (customer_id, items, discounts, GST)     │
│  2   │ Get context (customer + org data)                  │
│  3   │ Calculate totals (same engine as invoice)          │
│  4   │ Generate SO number                                 │
│  5   │ INSERT sales.orders (header)                       │
│  6   │ Prepare items (batch-fetch + FEFO assignment)      │
│  7   │ BULK INSERT sales.order_items                      │
│  8   │ COMMIT                                             │
└──────┴───────────────────────────────────────────────────┘
```

### Known Issues (Sales Orders)
| ID | Severity | Issue |
|----|----------|-------|
| SO-1 | **CRITICAL** | `OrderService.validate_inventory()` and `allocate_inventory()` called in approve endpoint but DO NOT EXIST -- approve will crash with AttributeError |
| SO-2 | **HIGH** | Convert-to-invoice returns 501 (not implemented) |
| SO-3 | **MEDIUM** | N+1 query in list_orders() -- separate items query per order |
| SO-4 | **LOW** | Missing igst_amount in sales.orders INSERT |

---

## 10. DELIVERY CHALLANS

### Lifecycle
```
draft → dispatched → delivered (or cancelled at any point)
```

### Tables
| Table | Op | Purpose |
|-------|-----|---------|
| `sales.delivery_challans` | INSERT, SELECT, UPDATE | Challan headers |
| `sales.delivery_challan_items` | INSERT, SELECT | Challan items |
| `parties.customers` | SELECT | Customer info |
| `sales.orders` | SELECT, UPDATE | Parent order (delivery_status) |

### Delivery Side Effects
When challan delivered:
- UPDATE `sales.orders` SET `delivery_status`, `delivery_date`, `delivered_at`

### Known Issues (Challans)
| ID | Severity | Issue |
|----|----------|-------|
| CHN-1 | **CRITICAL** | Two separate challan table systems: `sales.delivery_challans` (ChallanService) vs `challans` (ConversionService, no schema) -- they don't interoperate |

---

## 11. DOCUMENT CONVERSIONS

### Conversion Service
| From | To | Status |
|------|----|--------|
| Order → Invoice | Creates invoice + copies items + updates order status | Works but uses `challans` table (wrong) |
| Order → Challan | Creates challan from order | Uses `challans` table (no schema prefix) |
| Challan → Invoice | Creates invoice from delivered challans | Uses `challans`/`challan_items` (wrong table) |

### Known Issue
All conversions use `challans`/`challan_items` (public schema) instead of `sales.delivery_challans`/`sales.delivery_challan_items`. These are two separate systems that cannot interact.

---

## 12. PAYMENTS & RECEIPTS

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/finance/payments/` | POST | Create payment |
| `/finance/payments/receive` | POST | Record payment against invoice |
| `/finance/payments/{id}/cancel` | POST | Cancel payment |
| `/finance/payments/outstanding` | GET | Outstanding invoices |
| `/finance/payments/aging` | GET | Aging report |
| `/finance/payments/reconcile` | POST | Bank reconciliation |

### Record Payment Against Invoice Flow

```
┌──────────────────────────────────────────────────────────┐
│           RECORD PAYMENT (AGAINST INVOICE)                │
├──────┬───────────────────────────────────────────────────┤
│  1   │ SELECT sales.invoices                              │
│      │ → invoice_id, final_amount, paid_amount, status    │
│      │                                                    │
│  2   │ VALIDATE: amount ≤ (final_amount - paid_amount)    │
│      │                                                    │
│  3   │ Generate payment_number                            │
│      │                                                    │
│  4   │ INSERT financial.payments                           │
│      │ (type='receipt', mode, party_type='customer',      │
│      │  amount, status='cleared')                         │
│      │                                                    │
│  5   │ UPDATE sales.invoices                               │
│      │ SET paid_amount += payment_amount,                  │
│      │     payment_status = paid/partial/pending,          │
│      │     payment_date (if fully paid)                    │
│      │                                                    │
│  6   │ UPDATE sales.orders SET payment_status='paid'       │
│      │ (only if invoice now fully paid)                    │
│      │                                                    │
│      │ ⚠ Does NOT update financial.customer_outstanding   │
└──────┴───────────────────────────────────────────────────┘
```

### Create Customer Receipt (Standalone) Flow

```
1. Generate receipt_number
2. SELECT parties.customers (name)
3. INSERT financial.payments (type='receipt')
4. INSERT financial.customer_outstanding (NEGATIVE amount)
5. UPDATE parties.customers SET last_payment_date
```

### Cancel Payment Flow

```
1. SELECT financial.payments + sales.invoices
2. VALIDATE: not already cancelled
3. UPDATE financial.payments SET status='cancelled'
4. UPDATE sales.invoices SET paid_amount -= amount, recalculate status
⚠ Does NOT reverse financial.customer_outstanding
```

### Known Issues (Payments)
| ID | Severity | Issue |
|----|----------|-------|
| PAY-1 | **CRITICAL** | `record_payment()` does NOT update `financial.customer_outstanding` |
| PAY-2 | **CRITICAL** | `cancel_payment()` does NOT reverse `financial.customer_outstanding` entry |
| PAY-3 | **HIGH** | `allocate_payment_to_invoices()` requires status='completed' but payments created as 'cleared' or 'pending' |
| PAY-4 | **MEDIUM** | `create_general_payment()` does NOT update any invoice or outstanding record |

---

## 13. PAYMENT ALLOCATION

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/finance/allocation/` | POST | Allocate payment to invoices |
| `/finance/allocation/{id}` | DELETE | Remove allocation |
| `/finance/allocation/auto` | POST | Auto-allocate (FIFO/LIFO/proportional) |

### Manual Allocation Flow

```
1. INSERT financial.payment_allocations (payment_id, invoice_id, amount)
2. UPDATE financial.customer_outstanding (reduce outstanding, increase paid)
⚠ Does NOT update sales.invoices.paid_amount (inconsistent with PaymentService)
```

### Known Issues (Allocation)
| ID | Severity | Issue |
|----|----------|-------|
| ALLOC-1 | **HIGH** | `create_allocation()` does NOT update `sales.invoices.paid_amount` |
| ALLOC-2 | **HIGH** | `delete_allocation()` does NOT reverse `customer_outstanding` changes |
| ALLOC-3 | **MEDIUM** | `payment_allocations` uses `invoice_id` column for INSERT but `reference_id`/`reference_type` for SELECT -- column mismatch |

---

## 14. CREDIT NOTES

### Three Separate Table Systems (Problem!)

| Table | Used By | Purpose |
|-------|---------|---------|
| `financial.credit_notes` | Return-based credit notes, ledger statements | Dedicated credit note table |
| `financial.debit_notes` | Purchase return debit notes, customer debit notes, ledger | Dedicated debit note table (now supports supplier_id) |
| `sales.credit_notes` / `sales.debit_notes` | Legacy migration source only | Deprecated pre-financial-schema note tables |

### Credit Note from Sales Return (Primary Path)
```
1. Generate credit_note_number
2. Calculate total = credit_amount + tax_amount
3. INSERT financial.credit_notes (status='approved')
4. INSERT financial.customer_outstanding (NEGATIVE total_amount)
5. SELECT SUM(outstanding) → new balance
```

### Known Issues (Credit Notes)
| ID | Severity | Issue |
|----|----------|-------|
| CN-1 | **CRITICAL** | Three separate tables -- manual notes (credit_debit_notes) invisible in ledger statements (reads credit_notes/debit_notes) |
| CN-2 | **HIGH** | `get_notes()` only reads from `sales_returns`/`purchase_returns`, not from financial tables |
| CN-3 | **HIGH** | Cancelling a note does NOT reverse `customer_outstanding` |

---

## 15. CUSTOMER OUTSTANDING & LEDGER

### Outstanding Management

Records in `financial.customer_outstanding` are created by:
1. Invoice creation background task (INV-2: currently NOT called)
2. `sync_outstanding()` API (manual/bulk sync from invoices)
3. Credit note from return (negative amount)
4. Customer receipt (negative amount)

### Customer Statement (Ledger)

UNION ALL of 4 sources:
```
Invoices (debit)   → sales.invoices.final_amount
Payments (credit)  → financial.payments.payment_amount
Credit Notes (cr)  → financial.credit_notes.total_amount
Debit Notes (dr)   → financial.debit_notes.total_amount
```
Running balance = SUM(debit) - SUM(credit)

### Supplier Statement (Ledger) -- FIXED 2026-02-06

UNION ALL of 2 sources (was payments-only):
```
Outstanding entries (debit/credit) → financial.supplier_outstanding
  - Positive amounts = what we owe (invoices, GRNs)
  - Negative amounts = reduces payable (debit notes from purchase returns)
Payments (credit)                  → financial.payments (party_type='supplier')
```
Running balance = SUM(debit) - SUM(credit)

### Known Issues
| ID | Severity | Issue |
|----|----------|-------|
| OUT-1 | **HIGH** | Bulk sync uses `ON CONFLICT DO NOTHING` (never updates existing records) vs single sync uses `ON CONFLICT DO UPDATE` |
| OUT-2 | **HIGH** | Customer outstanding from invoices depends on background task that isn't called |

---

## 16. JOURNAL ENTRIES

### Flow
```
1. INSERT financial.journal_entries (header: number, date, narration, status='posted')
2. INSERT financial.journal_entry_lines (each line: account, debit/credit amount)
```

### Reversal
```
UPDATE financial.journal_entries SET entry_status='reversed'
⚠ Does NOT create offsetting entry (debits/credits remain in ledger)
```

---

## 17. EXPENSE CLAIMS

### Lifecycle
```
submitted → approved/rejected
```

### Tables
| Table | Op |
|-------|-----|
| `financial.expense_claims` | INSERT, UPDATE |
| `financial.expense_claim_items` | INSERT |
| `master.employees` | SELECT, INSERT |

---

## 18. INVENTORY MANAGEMENT

### Core Tables
| Table | Purpose |
|-------|---------|
| `inventory.products` | Product master |
| `inventory.batches` | Batch tracking (qty_available, qty_sold, qty_returned) |
| `inventory.inventory_movements` | Audit trail of all stock movements |
| `inventory.location_wise_stock` | Location-level stock tracking |
| `inventory.product_categories` | Product categorization |

### Stock Movement Recording
```
INSERT inventory.inventory_movements
(org_id, movement_type, movement_direction,
 product_id, batch_id, quantity,
 reference_type, reference_id, reference_number,
 reason, created_by, movement_date)
```

Movement types: `sale`, `return`, `return_damaged`, `purchase`, `PURCHASE_RETURN`,
`stock_damage`, `stock_expiry`, `stock_count`, `stock_adjustment`

### Stock Adjustment Flow
```
1. Get batch info (validate exists)
2. Validate sufficient stock for negative adjustments
3. Map adjustment_type to movement_type
4. Record movement via InventoryService.record_stock_movement()
   → UPDATE inventory.batches
   → INSERT inventory.inventory_movements
```

### Stock Receive/Issue (FIXED 2026-02-06)
```
1. Validate product exists + stock availability (issue only)
2. Call InventoryService.record_stock_movement()
   → INSERT inventory.inventory_movements (audit trail)
   → UPDATE inventory.batches.quantity_available
   → UPDATE/INSERT inventory.location_wise_stock (both on_hand AND available)
3. Return movement_id + movement_number
```

### Stock Transfer (IMPLEMENTED 2026-02-06)
```
1. Validate source has sufficient stock
2. InventoryService.record_stock_transfer() (atomic):
   a. OUT movement from source_location
   b. IN movement to destination_location
   c. Both update batches + location_wise_stock
3. Return out_movement_id + in_movement_id
```

### Known Issues (Inventory) -- FIXED 2026-02-06
| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| INV-I1 | **CRITICAL** | `/movements/receive` and `/movements/issue` did NOT create inventory_movements | **FIXED** -- now uses `record_stock_movement()` |
| INV-I2 | **CRITICAL** | Receive/issue did NOT update `inventory.batches.quantity_available` | **FIXED** -- `record_stock_movement()` updates batches |
| INV-I3 | **HIGH** | `location_wise_stock` asymmetry: increase updated only `quantity_on_hand` | **FIXED** -- now updates both `quantity_on_hand` AND `quantity_available` |
| INV-I4 | **HIGH** | Write-offs used `inventory.stock_movements` (wrong table) | **FIXED** -- now uses `inventory.inventory_movements` |
| INV-I5 | **MEDIUM** | `/movements/transfer` endpoint was non-functional stub | **FIXED** -- atomic two-movement transfer via `record_stock_transfer()` |
| INV-I7 | **HIGH** | Legacy tables in public schema | **FIXED** -- moved to `inventory.*` and `compliance.*` schemas |

---

## 19. STOCK ADJUSTMENTS & WRITE-OFFS

### Write-off Flow (FIXED 2026-02-06)
```
1. Generate writeoff_id + writeoff_number
2. Determine ITC reversal (expired/damaged/theft → reversal required)
3. INSERT inventory.stock_writeoffs
4. For each item:
   a. INSERT inventory.stock_writeoff_items
   b. UPDATE inventory.batches (reduce quantity_available)
   c. INSERT inventory.inventory_movements (movement_type='writeoff', direction='out')
5. If ITC reversal: INSERT compliance.gst_adjustments
6. COMMIT
```

### Schema Migration (FIXED 2026-02-06)
Tables moved from `public` to proper schemas:
- `stock_writeoffs` → `inventory.stock_writeoffs`
- `stock_writeoff_items` → `inventory.stock_writeoff_items`
- `gst_adjustments` → `compliance.gst_adjustments`
- Write-off movements now use `inventory.inventory_movements` (was `inventory.stock_movements`)

---

## 20. MASTER DATA

### Customer Service

| Operation | Tables |
|-----------|--------|
| Create customer | INSERT `parties.customers`, INSERT `master.addresses` |
| Update customer | UPDATE `parties.customers` (dynamic allowlist) |
| Search | SELECT `parties.customers` JOIN `master.addresses` (ILIKE) |
| Customer stats | SELECT `sales.orders`, `financial.payments`, `financial.customer_outstanding` |
| Credit limit validation | SELECT `parties.customers` ⚠ hardcodes outstanding to 0 |
| Delete customer | Checks `sales.invoices` and `sales.orders` exist first |

### Product Service

| Operation | Tables |
|-----------|--------|
| Create product | INSERT `inventory.products`, optional INSERT `inventory.batches` |
| Search products | SELECT `inventory.products` LEFT JOIN `inventory.batches` (ILIKE) |
| Get/create product | Case-insensitive exact match, auto-create if missing |
| Update batches | UPDATE `inventory.batches` (with trigger disable!) |

### Supplier Service

| Operation | Tables |
|-----------|--------|
| Create supplier | INSERT `parties.suppliers`, INSERT `master.addresses` |
| Search | SELECT `parties.suppliers` JOIN `master.addresses` (ILIKE) |
| Supplier products | JOIN `procurement.purchase_orders` (may be wrong table) |

---

## 21. AUTHENTICATION & MULTI-TENANCY

### Login Flow
```
1. UserRepository.find_by_email() → master.org_users JOIN master.organizations LEFT JOIN master.roles
2. Check is_active (user) + org_active (org)
3. Verify password_hash (bcrypt)
4. Map data_access_level → branch_scope (organization→all, region→multi, branch→single)
5. Create JWT access token (1h standard, 7d remember-me)
6. Create refresh token (30d)
7. UPDATE master.org_users SET last_login, login_count++ (commits immediately)
8. Return tokens + user object
```

### JWT Payload
```json
{
  "user_id": 8,
  "email": "user@example.com",
  "org_id": "uuid",
  "role_id": 1,
  "branch_ids": [1, 2],
  "branch_scope": "all|multi|single",
  "data_access_level": "organization",
  "is_admin": true,
  "full_name": "User Name"
}
```

### Known Issues (Auth)
| ID | Severity | Issue |
|----|----------|-------|
| AUTH-1 | **HIGH** | No rate limiting on login (failed_login_count not implemented) |
| AUTH-2 | **HIGH** | Refresh tokens not stored server-side (cannot be revoked) |
| AUTH-3 | **MEDIUM** | Offline auth hash uses SHA256 (not bcrypt) for IndexedDB |
| AUTH-4 | **LOW** | AdminBypass references wrong class attribute |

---

## 22. OFFLINE SYNC

### Sync Endpoint
```
POST /api/v1/sync/
```

### Tables for Delta Sync
| Entity | Table | Sync Fields |
|--------|-------|-------------|
| products | `inventory.products` | product_id, name, code, hsn, gst_rate, manufacturer, is_active |
| batches | `inventory.batches` | batch_id, product_id, batch_number, qty_available, mrp, expiry |
| customers | `parties.customers` | customer_id, name, phone, gst_number, outstanding |
| suppliers | `parties.suppliers` | supplier_id, name, code, gstin, phone |
| employees | `master.employees` | employee_id, full_name, role, phone, email |
| outstanding | `financial.customer_outstanding` | customer_id, total outstanding SUM |

Each entity tracks `last_synced_at` timestamp for delta queries.

---

## 23. LOYALTY PROGRAM

### Tables
| Table | Purpose |
|-------|---------|
| `sales.loyalty_programs` | Program config (points_per_rupee, etc.) |
| `sales.loyalty_tiers` | Tier definitions (Silver, Gold, Platinum) |
| `sales.loyalty_transactions` | All point events (earned, redeemed, expired, bonus) |

### Key Flows
- **Earn points:** INSERT transaction (type=earned) after invoice
- **Redeem:** INSERT transaction (type=redeemed) + UPDATE `sales.invoices` SET loyalty_points_used, loyalty_discount, final_amount -= discount
- **Expire:** Background job finds expired points, inserts expiry transactions

### Known Issue
- Balance calculation inconsistent: `get_customer_points_balance()` excludes expired, `get_balance_after_transaction()` does not.

---

## 24. GST & COMPLIANCE

### GST Type Determination
```python
company_state = org_branches.branch_gst_number[:2] → STATE_CODES lookup
party_state = cascade: delivery_address → billing_address → customer default
if same_state: "CGST/SGST" (split 50/50)
if different: "IGST" (full rate)
default: "CGST/SGST" (if lookup fails)
```

### GST Calculation
```python
GST_SLABS = [0, 5, 12, 18, 28]

if gst_type == "CGST/SGST":
    cgst_percent = gst_rate / 2
    sgst_percent = gst_rate / 2
    cgst_amount = taxable * cgst_percent / 100
    sgst_amount = taxable * sgst_percent / 100
elif gst_type == "IGST":
    igst_percent = gst_rate
    igst_amount = taxable * igst_percent / 100
```

### GSTR-1 Compliance
- Invoice cancellation blocked after 11th of next month
- `gstr1_reported_date` field tracks when invoice was reported

---

## 25. DASHBOARD & ANALYTICS

### Available Queries (for AI analytics agent)

| Metric | SQL Source |
|--------|-----------|
| Total products | COUNT from `inventory.products` WHERE is_active |
| Total customers | COUNT from `parties.customers` |
| Orders (30d) | COUNT + SUM(final_amount) from `sales.orders` |
| Total suppliers | COUNT from `parties.suppliers` |
| Active batches | COUNT from `inventory.batches` WHERE qty_available > 0 |
| Near-expiry | COUNT from `inventory.batches` WHERE expiry_date ≤ 30d |
| Revenue by period | SUM(final_amount) from `sales.orders` GROUP BY date/week/month |
| Top products | SUM(quantity) from `sales.order_items` GROUP BY product |
| Top customers | SUM(total_spent) from `parties.customers` JOIN `sales.orders` |
| Aging report | `sales.invoices` buckets: current, 1-30, 31-60, 61-90, 90+ |
| Collection efficiency | total_collected / total_billed from `sales.invoices` |
| Low stock | Products where SUM(qty_available) ≤ reorder_level |
| Outstanding summary | SUM from `financial.customer_outstanding` by status/aging |

---

## 26. CROSS-MODULE INTERACTION MAP

```
                        ┌─────────────┐
                        │   MASTER    │
                        │  DATA       │
                        │ (customers, │
                        │  products,  │
                        │  suppliers) │
                        └──────┬──────┘
                               │ referenced by all
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
    │   SALES     │    │  PURCHASE   │    │  INVENTORY  │
    │             │    │             │    │             │
    │ Order ──────┼─X──│─PO          │    │ Batches     │
    │   ↓         │    │  ↓          │    │   ↑    ↓    │
    │ Invoice ────┼────│─ Supplier   │    │   │  Movements│
    │   ↓    ↓    │    │  Invoice    │    │   │         │
    │ Challan│    │    │  ↓          │    │   │         │
    │        │    │    │ GRN ────────┼────┼───┘(creates │
    │        │    │    │             │    │    batches)  │
    └────┬───┴────┘    └──────┬──────┘    └──────┬──────┘
         │                    │                   │
    ┌────▼────┐          ┌────▼────┐              │
    │ SALES   │          │PURCHASE │              │
    │ RETURN  │          │ RETURN  │              │
    │  ↓      │          │  ↓      │              │
    │Credit   │          │Debit    │              │
    │ Note    │          │ Note    │              │
    └────┬────┘          └────┬────┘              │
         │                                        │
    ┌────▼────────────────────────────────────────▼┐
    │              FINANCE MODULE                    │
    │                                               │
    │  Payments ← → Allocations ← → Outstanding    │
    │       ↓                           ↑           │
    │  Credit Notes ──────────────────→ │           │
    │       ↓                                       │
    │  Ledger (statement = invoices + payments +    │
    │         credit notes + debit notes)           │
    │                                               │
    │  Journal Entries (manual accounting)           │
    │  Expense Claims                               │
    └───────────────────────────────────────────────┘

    LEGEND:
    ───→  Data flows / triggers
    ─X──  Not implemented (Order→Invoice conversion = 501)
```

### Key Cross-Module Triggers

| Action | Triggers |
|--------|----------|
| Invoice created | → inventory.batches deducted, sales.orders created, delivery_challan created (if transport) |
| Invoice cancelled | → inventory.batches restored, optional credit note |
| Sales return (credit_note) | → inventory.batches restored, inventory_movements, financial.credit_notes, customer_outstanding reduced |
| Purchase return (debit_note) | → inventory.batches deducted, inventory_movements, financial.debit_notes (supplier_id), supplier_outstanding reduced |
| GRN created | → inventory.batches UPSERT (creates/increases stock) |
| Payment recorded | → sales.invoices updated (paid_amount), sales.orders updated (if fully paid) |
| Payment allocated | → financial.customer_outstanding updated |
| Challan delivered | → sales.orders delivery_status updated |

---

## 27. CRITICAL ISSUES -- PRODUCTION BLOCKERS

### Priority 1: Data Integrity (Must Fix Before Production)

| # | Module | Issue | Impact | Fix |
|---|--------|-------|--------|-----|
| 1 | **Invoice** | `inventory.inventory_movements` NOT created | No audit trail for stock deductions | Call `bulk_insert_movements()` in main transaction |
| 2 | **Invoice** | `financial.customer_outstanding` NOT created | Customer balance tracking broken | Call `update_customer_outstanding()` in main/background |
| 3 | **Invoice** | No stock validation before deduction | Negative batch quantities possible | Call `validate_stock_availability()` before deduction |
| 4 | **Sales Return** | No return quantity validation | Can return more than invoiced | Call `validate_return_quantity()` in create flow |
| 5 | **Sales Return** | Cancel uses wrong table `sale_returns` | Cancellation always fails with SQL error | Fix to `sales.sales_returns` |
| 6 | **Purchase Return** | No supplier ledger/payable update | Supplier balance never adjusted | **FIXED** -- debit note in financial.debit_notes (supplier_id) + financial.supplier_outstanding created |
| 7 | **Sales Order** | `validate_inventory()` and `allocate_inventory()` don't exist | Approve endpoint crashes | Implement or remove call |
| 8 | **Payments** | `record_payment()` doesn't update customer_outstanding | Outstanding always stale | Add outstanding update |
| 9 | **Credit Notes** | Three separate tables, reads don't cross | Manual notes invisible in ledger | Consolidate to single table system |

### Priority 2: Financial Accuracy

| # | Module | Issue | Impact |
|---|--------|-------|--------|
| 10 | Invoice | Scheme discount doesn't recalculate GST | GST filing discrepancy |
| 11 | Sales Return | Per-item GST hardcoded CGST/SGST | Wrong tax for inter-state returns |
| 12 | Purchase Return | IGST never accumulated (always 0) | **FIXED** -- uses ReturnService.calculate_return_totals with correct gst_type |
| 13 | Payment | Cancel doesn't reverse customer_outstanding | Phantom balance reduction |
| 14 | Allocation | Delete doesn't restore outstanding | Balance permanently reduced |
| 15 | Journal | Reversal only sets flag, no offsetting entry | Ledger stays unbalanced |

### Priority 3: System Integrity

| # | Module | Issue | Impact |
|---|--------|-------|--------|
| 16 | All | Document number race condition (no locking) | **FIXED** -- atomic INSERT...ON CONFLICT DO UPDATE on document_number_sequences |
| 17 | Inventory | Receive/issue don't create movements | No audit trail | **FIXED** -- now uses `record_stock_movement()` |
| 18 | Inventory | Receive/issue don't update batches | Data inconsistency | **FIXED** -- `record_stock_movement()` updates batches + location_wise_stock |
| 19 | Challans | Two challan table systems | Conversions broken |
| 20 | Write-offs | Uses different movement table | Write-offs invisible in reports | **FIXED** -- now uses `inventory.inventory_movements` |
| 21 | Auth | No login rate limiting | Brute force vulnerable |
| 22 | Settings | Cache invalidation bug (key mismatch) | Settings never refresh |
| 23 | Payment | Allocation requires 'completed' but payments created as 'cleared' | Can't allocate new payments |
| 24 | **Purchase Return** | Double batch deduction: `update_batch_stock_for_return()` + `record_stock_movement()` both deduct `quantity_available` | Stock deducted 2x per return | **FIXED** -- removed redundant batch update; `record_stock_movement()` handles it |
| 25 | **Sales Return** | `get_returnable_invoices()` filters `invoice_status = 'generated'` but invoices are `'posted'` | No invoices appear returnable | **FIXED** -- changed to `'posted'` |
| 26 | **Sales Return** | Cancelled returns still counted in "already returned" by `get_returnable_items()` / `validate_return_quantity()` | Can't re-return after cancel | **FIXED** -- added exclusion for cancelled returns |

---

## 28. DATABASE SCHEMA REFERENCE

### Complete Table Map

| Schema | Table | Primary Writes From |
|--------|-------|-------------------|
| **sales** | `orders` | Invoice creation, Sales Order creation |
| **sales** | `order_items` | Invoice creation, Sales Order creation |
| **sales** | `invoices` | Invoice creation, Payment recording, Cancellation |
| **sales** | `invoice_items` | Invoice creation |
| **sales** | `delivery_challans` | Challan creation, Auto-challan from invoice |
| **sales** | `delivery_challan_items` | Challan creation |
| **sales** | `sales_returns` | Sales return creation |
| **sales** | `sales_return_items` | Sales return creation |
| **sales** | `loyalty_programs` | Admin setup |
| **sales** | `loyalty_tiers` | Admin setup |
| **sales** | `loyalty_transactions` | Earn/redeem/expire events |
| **procurement** | `purchase_orders` | PO creation |
| **procurement** | `purchase_order_items` | PO creation |
| **procurement** | `goods_receipt_notes` | GRN creation |
| **procurement** | `grn_items` | GRN creation |
| **procurement** | `supplier_invoices` | Supplier invoice creation |
| **procurement** | `supplier_invoice_items` | Supplier invoice creation |
| **procurement** | `purchase_returns` | Purchase return creation |
| **procurement** | `purchase_return_items` | Purchase return creation |
| **inventory** | `products` | Product creation/import |
| **inventory** | `batches` | GRN (UPSERT), Invoice (deduction), Return (restoration) |
| **inventory** | `inventory_movements` | Sales return, Purchase return, Stock adjustment |
| **inventory** | `stock_writeoffs` | Write-off creation (moved from public schema) |
| **inventory** | `stock_writeoff_items` | Write-off items (moved from public schema) |
| **inventory** | `location_wise_stock` | Receive/issue/transfer (via record_stock_movement) |
| **inventory** | `product_categories` | Product creation |
| **financial** | `payments` | Payment recording, Customer receipt |
| **financial** | `payment_methods` | First payment of type (auto-create) |
| **financial** | `payment_allocations` | Payment allocation |
| **financial** | `customer_outstanding` | Credit note, Customer receipt, Outstanding sync |
| **financial** | `credit_notes` | Sales return (credit_note method) |
| **financial** | `debit_notes` | Purchase return (supplier debit notes), ledger |
| **financial** | `supplier_outstanding` | Purchase return debit notes, supplier payments |
| **financial** | `credit_debit_notes` | Manual note creation (legacy) |
| **financial** | `chart_of_accounts` | Account setup |
| **financial** | `journal_entries` | Journal creation |
| **financial** | `journal_entry_lines` | Journal creation |
| **financial** | `expense_claims` | Expense submission |
| **financial** | `expense_claim_items` | Expense submission |
| **financial** | `bank_reconciliations` | Bank reconciliation |
| **financial** | `unmatched_transactions` | Bank reconciliation |
| **parties** | `customers` | Customer creation, Payment recording |
| **parties** | `suppliers` | Supplier creation |
| **master** | `organizations` | Org setup |
| **master** | `org_branches` | Branch setup |
| **master** | `org_users` | User management, Login tracking |
| **master** | `addresses` | Customer/supplier creation |
| **master** | `roles` | RBAC setup |
| **master** | `employees` | Employee management |
| **master** | `system_settings` | Settings management |
| **master** | `hsn_codes` | HSN/GST rate lookup |
| **public** | `stock_writeoffs` | Write-off creation (needs schema) |
| **public** | `stock_writeoff_items` | Write-off creation (needs schema) |
| **public** | `gst_adjustments` | Write-off ITC reversal (needs schema) |
| **public** | `challans` | Conversion service (needs migration to sales schema) |
| **public** | `challan_items` | Conversion service (needs migration to sales schema) |

---

## APPENDIX: AI AGENT QUICK REFERENCE

### For "Create Invoice" Agent
```
1. POST /api/v1/sales/invoices/
2. Required: customer_id, items[{product_id, quantity, unit_price, gst_rate}]
3. Backend calculates everything -- send items, get invoice
4. Check response: invoice_id, invoice_number, final_amount
5. Tables written: sales.orders, sales.invoices, sales.invoice_items, inventory.batches
6. ⚠ Currently missing: inventory_movements, customer_outstanding
```

### For "Create Sales Return" Agent
```
1. GET /api/v1/returns/sales/invoice/{invoice_id}/returnable-items → get max returnable
2. POST /api/v1/returns/sales/ with return_method="credit_note"
3. Required: customer_id, invoice_id, return_method, items[{invoice_item_id, product_id, batch_id, return_quantity, unit_price, tax_percent}]
4. Tables written: sales.sales_returns, sales.sales_return_items, inventory.batches, inventory.inventory_movements, financial.credit_notes, financial.customer_outstanding
```

### For "Analytics" Agent
```
Key tables to query:
- Revenue: sales.invoices (final_amount, invoice_date, payment_status)
- Outstanding: financial.customer_outstanding (outstanding_amount, status, aging_bucket)
- Inventory: inventory.batches (quantity_available, expiry_date)
- Payments: financial.payments (payment_amount, payment_date, payment_mode)
- Returns: sales.sales_returns (total_amount, return_method, return_date)
- Products: inventory.products JOIN sales.invoice_items (for top sellers)
- Customers: parties.customers JOIN sales.invoices (for top buyers)
```

### For "Debug" Agent
```
Common issues to check:
1. Invoice created but no outstanding → INV-2 (background task not called)
2. Return created but cancel fails → RET-2 (wrong table name)
3. Payment allocated but invoice still unpaid → ALLOC-1 (doesn't update invoices)
4. Customer balance wrong → Check customer_outstanding vs invoices.paid_amount
5. Inventory mismatch → Check batches.quantity_available vs inventory_movements sum
6. Duplicate document numbers → Race condition in DocumentNumberService
```

---

> **End of Workflow Documentation**
> Version 1.0 | Generated from codebase analysis on 2026-02-06
