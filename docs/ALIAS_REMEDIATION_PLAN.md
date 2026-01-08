# Alias Remediation Plan - Implementation Details

**Generated:** 2026-01-07  
**Based on:** Comprehensive grep across 150+ files  
**Objective:** Systematically replace all aliases with canonical database names  

---

## Priority 1: Backend - Critical Aliases (BREAKING)

### 1.1 `batch_no` → `batch_number` ⚠️ HIGH PRIORITY

**Canonical:** `batch_number` (database column: `inventory.batches.batch_number`)

| File | Line | Current Code | Fix Required |
|------|------|--------------|--------------|
| `schemas/sales/returns.py` | 63 | `batch_no: Optional[str]` | Change to `batch_number` |
| `routes/returns/sales/routes.py` | 331 | `batch_number=item.get("batch_no") or item.get("batch_number")` | Remove `batch_no` fallback |
| `services/purchase/order/order_service.py` | 277 | `item.get("batch_no") or item.get("batch_number")` | Remove `batch_no` fallback |
| `services/purchase/order/order_repository.py` | 427-429 | Variable named `batch_no` in query | Rename to `batch_number` |
| `services/purchase/grn_service.py` | 179, 253 | `item.get("batch_no")` fallbacks | Remove `batch_no` |
| `services/purchase/grn/grn_repository.py` | 114, 177 | `item.get("batch_no")` fallbacks | Remove `batch_no` |

**Total:** 9 occurrences across 6 files

**Context Example:**
```python
# BEFORE
batch_no: Optional[str] = Field(None, max_length=50, description="Batch number")

# AFTER  
batch_number: Optional[str] = Field(None, max_length=50, description="Batch number")
```

---

### 1.2 `invoice_no` → `invoice_number` ⚠️ MEDIUM PRIORITY

**Canonical:** `invoice_number` (database: `sales.invoices.invoice_number`)

**Backend:** 0 occurrences (✅ backend already correct!)

**Frontend:** 46 occurrences across 15+ files

---

## Priority 2: Frontend - Critical Aliases

### 2.1 `invoiceNo` (camelCase) → `invoice_number` ⚠️ HIGH VOLUME

**Files Affected (30+ occurrences):**

| File | Lines | Context | Fix |
|------|-------|---------|-----|
| `types/models/invoice.ts` | 95 | `invoice_no?: string` | Change to `invoice_number` |
| `gst/reports/InputCreditReport.tsx` | 21, 53, 153 | Interface + usage | Replace all |
| `sales/modals/LastDealModal.tsx` | 13, 139, 141 | Display modal interface | Replace all |
| `sales/modals/TaxDetailModal.tsx` | 26, 106 | Tax detail display | Replace all |
| `sales/invoice/*` | Multiple | Invoice flow components | Replace all |
| `payment/entry/*` | Multiple | Payment allocation | Replace all |

**Total:** ~30 occurrences

---

### 2.2 `batchNo` (camelCase) → `batch_number` ⚠️  VOLUME

**Estimated:** 16 occurrences (from 46 total camelCase aliases minus ~30 invoice)

---

## Priority 3: Low Risk (Display Fields - Already Correct ✅)

### 3.1 `product_name` - NO CHANGE NEEDED ✅
- Backend: 40+ uses (correct)
- Frontend: 10+ uses (correct)  
- Database: `master.products.product_name`
- **Action:** KEEP AS-IS

### 3.2 `customer_name` - NO CHANGE NEEDED ✅
- Backend: 25+ uses (correct)
- Frontend: 5+ uses (correct)
- Database: `master.customers.customer_name`
- **Action:** KEEP AS-IS

### 3.3 `supplier_id` - NO CHANGE NEEDED ✅
- All uses correct
- **Action:** KEEP AS-IS

---

## Priority 4: Special Cases - `party_id`

### 4.1 `party_id` Usage Analysis

**Database Reality:**
- NO `party_id` column exists
- Finance uses as abstraction over `customer_id` OR `supplier_id`

**Locations:**
| File | Line | Context | Recommendation |
|------|------|---------|----------------|
| `schemas/finance/finance.py` | 234, 249 | Payment allocation | Add `party_type` field |
| `components/ledger/PartyLedgerV3.tsx` | 20+ | Party ledger UI | Keep as UI abstraction |

**Decision:** 
- Backend: Add `party_type: Literal["customer", "supplier"]` alongside `party_id`
- Frontend: Keep `partyId` for UI, always resolve to `customer_id` or `supplier_id` in API calls
- **Action:** DOCUMENT, don't change (this is intentional abstraction)

---

## Implementation Steps

### Step 1: Backend `batch_no` → `batch_number` (9 changes)
```bash
# Files to edit:
1. backend/app/api/schemas/sales/returns.py
2. backend/app/api/routes/returns/sales/routes.py
3. backend/app/api/services/purchase/order/order_service.py
4. backend/app/api/services/purchase/order/order_repository.py
5. backend/app/api/services/purchase/grn_service.py
6. backend/app/api/services/purchase/grn/grn_repository.py
```

### Step 2: Frontend `invoice_no` → `invoice_number` (30 changes)
```bash
# Files to edit:
1. frontend/src/types/models/invoice.ts
2. frontend/src/components/gst/reports/InputCreditReport.tsx
3. frontend/src/components/sales/modals/LastDealModal.tsx
4. frontend/src/components/sales/modals/TaxDetailModal.tsx
5. frontend/src/components/sales/invoice/*.tsx (5 files)
6. frontend/src/components/payment/entry/*.tsx (2 files)
7. frontend/src/components/payment/shared/InvoiceSelector.tsx
```

### Step 3: Frontend `batchNo` → `batch_number` (16 changes)
```bash
# Search and replace in:
frontend/src/**/*.{ts,tsx}
```

### Step 4: Verification
```bash
# Ensure no aliases remain:
grep -rn "batch_no\b" backend frontend --include="*.py" --include="*.ts" --include="*.tsx"
grep -rn "invoice_no\b" backend frontend --include="*.py" --include="*.ts" --include="*.tsx"
```

---

## Effort Estimation

| Task | Files | Lines | Effort | Risk |
|------|-------|-------|--------|------|
| Backend batch_no | 6 | 9 | 15min | LOW |
| Frontend invoice_no | 10 | 30 | 30min | LOW |
| Frontend batchNo | ~8 | 16 | 20min | LOW |
| Testing | All | - | 30min | - |
| **TOTAL** | **24** | **55** | **95min** | **LOW** |

---

## Verification Checklist

After changes:
- [ ] Backend: `grep -rn "batch_no\b" backend` returns 0 results
- [ ] Frontend: `grep -rn "invoice_no\b" frontend` returns 0 results
- [ ] Frontend: `grep -rn "batchNo" frontend` returns 0 results
- [ ] Invoice creation works
- [ ] Purchase order creation works
- [ ] GRN creation works
- [ ] Payment allocation works

---

## Next Actions

1. **User Review:** Get approval for this plan
2. **Execute Step 1:** Backend batch_no fixes (safest, smallest)
3. **Test:** Verify purchase/GRN still works
4. **Execute Step 2:** Frontend invoice_no fixes
5. **Test:** Verify invoice/payment still works
6. **Execute Step 3:** Frontend batchNo fixes
7. **Final Verification:** Run all grep checks
8. **Commit:** Single commit with all alias fixes
