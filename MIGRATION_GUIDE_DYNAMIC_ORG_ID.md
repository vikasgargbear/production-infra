# Migration Guide: From Hardcoded to Dynamic Org ID

## Overview
This guide documents the migration from hardcoded organization IDs to dynamic, authentication-based org_id management in an enterprise multi-tenant SaaS application.

## The Problem
- **Hardcoded org_id**: `ad808530-1ddb-4377-ab20-67bef145d80d` was scattered throughout the codebase
- **Security risk**: Clients could potentially send any org_id they wanted
- **Not enterprise-grade**: Real multi-tenant systems derive org_id from authentication

## The Solution Architecture

### 1. Authentication Flow
```
User Login → JWT Token (contains org_id) → Session Storage → API Requests
```

### 2. How Org ID Flows Through the System

#### Frontend
1. **Login/Setup**: org_id is received from backend and stored in localStorage/sessionStorage
2. **API Calls**: org_id sent as `X-Org-Id` header (temporary until full JWT implementation)
3. **Request Body**: org_id is NEVER sent in request body

#### Backend
1. **Receives Request**: Extracts org_id from header/token
2. **Database Operations**: Uses extracted org_id for all queries/inserts
3. **Multi-tenancy**: Ensures users only see their org's data

## Key Changes Made

### Frontend Changes

#### 1. API Client Configuration (`apiClient.ts`)
```typescript
// BEFORE - Hardcoded fallback
const orgId = sessionStorage.getItem('pharma_org_id') || 'ad808530-1ddb-4377-ab20-67bef145d80d';

// AFTER - No fallback
const orgId = sessionStorage.getItem('pharma_org_id') || localStorage.getItem('pharma_org_id');
if (orgId) {
  config.headers['X-Org-Id'] = orgId;
}
```

#### 2. Customer Creation Forms
```javascript
// BEFORE - Sending org_id in body
const customerData = {
  org_id: localStorage.getItem('org_id') || 'ad808530-1ddb-4377-ab20-67bef145d80d',
  customer_name: formData.customer_name,
  ...
}

// AFTER - No org_id in body
const customerData = {
  // org_id comes from auth token, not request body
  customer_name: formData.customer_name,
  ...
}
```

### Backend Changes

#### 1. Schema Changes (`customer.py`)
```python
# BEFORE
class CustomerCreate(CustomerBase):
    org_id: UUID = Field(..., description="Organization ID")

# AFTER
class CustomerCreate(CustomerBase):
    # org_id removed - comes from authentication
    pass
```

#### 2. Route Changes (`customers.py`)
```python
# Backend extracts org_id from header
@router.post("/")
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_header)  # Gets from header/token
):
    # Use org_id for database insert
    mapped_data = {
        "org_id": org_id,  # From auth, not request body
        "customer_name": customer_data.get("customer_name"),
        ...
    }
```

#### 3. Auth Utils (`auth_utils.py`)
```python
# Enterprise-grade function to extract org_id from JWT
def get_org_id_from_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Extract organization ID from JWT token"""
    token = credentials.credentials
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    org_id = payload.get("org_id")
    return org_id

# Temporary backward compatibility
def get_org_id_from_header(x_org_id: Optional[str] = Header(None, alias="X-Org-Id")) -> str:
    """Get organization ID from request header"""
    if not x_org_id:
        raise HTTPException(status_code=400, detail="Organization ID required")
    return x_org_id
```

## Common Issues and Solutions

### Issue 1: 307 Redirect with CORS Failure
**Symptom**: `POST /api/customers` redirects to `/api/customers/` causing CORS preflight failure

**Solution**: 
```python
# In main.py
app.router.redirect_slashes = False  # Disable automatic trailing slash redirects
```

### Issue 2: 422 Validation Error
**Symptom**: "Field required" error when creating customers

**Causes**:
1. Frontend sending org_id in body but backend doesn't expect it
2. Missing required fields (credit_rating, payment_terms)
3. Field name mismatches (email vs primary_email)

**Solution**: Ensure schema matches between frontend and backend

### Issue 3: Missing Org ID in Frontend
**Symptom**: API calls fail with "Organization ID required"

**Solution**: Ensure org_id is set during:
1. Initial setup (`InitialSetup.js`)
2. User login (`auth.js`)

```javascript
// Store org_id after login
if (organization?.org_id) {
  localStorage.setItem('pharma_org_id', organization.org_id);
  sessionStorage.setItem('pharma_org_id', organization.org_id);
}
```

## Database Impact

### Important: Org ID is Still Saved!
Customers ARE still linked to organizations in the database:

```sql
INSERT INTO parties.customers (
    org_id,  -- Still saved, just comes from auth
    customer_name,
    ...
) VALUES (
    :org_id,  -- From header/token, not request body
    :customer_name,
    ...
)
```

## Testing the Migration

### 1. Check Storage
```javascript
// In browser console
localStorage.getItem('pharma_org_id')  // Should show your org_id
sessionStorage.getItem('pharma_org_id')  // Should show your org_id
```

### 2. Verify Headers
In Network tab, check that requests include:
- `Authorization: Bearer <token>`
- `X-Org-Id: <your-org-id>`

### 3. Test Customer Creation
1. Login to get JWT token
2. Create a customer
3. Verify customer is linked to correct org_id in database

## Future Improvements

### Phase 1 (Current - Temporary)
- Using `X-Org-Id` header
- Backend validates but doesn't enforce from JWT

### Phase 2 (TODO)
- Migrate all endpoints to use `get_org_id_from_token`
- Remove `get_org_id_from_header` 
- org_id comes ONLY from JWT token

### Phase 3 (Enterprise)
- Implement refresh tokens
- Add org switching for users with multiple orgs
- Implement row-level security in database

## Common Issues After Migration

### Orders/Challans Failing
**Problem**: Orders endpoint returns 404 "Customer not found"
**Cause**: 
- Frontend sends hardcoded org_id in request body
- Backend uses different org_id from token/header
- Customer exists for one org_id but not the other

**Solution**:
1. Remove org_id from frontend request body
2. Make org_id optional in OrderCreate schema
3. Use org_id from token in backend: `get_org_id_from_token`
4. Ensure X-Org-Id header matches customer's org_id

### Invoice Creation Issues
**Problem**: Invoice saves fail with foreign key violations
**Cause**: Product/Customer IDs don't exist for the org_id being used

**Solution**:
1. Use consistent org_id: `e78d6777-35f6-4b19-994f-caaede2f021a`
2. Ensure test data exists for this org_id
3. Check X-Org-Id header in requests

## Key Takeaways

1. **Never trust client-provided org_id** - Always derive from authentication
2. **URL trailing slashes matter** - FastAPI redirects can break CORS
3. **Schema alignment is critical** - Frontend and backend must match exactly
4. **Test with real org_id** - Not hardcoded test values
5. **Multi-tenancy is about security** - Not just data separation
6. **Schemas should not require org_id** - Backend gets it from token

## Debugging Checklist

When customer creation fails:

- [ ] Check browser console for CORS errors
- [ ] Verify org_id exists in localStorage/sessionStorage
- [ ] Check Network tab for 307 redirects
- [ ] Verify request body doesn't contain org_id
- [ ] Check backend logs for validation errors
- [ ] Ensure all required fields are sent
- [ ] Verify field names match schema exactly
- [ ] Check that auth token is being sent

## Files Modified in Migration

### Frontend
- `/frontend/src/services/api/apiClient.ts`
- `/frontend/src/services/api/apiClientExports.js`
- `/frontend/src/components/global/ui/forms/CustomerCreationB2B.js`
- `/frontend/src/components/global/ui/forms/CustomerCreationB2C.js`
- `/frontend/src/components/Orders.tsx`
- `/frontend/src/services/auth.js`
- `/frontend/src/config/api.config.ts`

### Backend
- `/backend/app/api/schemas/customer.py`
- `/backend/app/api/routes/customers.py`
- `/backend/app/core/auth_utils.py`
- `/backend/app/main.py`
- `/backend/app/api/routes/invoices.py`
- `/backend/app/api/routes/purchases.py`
- `/backend/app/api/routes/orders.py` - Updated to use get_org_id_from_token
- `/backend/app/api/schemas/order.py` - NEEDS FIX: Remove required org_id from OrderCreate

## References
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- Multi-tenant Architecture: https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview
- FastAPI Security: https://fastapi.tiangolo.com/tutorial/security/