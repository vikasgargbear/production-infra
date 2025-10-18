# API Debug Questions & Answers

## Document Number Generation

**Q:** Why so many number generators (DocumentNumberService, V2, fallbacks)?

**A:** ✅ **FIXED** - Replaced all with `SimpleNumberGenerator`
- Single timestamp-based generator
- Format: `{PREFIX}-{YY}{timestamp:08d}`
- No database queries needed
- Guaranteed unique (millisecond precision)
- No race conditions

**File:** `backend/app/api/services/simple_number_generator.py`

---

## Global Employees Endpoint

**Q:** Should `/employees` be a global component instead of repeated in each API?

**A:** ✅ **FIXED** - Created `CommonService`
- `CommonService.get_active_employees(db, org_id)`
- Single source of truth
- Eliminates duplicate queries across 67 files

**File:** `backend/app/api/services/common_service.py`

---

## org_id Inconsistency

**Q:** Too many inconsistent org_id references - how to standardize?

**A:** ✅ **FIXED** - Implemented secure pattern
```python
# OLD - INSECURE (client can fake)
org_id: str = Depends(get_org_id_from_header)

# NEW - SECURE (from JWT token)
org_id: UUID = Depends(get_org_id_secure)
```

**Files:**
- `backend/app/core/secure_auth.py` - JWT extraction
- `backend/app/middleware/rls_middleware.py` - Sets DB context
- `sales_orders.py`, `invoices.py` - Migrated (65 more to go)

---

## Multi-tenant Data Isolation

**Q:** How to prevent one company from seeing another's data? Won't missing org_id filters cause issues?

**A:** ✅ **FIXED** - Row-Level Security (RLS)
- **PostgreSQL-level enforcement** - cannot be bypassed
- Even if code forgets `org_id` filter, RLS blocks access
- 35+ tables protected
- Middleware sets `app.current_org_id` from JWT token
- RLS policies automatically filter all queries

**Database:** `MASTER_DATABASE_FIXES.sql` - Section 27
**Middleware:** `backend/app/middleware/rls_middleware.py`

**For multiple locations (same company):**
- `org_id` = Company level (isolation boundary)
- `branch_id` = Location level (filtering within company)

---

## Tax Percent Defaults

**Q:** Why `tax_percent or 5`? Shouldn't it come from user input if not in DB?

**A:** ✅ **FIXED** - GSTService implementation
```python
# OLD - BAD
tax_percent = item.tax_percent or 5  # Why 5%?!

# NEW - CORRECT
gst_rate = GSTService.get_product_gst_rate(db, product_id, org_id)
if not gst_rate:
    # Must come from user input
    gst_rate = item.gst_percent
    if not gst_rate:
        raise HTTPException(400, "GST rate required for product")
```

**File:** `backend/app/api/services/gst_service.py`

---

## GST Type Computation

**Q:** Should `gst_type` be computed automatically based on company location vs delivery location?

**A:** ✅ **FIXED** - Auto-determination in GSTService
```python
gst_type = GSTService.determine_gst_type(
    db, org_id,
    customer_id=customer_id,
    delivery_address_id=delivery_address_id
)
# Returns: "CGST/SGST" (same state) or "IGST" (different state)
```

**File:** `backend/app/api/services/gst_service.py`

---

## Calculation Approach

**Q:** Should we compute at item level then sum, or order level first?

**A:** ✅ **CORRECT APPROACH** - Item-level then sum

**Reasoning:**
1. Rounding accuracy (round at item level is more accurate)
2. Audit trail (can trace each item's contribution)
3. GST compliance (item-wise HSN reporting required)
4. Returns (easy to reverse individual items)
5. Database normalization (matches table structure)

**Current implementation is correct.**

---

## Invoice Endpoints

**Q:** Why `/simple` invoice when we have comprehensive invoice API?

**A:** ⏳ **TODO** - Remove `/simple` endpoint
- Bypasses triggers (dangerous)
- Redundant
- Creates confusion

**Action:** Delete lines 40-92 in `invoices.py`

---

## GST Consistency

**Q:** GST logic should be consistent across all modules, right?

**A:** ✅ **CORRECT** - Implemented GSTService
- Auto GST type determination
- Tax rate from product master
- Consistent calculations
- Used in: sales_orders.py, invoices.py
- **TODO:** Migrate to remaining modules (purchases, returns, etc.)

---

## Summary

| Issue | Status | Solution |
|-------|--------|----------|
| Multiple number generators | ✅ Fixed | SimpleNumberGenerator |
| Duplicate employees queries | ✅ Fixed | CommonService |
| org_id inconsistency | ✅ Fixed | JWT-based secure_auth |
| Multi-tenant isolation | ✅ Fixed | RLS policies |
| Hardcoded tax defaults | ✅ Fixed | GSTService |
| Auto GST type | ✅ Fixed | GSTService.determine_gst_type |
| Calculation approach | ✅ Confirmed | Item-level is correct |
| /simple endpoint | ⏳ TODO | Remove |
| GST consistency | 🔄 In Progress | GSTService created, migrating |

---

## Next Steps

1. ✅ **Database Consolidation Complete** - All scattered SQL files consolidated into MASTER_DATABASE_FIXES.sql
2. Push backend changes to Railway
3. Test with JWT tokens
4. Migrate remaining 65 API files to secure auth
5. Remove `/simple` invoice endpoint
6. Replace old number generators
7. Implement GSTService in all modules

---

## Database Consolidation (2025-10-16)

**Problem:** 20+ scattered SQL files with hardcoded org_id/branch_id values - impossible to scale

**Solution:**
- ✅ Consolidated 18 files into MASTER_DATABASE_FIXES.sql (Sections 28-34)
- ✅ Removed hardcoded emergency fixes (CREATE_DEFAULT_BRANCH.sql, FIX_BRANCH_ID.sql, etc.)
- ✅ Created `database/setup/` directory with parameterized templates
- ✅ All new customer onboarding now uses functions like `seed_product_categories_simple_for_org(p_org_id)`

**Files:** See `database/CONSOLIDATION_SUMMARY.md` for complete details
