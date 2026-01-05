# Purchase Module Optimization Playbook

**Purpose:** Comprehensive guide for purchase module optimization  
**Author:** Based on Module Optimization Playbook (Jan 2026)  
**Status:** ✅ Structure Complete, Phase 1 Done

---

## Module Structure (Matches Sales Module)

### Services Layer ✅
```
backend/app/api/services/purchase/
├── __init__.py              # Exports all services
├── calculations.py          # PurchaseCalculator (like InvoiceCalculator)
├── purchase_service.py      # Purchase order business logic
├── grn_service.py           # GRN business logic
├── supplier_invoice_service.py  # Supplier invoice logic
└── parsers/                 # PDF parsing utilities
```

### Routes Layer
```
backend/app/api/routes/purchase/
├── __init__.py
├── orders.py                # Purchase order routes (1467 lines)
├── grn.py                   # GRN routes
├── supplier_invoices.py     # Supplier invoice routes
├── upload.py                # PDF upload/parse routes
└── pharma_invoice_parser.py # Pharma parser
```

---

## Key Components

### 1. PurchaseCalculator ✅
Mirrors `InvoiceCalculator` from sales module:
- `calculate_item()` - Calculate single item with Decimal precision
- `calculate_totals()` - Aggregate all items
- `calculate_purchase_order_totals()` - PO-specific
- `calculate_supplier_invoice_totals()` - Invoice-specific with TDS
- `verify_calculation()` - Validate parsed invoice totals

### 2. GRNService ✅
Centralized GRN business logic:
- `create_grn()` - Create GRN with items
- `_update_inventory()` - Create/update batches
- `get_grn_by_id()` - Retrieve GRN
- `approve_grn()` - Approve and update stock

### 3. SupplierInvoiceService ✅
Centralized supplier invoice logic:
- `create_supplier_invoice()` - Create with calculated totals
- `_create_invoice_item()` - Add items with batch creation
- `_create_batch()` - Create inventory batch
- `update_payment_status()` - Update payment

---

## Schema Compliance ✅

### Column Name Corrections Applied

| Wrong | Correct | Tables |
|-------|---------|--------|
| `invoice_number` | `supplier_invoice_number` | supplier_invoices |
| `po_id` | `purchase_order_id` or `purchase_order_ids[]` | All |
| `subtotal` | `subtotal_amount` | All |
| `total_amount` | `invoice_total` (invoices) | supplier_invoices |
| `cost_price` | `unit_price` | purchase_order_items |
| `total_price` | `line_total` | purchase_order_items |
| `mrp` | `mrp_per_unit` | batches |
| `quantity_received` | `initial_quantity` | batches |
| `reference_id` | `source_reference_id` | batches |
| `storage_temperature` | `storage_condition` | batches |
| `phone` | `primary_phone` | suppliers |

### Files Fixed

| File | Status | Changes |
|------|--------|---------|
| `purchase_service.py` | ✅ Fixed | 6 column fixes |
| `grn.py` | ✅ Fixed | 5 column fixes |
| `upload.py` | ✅ Fixed | 5 table/column fixes |
| `supplier_invoices.py` | ✅ Verified | No issues |
| `orders.py` | ✅ Verified | No issues |

---

## New Files Created

| File | Purpose |
|------|---------|
| `calculations.py` | PurchaseCalculator - Decimal precision calcs |
| `grn_service.py` | GRN business logic service |
| `supplier_invoice_service.py` | Supplier invoice service |

---

## Route → Service Refactoring (Remaining)

Routes should call services instead of inline SQL:

```python
# Before (inline SQL in route)
result = db.execute(text("INSERT INTO..."))

# After (service layer)
from ...services.purchase import GRNService
result = GRNService.create_grn(db, org_id, branch_id, grn_data, user_id)
```

### Refactoring Status

| Route File | Refactored? | Notes |
|------------|-------------|-------|
| `grn.py` | ✅ Done | Uses GRNService.create_grn, approve_grn |
| `orders.py` | ⏳ Pending | Use PurchaseService |
| `supplier_invoices.py` | ⏳ Pending | Use SupplierInvoiceService |
| `upload.py` | ⏳ Pending | Use all services |

---

## Verification

```bash
# Check Python syntax for all new files
cd backend
python -c "from app.api.services.purchase import PurchaseCalculator, GRNService, SupplierInvoiceService; print('OK')"

# Test calculation
python -c "
from app.api.services.purchase import PurchaseCalculator
items = [{'quantity': 10, 'unit_price': 100, 'discount_percent': 5, 'tax_percent': 18}]
result = PurchaseCalculator.calculate_totals(items)
print(f'Invoice Total: {result[\"invoice_total\"]}')
"
```

---

## Next Steps

1. [x] Create calculations.py with PurchaseCalculator
2. [x] Create grn_service.py
3. [x] Create supplier_invoice_service.py
4. [x] Refactor grn.py routes to use GRNService (create_grn, approve_grn)
5. [ ] Refactor upload.py to use services
6. [ ] Refactor orders.py to use PurchaseService
7. [ ] Add unit tests for PurchaseCalculator

