# API Routes Duplicate & Cleanup Audit

**Date:** 2025-10-16
**Purpose:** Identify duplicate/unused API routes for optimization
**Current API Files:** 67 route files

---

## Executive Summary

Found **multiple duplicate/redundant API endpoints** that can be consolidated or archived:

### Key Findings:
1. ✅ **auth.py** vs **auth_supabase.py** - Using supabase (auth.py unused)
2. ⚠️ **company.py** vs **company_simple.py** - Both registered (need consolidation)
3. ⚠️ **collection_center.py** vs **collection_center_simple.py** - Redundant
4. ⚠️ **org_users.py** vs **org_users_secure.py** vs **users.py** - 3 user endpoints!
5. ⚠️ **purchase_api.py** vs **purchase_enhanced.py** - Multiple purchase endpoints
6. ⚠️ **calculations.py** vs **enterprise_calculations.py** vs **invoice_calculation.py** - 3 calculation endpoints
7. ⚠️ **delivery_challan.py** vs **enterprise_delivery_challan.py** - Redundant
8. ⚠️ **orders.py** vs **sales_orders.py** vs **order_items.py** - Overlapping
9. ⚠️ **master_data.py** vs **master_data_crud.py** vs **master_settings.py** - 3 master endpoints
10. ⚠️ Multiple invoice endpoints (6 files)

---

## Detailed Analysis

### 1. Authentication Routes (2 files)

| File | Registered in main.py | Usage Status |
|------|----------------------|--------------|
| `auth.py` | ❌ NO | **UNUSED - Can archive** |
| `auth_supabase.py` | ✅ YES (line 127) | **ACTIVE** |

**Recommendation:** Archive `auth.py`

---

### 2. Company/Organization Routes (4 files)

| File | Registered in main.py | Prefix | Status |
|------|----------------------|--------|--------|
| `company.py` | ✅ YES (line 135) | `/api/company` | ACTIVE |
| `company_simple.py` | ✅ YES (line 192) | No prefix | ACTIVE |
| `collection_center.py` | ✅ YES (line 159) | `/api/collection-center` | ACTIVE |
| `collection_center_simple.py` | ❌ NO | - | **UNUSED** |

**Issues:**
- Both `company.py` and `company_simple.py` are registered
- `collection_center_simple.py` is imported but never registered

**Recommendation:**
- **Consolidate:** Merge `company.py` + `company_simple.py` → single `company.py`
- **Archive:** `collection_center_simple.py` (unused)

---

### 3. User Management Routes (3 files)

| File | Registered in main.py | Prefix | Tags |
|------|----------------------|--------|------|
| `users.py` | ✅ YES (line 142) | `/api/users` | "Users" |
| `org_users.py` | ✅ YES (line 198) | No prefix | "Organization Users" |
| `org_users_secure.py` | ✅ YES (line 199) | No prefix | "Secure Organization Users" |

**Issues:**
- 3 separate user management endpoints
- Potential overlapping functionality
- Confusing for frontend developers

**Recommendation:**
- **Consolidate:** Merge all into single `org_users_secure.py` (most secure)
- **Archive:** `users.py` and `org_users.py`

---

### 4. Purchase Routes (4 files)

| File | Registered in main.py | Prefix | Status |
|------|----------------------|--------|--------|
| `purchase_api.py` | ❌ NO | - | **UNUSED** |
| `purchase_enhanced.py` | ✅ YES (line 151) | `/api/purchase-enhanced` | ACTIVE |
| `purchase_returns_enhanced.py` | ✅ YES (line 154) | `/api/purchase-returns-enhanced` | ACTIVE |
| `purchase_upload.py` | ✅ YES (line 150) | `/api/purchase-upload` | ACTIVE |

**Recommendation:**
- **Archive:** `purchase_api.py` (unused)
- **Keep:** Other 3 files (specific purposes)

---

### 5. Calculation Routes (3 files)

| File | Registered in main.py | Tags | Status |
|------|----------------------|------|--------|
| `calculations.py` | ❌ NO | - | **UNUSED** |
| `invoice_calculation.py` | ✅ YES (line 188) | "Invoice Calculations" | ACTIVE |
| `enterprise_calculations.py` | ✅ YES (line 189) | "Enterprise Calculations" | ACTIVE |

**Recommendation:**
- **Archive:** `calculations.py` (unused)
- **Review:** Check if `invoice_calculation.py` + `enterprise_calculations.py` can be merged

---

### 6. Delivery Challan Routes (3 files)

| File | Registered in main.py | Prefix | Status |
|------|----------------------|--------|--------|
| `delivery_challan.py` | ✅ YES (line 147) | `/api/delivery-challan` | ACTIVE |
| `enterprise_delivery_challan.py` | ✅ YES (line 161) | `/api/enterprise-delivery-challan` | ACTIVE |
| `challan_to_invoice.py` | ❌ NO | - | **UNUSED** |

**Recommendation:**
- **Archive:** `challan_to_invoice.py` (unused)
- **Review:** Consolidate `delivery_challan.py` + `enterprise_delivery_challan.py`

---

### 7. Order Routes (3 files)

| File | Registered in main.py | Prefix | Tags |
|------|----------------------|--------|------|
| `orders.py` | ✅ YES (line 139) | No prefix | "Orders" |
| `sales_orders.py` | ✅ YES (line 166) | No prefix | "Sales Orders" |
| `order_items.py` | ✅ YES (line 141) | `/api/order-items` | "Order Items" |

**Recommendation:**
- **Review:** Check if `orders.py` + `sales_orders.py` have overlapping routes
- **Consolidate if possible**

---

### 8. Invoice Routes (7 files!)

| File | Registered in main.py | Purpose | Status |
|------|----------------------|---------|--------|
| `invoices.py` | ✅ YES (line 140) | Main invoice CRUD | ACTIVE |
| `direct_invoice.py` | ❌ NO | - | **UNUSED** |
| `smart_invoice.py` | ❌ NO | - | **UNUSED** |
| `pharma_invoice_parser.py` | ❌ NO | - | **UNUSED** |
| `invoice_calculation.py` | ✅ YES (line 188) | Calculations | ACTIVE |
| `supplier_invoices.py` | ✅ YES (line 155) | Supplier invoices | ACTIVE |
| `challan_to_invoice.py` | ❌ NO | - | **UNUSED** |

**Recommendation:**
- **Archive:** `direct_invoice.py`, `smart_invoice.py`, `pharma_invoice_parser.py`, `challan_to_invoice.py`
- **Keep:** `invoices.py`, `invoice_calculation.py`, `supplier_invoices.py`

---

### 9. Master Data Routes (3 files)

| File | Registered in main.py | Prefix | Tags |
|------|----------------------|--------|------|
| `master_data.py` | ✅ YES (line 195) | `/api/master` | "Master Data" |
| `master_data_crud.py` | ✅ YES (line 182) | No prefix | "Master Data CRUD" |
| `master_settings.py` | ✅ YES (line 177) | `/api/master-settings` | "Master Settings" |

**Recommendation:**
- **Review:** These 3 likely have overlapping functionality
- **Consolidate:** Merge into single `master_data.py`

---

### 10. Stock Routes (Multiple files)

| File | Registered in main.py | Prefix | Status |
|------|----------------------|--------|--------|
| `stock_adjustments.py` | ✅ YES (line 148) | `/api/stock-adjustments` | ACTIVE |
| `stock_movements.py` | ✅ YES (line 156) | `/api/stock-movements` | ACTIVE |
| `stock_receive.py` | ✅ YES (line 160) | `/api/stock` | ACTIVE |
| `stock_dashboard.py` | ✅ YES (line 164) | `/api/stock-dashboard` | ACTIVE |
| `stock_writeoff.py` | ❌ NO | - | **UNUSED** |

**Recommendation:**
- **Archive:** `stock_writeoff.py` (unused)
- **Keep others:** Each has specific purpose

---

### 11. Archived Route (in archive/ folder)

| File | Location | Status |
|------|----------|--------|
| `enterprise_orders.py` | `routes/archive/` | Already archived ✅ |

---

## Summary of Unused/Duplicate Routes

### ❌ Definitely Unused (Not Registered) - 10 files:

1. `auth.py` - Replaced by auth_supabase.py
2. `calculations.py` - Replaced by invoice_calculation.py
3. `challan_to_invoice.py` - Unused utility
4. `collection_center_simple.py` - Unused
5. `direct_invoice.py` - Unused
6. `pharma_invoice_parser.py` - Unused
7. `purchase_api.py` - Replaced by purchase_enhanced.py
8. `smart_invoice.py` - Unused
9. `stock_writeoff.py` - Unused
10. `create_user.py` - Check if still needed

### ⚠️ Potential Duplicates (Need Review) - 8 file pairs:

1. `company.py` + `company_simple.py` (both registered)
2. `org_users.py` + `org_users_secure.py` + `users.py` (3 user endpoints)
3. `delivery_challan.py` + `enterprise_delivery_challan.py`
4. `orders.py` + `sales_orders.py`
5. `master_data.py` + `master_data_crud.py` + `master_settings.py`
6. `invoice_calculation.py` + `enterprise_calculations.py`
7. `inventory.py` + `inventory_batches.py`
8. `billing.py` vs other invoice routes

---

## Recommended Actions

### Phase 1: Archive Unused Routes (Safe - No impact)

Move to `backend/app/api/routes/archive/`:
```bash
mv auth.py calculations.py challan_to_invoice.py collection_center_simple.py \\
   direct_invoice.py pharma_invoice_parser.py purchase_api.py \\
   smart_invoice.py stock_writeoff.py archive/
```

**Impact:** None (these aren't registered in main.py)

---

### Phase 2: Consolidate Duplicate Routes (Requires code review)

1. **User Management:**
   - Merge `users.py` + `org_users.py` → `org_users_secure.py`
   - Update frontend to use single endpoint

2. **Company Routes:**
   - Merge `company.py` + `company_simple.py`
   - Keep best of both implementations

3. **Master Data:**
   - Merge `master_data.py` + `master_data_crud.py` + `master_settings.py`
   - Create single comprehensive endpoint

4. **Orders:**
   - Review `orders.py` vs `sales_orders.py`
   - Consolidate if overlapping

5. **Delivery Challan:**
   - Review and merge `delivery_challan.py` + `enterprise_delivery_challan.py`

---

### Phase 3: SQL File Cleanup

Review database SQL files for unused functions/APIs:
- `database/07-api/*.sql` - Old PostgreSQL function APIs (likely replaced by Python APIs)
- `database/fixes/*.sql` - One-time fix files (archive after verification)
- `database/migrations/*.sql` - Old migrations (archive if applied)

---

## File Count Summary

### Current State:
- **Total route files:** 67
- **Unused/not registered:** 10
- **Potential duplicates:** ~8 pairs
- **Clean, single-purpose:** ~40

### After Cleanup:
- **Archive:** 10 unused files
- **Consolidate:** 8 file pairs → 8 files
- **Final count:** ~49 route files (27% reduction)

---

## Next Steps

1. ✅ Create this audit document
2. ⏳ Archive 10 unused route files (Phase 1)
3. ⏳ Review duplicate routes for consolidation (Phase 2)
4. ⏳ Test all endpoints after changes
5. ⏳ Update frontend to use consolidated endpoints
6. ⏳ Audit and archive unused SQL files

---

**Status:** Audit Complete, Ready for Cleanup
**Estimated Time:** 2-3 hours for full cleanup
**Risk Level:** Low (unused files), Medium (consolidation)
