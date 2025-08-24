# Migration Plan: From Header-based to JWT Token-based Authentication

## Current State (INSECURE)
All endpoints currently use `get_org_id_from_header` which allows clients to send any org_id they want.

## Target State (SECURE - ENTERPRISE)
All endpoints should use `get_org_id_from_token` which extracts org_id from the authenticated JWT token.

## Migration Steps

### Phase 1: Update Import Statements
Replace in all route files:
```python
# OLD
from ...core.auth_utils import get_org_id_from_header

# NEW
from ...core.auth_utils import get_org_id_from_token
```

### Phase 2: Update Function Parameters
Replace in all endpoint definitions:
```python
# OLD
@router.get("/endpoint")
async def endpoint_name(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)
):

# NEW
@router.get("/endpoint")
async def endpoint_name(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
):
```

### Phase 3: Files to Migrate (56 files)
- [ ] app/api/routes/metadata.py
- [ ] app/api/routes/customers.py
- [ ] app/api/routes/products_consolidated.py
- [ ] app/api/routes/sales_orders.py
- [ ] app/api/routes/invoices.py
- [ ] app/api/routes/delivery_challan.py
- [ ] app/api/routes/inventory.py
- [ ] app/api/routes/purchase_enhanced.py
- [ ] app/api/routes/suppliers.py
- [ ] app/api/routes/dashboard.py
- [ ] app/api/routes/payments.py
... (and 45 more)

### Phase 4: Frontend Cleanup
Once all backend endpoints are migrated:
1. Remove X-Org-Id header from apiClient.ts
2. Remove pharma_org_id from localStorage/sessionStorage
3. Test all functionality

## Benefits
1. **Security**: Users can only access their own organization's data
2. **Simplicity**: No need to manage org_id on client side
3. **Enterprise-grade**: This is how real multi-tenant SaaS applications work
4. **Audit Trail**: Every request is tied to authenticated user and their org

## Testing
After migration, test:
1. User can only see their own org's data
2. Switching orgs requires new login
3. No org_id manipulation possible from frontend