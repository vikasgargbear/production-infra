# Critical Security Fix Plan - Multi-Tenant Isolation

## Current Security Vulnerability

**CRITICAL**: The system allows org_id to be passed via `X-Org-Id` header, which can be forged by any user to access other organizations' data.

## Proper SaaS Security Architecture

### 1. JWT Token ONLY (No Header Fallback)
- ✅ org_id embedded in JWT during login (already done)
- ❌ Remove X-Org-Id header fallback (MUST FIX)
- ✅ All endpoints must validate JWT token

### 2. Implementation Changes Needed

#### A. Update `org_context.py` - Remove Dangerous Fallback

```python
async def get_org_context(
    credentials: HTTPAuthorizationCredentials = Depends(security)  # Make required
) -> OrgContext:
    """Get organization context from JWT token ONLY"""
    
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide Bearer token."
        )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        org_id_str = payload.get("org_id")
        user_id_value = payload.get("user_id")
        
        if not org_id_str:
            raise HTTPException(status_code=401, detail="Invalid token: missing org_id")
        
        org_id = UUID(org_id_str)
        user_id = user_id_value  # Keep as-is
        
        return OrgContext(org_id, user_id)
        
    except (JWTError, ValueError) as e:
        logger.error(f"JWT token validation failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )
```

#### B. Remove `get_org_id_from_header()` - This is Dangerous

Replace all usages of `get_org_id_from_header()` with:
```python
context: OrgContext = Depends(get_org_context)
# Then use: context.org_id
```

#### C. Update All Endpoints

Before:
```python
@router.get("/products")
async def list_products(
    org_id: str = Depends(get_org_id_from_header)  # ❌ Dangerous
):
```

After:
```python
@router.get("/products")
async def list_products(
    context: OrgContext = Depends(get_org_context)  # ✅ Secure
):
    org_id = context.org_id
```

### 3. Flow Diagram

```
User Login
    ↓
[Database] → Verify credentials + Get user's org_id
    ↓
Create JWT with org_id embedded
    ↓
Return JWT to client
    ↓
Client stores JWT (localStorage/cookie)
    ↓
Every API Request:
    ↓
Bearer Token: eyJhbGc... (contains org_id)
    ↓
[Backend] → Decode JWT → Extract org_id
    ↓
[Tenant Service] → Automatically filter by org_id
    ↓
Return ONLY that org's data
```

### 4. Testing the Fix

```bash
# ❌ This should FAIL after fix (currently works - security hole!)
curl -H "X-Org-Id: any-uuid" http://api/products

# ✅ This should WORK (proper authentication)
curl -H "Authorization: Bearer eyJhbGc..." http://api/products
```

### 5. Migration Steps

1. ✅ Login already embeds org_id in JWT (done)
2. ⚠️ Remove X-Org-Id header fallback from `get_org_context()`
3. ⚠️ Replace all `get_org_id_from_header()` with `get_org_context()`
4. ⚠️ Update frontend to always send Bearer token
5. ✅ Deploy and test

## Impact Assessment

**Breaking Change**: Yes, if any clients are using X-Org-Id header without JWT token

**Fix Required**: Update mobile/web apps to:
1. Store JWT token after login
2. Send `Authorization: Bearer <token>` header on every request
3. Remove any hardcoded `X-Org-Id` headers

## Priority: 🔴 CRITICAL

This is a **data breach risk**. Any authenticated user can currently access other organizations' data by changing the X-Org-Id header.
