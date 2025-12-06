# Migration Roadmap
## Complete Step-by-Step Implementation Plan

**Version:** 2.0  
**Date:** 2025-12-06  
**Progress:** 20% Complete

---

## Overview

**Goal:** Transform from transformation-heavy to enterprise-standard direct-use architecture

**Timeline:** 6-10 weeks  
**Current Status:** Customers complete (20%)  
**Next:** Batches (JOIN optimization - 27x speedup)

---

## Phase Progress Tracker

| Phase | Entity | Backend | Frontend | Tests | Status | Week |
|-------|--------|---------|----------|-------|--------|------|
| 1 | Customers | ✅ 59 fields | ⏳ Partial | ✅ Pass | **70%** | 1-2 |
| 2 | Batches | ⏳ Needs JOIN | ❌ Transform | ❌ Pending | **10%** | 3-4 |
| 3 | Products | ❌ Selective | ❌ Transform | ❌ Pending | **0%** | 5-6 |
| 4 | Suppliers | ❌ Selective | ❌ Transform | ❌ Pending | **0%** | 7-8 |
| 5 | Invoices | ❌ Multiple calls | ❌ Heavy | ❌ Pending | **0%** | 9-10 |

---

## Detailed Roadmap

### ✅ Phase 1: Customers (COMPLETE - Week 1-2)

**Completed:**
- [x] Backend: Return ALL 59 fields (vs 25 before)
- [x] Schema: CustomerResponse updated
- [x] Aliases: Added for backward compatibility
- [x] Testing: curl tests pass
- [x] Deploy: Railway auto-deployed

**Remaining:**
- [ ] Frontend: Update all customer components to use DB names
- [ ] Frontend: Remove DataTransformer.transformCustomer() calls
- [ ] Testing: UI regression tests

**Impact:** All customer fields now available, no backend changes needed for new fields

---

### ⏳ Phase 2: Batches (NEXT - Week 3-4)

**Current Problem:**
```python
# Uses subqueries (SLOW - 410ms for 10 batches)
(SELECT product_name FROM products WHERE id = b.product_id)
(SELECT hsn_code FROM products WHERE id = b.product_id)
# 40+ queries!
```

**Target:**
```python
# Use JOIN (FAST - 15ms for 10 batches)
SELECT b.*, p.product_name, p.hsn_code, p.gst_percent
FROM batches b
INNER JOIN products p ON b.product_id = p.product_id
# 1 query! 27x faster!
```

**Tasks:**
- [ ] Backend: Replace subqueries with proper JOIN
- [ ] Backend: Return ALL batch + product fields
- [ ] Test: Verify 27x performance improvement
- [ ] Frontend: Remove DataTransformer.transformBatch()
- [ ] Frontend: Update BatchSelector to use direct data
- [ ] Test: Batch selection in invoices works

**Impact:** 27x faster batch queries, complete product info included

---

### Phase 3: Products (Week 5-6)

**Tasks:**
- [ ] Backend: Return ALL 45+ product fields
- [ ] Backend: JOIN with categories
- [ ] Backend: Include batch summary
- [ ] Frontend: Remove DataTransformer.transformProduct()
- [ ] Frontend: Update ProductSearch components
- [ ] Test: Product search and selection works

**Impact:** Complete product data, category info included

---

### Phase 4: Suppliers (Week 7-8)

**Tasks:**
- [ ] Backend: Return ALL 53+ supplier fields
- [ ] Backend: JOIN with contacts
- [ ] Frontend: Remove DataTransformer.transformSupplier()
- [ ] Frontend: Update SupplierSearch components
- [ ] Test: Supplier selection works

**Impact:** Complete supplier data, contact info included

---

### Phase 5: Invoices (Week 9-10)

**Tasks:**
- [ ] Backend: Complex JOINs (customer + items + batches + products)
- [ ] Backend: Single endpoint returns everything
- [ ] Frontend: Remove heavy transformation logic
- [ ] Frontend: Update invoice components
- [ ] Test: Invoice creation end-to-end

**Impact:** Single API call for complete invoice data (vs 5+ calls)

---

## Success Metrics

**Technical:**
- [ ] DataTransformer.js deleted
- [ ] All entities use direct API responses
- [ ] All JOINs optimized (no subqueries)
- [ ] Response times < 150ms
- [ ] All tests passing

**Performance:**
- [ ] 68% faster page loads
- [ ] 27x faster batch queries
- [ ] Single API call per page
- [ ] No transformation overhead

---

**See also:** [Frontend Integration Guide](./07-FRONTEND-INTEGRATION.md)
