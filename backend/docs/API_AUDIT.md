# API Audit & Status Tracker

**Last Updated**: 2025-12-08  
**Total Routes**: ~530  
**Route Files**: 76 (including 18 archived)

---

## ✅ Reviewed & Fixed

| File | Endpoints | Status | Changes Made |
|------|-----------|--------|--------------|
| `invoices.py` | 11 | ✅ Complete | JWT context, filters, update/cancel, SettingsService import |
| `payments.py` | 15 | ✅ Complete | JWT context, +4 endpoints |
| `orders.py` | 9 | ✅ Complete | JWT context |
| `enterprise_calculations.py` | 6 | ✅ Complete | RBAC, shared helpers |
| `customers.py` | 12 | ✅ Clean | Already modern |
| `suppliers.py` | 8 | ✅ Clean | Already modern |
| `products.py` | 8 | ✅ Clean | Already modern |
| `inventory.py` | 13 | ✅ Clean | Already modern |
| `purchases.py` | 11 | ✅ Complete | Renamed, TenantAwareSession, RBAC |
| `grn.py` | 6 | ✅ Complete | TenantAwareSession, RBAC, branch_id |
| `settings/` | 17 | ✅ Complete | Restructured to folder, RBAC, **+5min cache** |
| `ledger.py` | 9 | ✅ **NEW** | Replaced party_ledger_v2.py, SQL injection fixed, enterprise features |
| `conversions.py` | 5 | ✅ **NEW** | Unified document conversions (SO→Invoice, Challan→Invoice) |
| `stock_writeoff.py` | 5 | ✅ **NEW** | Stock write-off with ITC reversal for GSTR-3B |
| `sale_returns.py` | 9 | ✅ Complete | TenantAwareSession, RBAC, JWT context (user_id, branch_id) |
| `purchase_returns_enhanced.py` | 2 | ✅ Complete | TenantAwareSession, RBAC, JWT context, smart tax fetch |
| `gst.py` | 15 | ✅ Complete | TenantAwareSession, RBAC, JWT context |
| `dashboard.py` | 17 | ✅ Complete | TenantAwareSession, RBAC, JWT context |

---

## 🔄 In Progress - Consolidation Queue

| File | Priority | Action | Details |
|------|----------|--------|---------|
| `delivery_challan.py` | 🔴 High | **ARCHIVE** | Wrong table queries, missing imports, no RBAC |
| `enterprise_delivery_challan.py` | 🟢 Keep | **RENAME** | Rename to `challan.py`, add RBAC |
| `master_data.py` | 🔴 High | **ARCHIVE** | Duplicates customers.py/suppliers.py/products.py |
| `master_data_crud.py` | 🔴 High | **ARCHIVE** | All mock data, no real DB operations |
| `metadata.py` | 🟢 Keep | **ENHANCE** | Add caching, consolidate config endpoints |

---

## 📋 Pending Review

| File | Priority | Notes |
|------|----------|-------|
| `auth_enterprise.py` | High | Core auth (special - no RBAC typically) |

---

## 🆕 New APIs Added (This Session)

### ledger.py (Replaced party_ledger_v2.py)
**Prefix:** `/ledger`  
**Endpoints:**
- `GET /ledger/balance/{party_id}` - Party balance with advances
- `GET /ledger/statement/{party_id}` - Full statement (invoices, payments, CN/DN) with pagination
- `GET /ledger/aging/{party_id}` - Aging analysis (30/60/90/180+ days)
- `GET /ledger/opening-balance/{party_id}` - Opening balance as of date
- `GET /ledger/last-payment/{party_id}` - Last payment info with days since
- `GET /ledger/interest-calculation/{party_id}` - Interest on overdue amounts
- `GET /ledger/summary` - Overall receivables/payables summary
- `GET /ledger/top-debtors` - Top customers by outstanding

**Improvements:**
- ✅ SQL injection vulnerability fixed (parameterized queries)
- ✅ Full supplier support (not just customer)
- ✅ RBAC with PermissionChecker
- ✅ TenantAwareSession + OrgContext

### conversions.py
**Prefix:** `/conversions`  
**Endpoints:**
- `POST /conversions/sales-order/{order_id}/to-invoice` - SO to Invoice
- `POST /conversions/sales-order/{order_id}/to-challan` - SO to Challan
- `POST /conversions/challan/{challan_id}/to-invoice` - Challan to Invoice
- `POST /conversions/challan/bulk-to-invoice` - Multiple challans to single invoice
- `GET /conversions/eligible-challans` - List challans available for invoicing

### stock_writeoff.py
**Prefix:** `/stock-writeoff`  
**Endpoints:**
- `GET /stock-writeoff/expiry-report` - Expiring/expired stock report
- `POST /stock-writeoff/` - Create write-off with ITC reversal
- `GET /stock-writeoff/` - List write-offs with filters
- `GET /stock-writeoff/{writeoff_id}` - Write-off details
- `GET /stock-writeoff/itc-summary` - ITC reversal for GSTR-3B Table 4(B)(2)

---

## 📦 Archived (20 files)

| File | Reason |
|------|--------|
| `_archived/invoice_calculation.py` | Consolidated into enterprise_calculations |
| `_archived/party_ledger_v2.py` | **NEW** Replaced by ledger.py |
| `archive/auth.py` | Replaced by auth_enterprise |
| `archive/auth_diagnostics_REMOVED.py` | Security risk |
| `archive/auth_supabase.py` | Replaced |
| `archive/calculations.py` | Replaced |
| `archive/challan_to_invoice.py` | Replaced by conversions.py |
| `archive/collection_center_simple.py` | Replaced |
| `archive/create_user.py` | Replaced by users.py |
| `archive/direct_invoice.py` | Obsolete |
| `archive/enterprise_orders.py` | Replaced by orders.py |
| `archive/org_users.py` | Replaced by users.py |
| `archive/pharma_invoice_parser.py` | Obsolete |
| `archive/purchase_api.py` | Replaced |
| `archive/smart_invoice.py` | Obsolete |
| `archive/stock_writeoff.py` | Replaced by new stock_writeoff.py |
| `archive/users_old.py` | Replaced by users.py |

---

## ⚠️ Duplicate/Redundant APIs (Awaiting Archive)

| Redundant File | Replacement | Status |
|----------------|-------------|--------|
| `delivery_challan.py` | `enterprise_delivery_challan.py` → `challan.py` | 📋 Pending archive |
| `master_data.py` | `customers.py`, `suppliers.py`, `products.py` | 📋 Pending archive |
| `master_data_crud.py` | `metadata.py` (after enhancement) | 📋 Pending archive |
| `party_ledger_v2.py` | `ledger.py` | ✅ Archived |

---

## 🔧 Service Enhancements

### settings_service.py
- ✅ In-memory cache with 5-minute TTL
- ✅ Auto-invalidation on settings update
- ✅ Functions: `invalidate_settings_cache()`, `_get_cached()`, `_set_cached()`

---

## Security Patterns to Apply

```python
# Every endpoint should have:
@router.post("/")
@with_tenant_context
async def endpoint(
    _: dict = Depends(PermissionChecker("module", "action")),  # RBAC
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
    created_by = context.user_id  # NOT from DB
    branch_id = context.primary_branch_id  # NOT hardcoded
```

---

## Next Steps

1. ~~Review party_ledger_v2.py~~ → ✅ Done (replaced with ledger.py)
2. ~~Add settings caching~~ → ✅ Done (5-min TTL cache)
3. ~~Restore archived stock_writeoff~~ → ✅ Done (new modern API)
4. ~~Create document conversions API~~ → ✅ Done (conversions.py)
5. **Consolidate delivery challan APIs** → 🔄 In Progress
6. **Archive redundant master_data files** → 🔄 Pending approval
7. **Enhance metadata.py** → 🔄 Pending
8. Review remaining high-priority files
