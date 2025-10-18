# API Migration Checklist - Tenant Service

## ✅ Completed: customers.py (list endpoint)
- ✅ Added tenant service imports
- ✅ Updated dependencies 
- ✅ Removed manual org_id filters
- ✅ Fixed WHERE clause logic
- ✅ Tested successfully

## 🔄 Migration Pattern (Copy This):

### 1. Update imports:
```python
# Add these imports:
from ...core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession, TenantContext
from ...core.org_context import get_org_context, OrgContext
```

### 2. Update endpoint signature:
```python
# OLD:
@router.get("/endpoint")
async def my_endpoint(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):

# NEW:
@router.get("/endpoint")
@with_tenant_context  # Add this decorator
async def my_endpoint(
    context: OrgContext = Depends(get_org_context),
    db: TenantAwareSession = Depends(get_tenant_aware_db)
):
```

### 3. Remove manual org_id filters:
```python
# Remove these:
WHERE org_id = :org_id
{"org_id": org_id}

# Keep business logic filters:
WHERE is_active = true
WHERE status = 'pending'
```

## 📋 Routes to Migrate (Priority Order):

### High Priority (Customer-facing):
- [ ] `customers.py` - get_customer (single customer)
- [ ] `customers.py` - remaining endpoints
- [ ] `products_consolidated.py` - all endpoints
- [ ] `invoices.py` - critical for business
- [ ] `sales_orders.py` - sales operations
- [ ] `inventory.py` - stock management

### Medium Priority (Operational):
- [ ] `suppliers.py` - supplier management
- [ ] `purchase_enhanced.py` - procurement
- [ ] `payments.py` - financial operations
- [ ] `delivery_challan.py` - logistics

### Lower Priority (Reports/Analytics):
- [ ] `dashboard.py` - dashboards
- [ ] `party_ledger_v2.py` - reports
- [ ] `collection_center.py` - collections
- [ ] `gst.py` - compliance

## ⚠️ Routes to Skip (No org_id filtering needed):
- `auth_supabase.py` - authentication
- `initial_setup.py` - setup
- `company_simple.py` - returns hardcoded data
- `create_user.py` - user creation
- `role_management.py` - roles (global)

## 🧪 Testing Each Migration:

### 1. Quick Test:
```python
# After migrating endpoint, test the query logic:
TenantContext.set_context(UUID("test-org-id"))
modified_query, params = TenantQueryBuilder.build_safe_query(
    "SELECT * FROM your_table", {}
)
# Should contain: WHERE org_id = :_tenant_org_id
```

### 2. Manual API Test:
```bash
# Test endpoint with X-Org-Id header:
curl -H "X-Org-Id: your-org-id" http://localhost:8000/api/endpoint
```

## 📊 Migration Progress Tracking:

| Route | Endpoints | Status | Priority | Notes |
|-------|-----------|---------|----------|-------|
| customers.py | 8 total | 1/8 ✅ | High | list_customers done |
| products_consolidated.py | ~6 | 0/6 ⏳ | High | Next target |
| invoices.py | ~10 | 0/10 ⏳ | High | Critical |
| sales_orders.py | ~8 | 0/8 ⏳ | High | Business critical |
| inventory.py | ~12 | 0/12 ⏳ | High | Stock management |

## 🔍 Common Issues & Solutions:

### Issue: Complex WHERE clauses
```python
# BEFORE:
query = "SELECT * FROM table WHERE org_id = :org_id AND status = :status"

# AFTER:
query = "SELECT * FROM table WHERE status = :status"
# Tenant service adds: WHERE org_id = :_tenant_org_id AND status = :status
```

### Issue: Multiple table joins
```python
# BEFORE:
"""
SELECT * FROM customers c 
JOIN orders o ON c.customer_id = o.customer_id 
WHERE c.org_id = :org_id AND o.org_id = :org_id
"""

# AFTER:
"""
SELECT * FROM customers c 
JOIN orders o ON c.customer_id = o.customer_id
"""
# Tenant service adds org_id filters to BOTH tables automatically
```

### Issue: COUNT queries
```python
# BEFORE:
count_query = "SELECT COUNT(*) FROM table WHERE org_id = :org_id"

# AFTER:
count_query = "SELECT COUNT(*) FROM table"
# Tenant service adds: SELECT COUNT(*) FROM table WHERE org_id = :_tenant_org_id
```

## 🎯 Success Criteria:

For each migrated endpoint:
- [ ] No manual `org_id` parameters in function signature
- [ ] No `WHERE org_id = :org_id` in queries
- [ ] No `{"org_id": org_id}` in parameters
- [ ] Tests pass with automatic filtering
- [ ] API returns same results as before

## 📈 Benefits After Full Migration:

- ✅ **Impossible to forget org_id filtering** - automatic security
- ✅ **Faster development** - no manual filtering needed
- ✅ **Better performance** - optimized query injection
- ✅ **Easier debugging** - clear separation of business vs security logic
- ✅ **Enterprise ready** - scales to hundreds of queries

## 🚀 Next Steps:

1. **Migrate products_consolidated.py** (highest business impact)
2. **Test each endpoint** after migration
3. **Update remaining routes** in priority order
4. **Remove old auth dependencies** once all routes migrated