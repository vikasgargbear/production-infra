# Comprehensive Alias Audit

**Generated:** 2026-01-07  
**Scope:** All backend and frontend modules  
**Purpose:** Identify and document ALL field name aliases for systematic remediation  

---

## Executive Summary

**Problem:** Multiple field name variations exist across backend/frontend causing:
- Confusion (which name is canonical?)
- Bugs (wrong field names in payloads)
- Inconsistency (same data, different names)

**Solution:** Enforce single source of truth = **database column names**

| Category | Backend Occurrences | Frontend Occurrences | Risk Level |
|----------|---------------------|----------------------|------------|
| Display fields (name, etc.) | 50+ | 30+ | ✅ LOW (read-only) |
| ID fields (party_id, etc.) | 15+ | 20+ | ⚠️ MEDIUM (query params) |
| Code fields (batch_no, etc.) | 10+ | 10+ | ⚠️ MEDIUM (identifiers) |

**Total Estimated:** ~150 alias occurrences to audit

---

## Database Schema (Canonical Names)

### Primary Keys
- `customer_id` (NOT customer_code, party_id for customers)
- `supplier_id` (NOT party_id for suppliers)
- `product_id` (NOT product_code for primary key)
- `invoice_id` (NOT invoice_number for primary key)
- `batch_id` (NOT batch_number for primary key)

### Display Fields (Safe - read-only in schemas)
- `product_name` - ✅ Canonical (used in schemas for display)
- `customer_name` - ✅ Canonical (used in schemas for display)
- `batch_number` - ✅ Canonical (column name in database)
- `invoice_number` - ✅ Canonical (column name in database)

---

## Category 1: Display Fields (LOW RISK)

### `product_name` - ✅ SAFE
**Canonical:** `product_name`  
**Database Column:** `master.products.product_name`  
**Status:** Used correctly in 40+ schemas as display field

**Locations:**
- Backend schemas: `billing.py`, `order.py`, `challan.py`, `product_schema.py`
- Frontend: `fieldAliases.ts` maps to variants
- Purpose: Display only, not used in queries

**Action:** ✅ **NO CHANGE NEEDED** - This is correct

---

### `customer_name` - ✅ SAFE
**Canonical:** `customer_name`  
**Database Column:** `master.customers.customer_name`  
**Status:** Used correctly in 25+ schemas

**Locations:**
- Backend schemas: `billing.py`, `order.py`, `customer.py`
- Frontend: Used for display
- Purpose: Display only

**Action:** ✅ **NO CHANGE NEEDED** - This is correct

---

## Category 2: Identifier Fields (MEDIUM RISK)

### `party_id` - ⚠️ NEEDS AUDIT
**Problem:** Generic "party_id" used for both customers AND suppliers

**Database Reality:**
- `master.customers.customer_id`
- `master.suppliers.supplier_id`
- NO `party_id` column exists

**Locations Found:**
- `backend/app/api/schemas/finance/finance.py:234` - `party_id: int`
- `backend/app/api/schemas/finance/finance.py:249` - `party_id: int`
- `frontend/src/components/ledger/PartyLedgerV3.tsx` - 20+ occurrences

**Context:** Finance module uses "party" as abstraction over customer/supplier

**Recommendation:**
- **Backend:** Add `party_type` field alongside `party_id` to disambiguate
- **Frontend:** Keep as UI abstraction but always resolve to customer_id or supplier_id for API calls

---

### `supplier_id` - ✅ MOSTLY SAFE
**Canonical:** `supplier_id`  
**Database Column:** Exists in multiple tables

**Locations:** 10+ schemas correctly use `supplier_id`

**Action:** ✅ **NO CHANGE NEEDED**

---

## Category 3: Code/Number Fields (MEDIUM RISK)

### `batch_no` vs `batch_number` - ⚠️ INCONSISTENT
**Canonical:** `batch_number`  
**Database Column:** `inventory.batches.batch_number`

**Problem:** Code uses both `batch_no` and `batch_number`

**Locations:**
- `backend/.../returns.py:63` - ❌ `batch_no` (WRONG - should be `batch_number`)
- `frontend/src/config/fieldAliases.ts:36` - Maps both variants

**Action:**
- [ ] Replace `batch_no` with `batch_number` in returns.py
- [ ] Search for other `batch_no` occurrences

---

### `invoice_no` vs `invoice_number` - ⚠️ INCONSISTENT
**Canonical:** `invoice_number`  
**Database Column:** `sales.invoices.invoice_number`

**Locations:**
- `frontend/src/config/fieldAliases.ts:61` - Maps `invoice_no` to `invoice_number`
- `frontend/.../useCreditManagement.ts:14` - Uses `invoiceNo` (camelCase)

**Action:**
- [ ] Audit all `invoice_no` / `invoiceNo` usage
- [ ] Replace with `invoice_number`

---

## Category 4: PREVIOUSLY FIXED ✅

### `sales_person_id` vs `salesperson_id`
**Status:** ✅ FIXED in previous commits  
**Canonical:** `salesperson_id`  
**Verification:** No `sales_person_id` found in grep

---

## Remediation Plan

### Phase 1: High-Risk Aliases (Breaking)
1. [ ] `batch_no` → `batch_number` (returns schema)
2. [ ] `invoice_no` / `invoiceNo` → `invoice_number` 
3. [ ] Audit `party_id` usage in finance

### Phase 2: Medium-Risk (Queries/APIs)
4. [ ] Frontend camelCase → snake_case alignment
5. [ ] Verify all foreign keys use correct IDs

### Phase 3: Low-Risk (Display)
6. [ ] Document that display fields (product_name, customer_name) are correct
7. [ ] Clean up fieldAliases.ts to remove unnecessary mappings

---

## Search Commands for Deep Audit

```bash
# Find all potential aliases
grep -rn "batch_no\|batchNo\|batch_number" backend frontend --include="*.py" --include="*.ts" --include="*.tsx"

# Find invoice number variants
grep -rn "invoice_no\|invoiceNo\|invoice_number" backend frontend --include="*.py" --include="*.ts" --include="*.tsx"

# Find party_id usage
grep -rn "party_id" backend frontend --include="*.py" --include="*.ts" --include="*.tsx"
```

---

## Next Steps

1. ✅ Document created
2. ⏭️ User review and approval
3. ⏭️ Fix high-risk aliases
4. ⏭️ Test after each fix
5. ⏭️ Final verification grep
