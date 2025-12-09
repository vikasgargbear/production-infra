# API Optimization Opportunities & Best Practices

## 🔐 Security Patterns

### Use JWT Context, Not Database Queries
```python
# ❌ BAD - Random user from DB
user_result = db.execute(text("SELECT user_id FROM master.org_users LIMIT 1"))
created_by = user[0]

# ✅ GOOD - Authenticated user from JWT
created_by = context.user_id
branch_id = context.primary_branch_id
```

### Use RBAC on All Endpoints
```python
# ✅ Standard pattern
@router.post("/")
@with_tenant_context
async def create_item(
    data: dict,
    _: dict = Depends(PermissionChecker("module", "action")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
```

### branch_id from JWT Context
```python
# ❌ BAD - Hardcoded fallback
branch_id = data.branch_id or 1

# ✅ GOOD - Use JWT context
branch_id = data.branch_id or context.primary_branch_id or 1
```

---

## 🔄 DRY Principles

### No Inline Calculations
- All calculation logic belongs in `enterprise_calculations.py`
- Import helpers, don't duplicate code

### Shared Helper Functions
- `_calculate_line_item()` - GST, discounts
- `_finalize_totals()` - round-off, final amount

---

## ⚡ Performance Patterns

### Avoid MAX() for Number Generation
```python
# ❌ BAD - Slow at scale
SELECT MAX(CAST(SUBSTRING(number FROM '[0-9]+') AS INTEGER))

# ✅ GOOD - Use sequences
SELECT nextval('invoice_number_seq')
```

### Use Pagination
- Always include `limit` and `offset` parameters
- Return `total` count for UI

---

## 📋 Standard Endpoints Per Module

| Endpoint | Permission | Purpose |
|----------|------------|---------|
| `GET /` | view | List with pagination |
| `GET /{id}` | view | Single item |
| `POST /` | create | Create new |
| `PUT /{id}` | edit | Update |
| `POST /{id}/cancel` | delete | Soft delete |
| `DELETE /{id}` | delete | Hard delete (admin) |

---

## 🔍 List Endpoint Filters

Always include:
- `search` - ILIKE on name/number fields
- `status` - Filter by document status
- `date_from` / `date_to` - Date range
- `customer_id` / `supplier_id` - Party filter

---

## Files to Review

| File | Issues Found |
|------|-------------|
| invoices.py | Fixed: JWT context, triggers, filters, discounts |
| payments.py | Fixed: created_by, reconciled_by, branch_id, added endpoints |
| orders.py | Fixed: created_by, branch_id from JWT context |
| customers.py | ✅ Clean - uses TenantAwareSession + RBAC |
| suppliers.py | ✅ Clean - uses TenantAwareSession + RBAC |
| products.py | ✅ Clean - uses TenantAwareSession + RBAC |

---

## 📚 Lessons from payments.py

### Frontend/Backend Alignment
Always check `services/api/modules/*.api.js` to ensure backend provides all endpoints frontend calls.

### Security Anti-Pattern Found
```python
# ❌ NEVER do this
user_result = db.execute(text("SELECT user_id FROM master.org_users LIMIT 1"))
payment.created_by = user_result.user_id

# ✅ Always use JWT context
payment.created_by = context.user_id
```

### Method Consistency
Use `POST` for state-changing actions like cancel, not `PUT`.
