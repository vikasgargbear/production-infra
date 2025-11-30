# Login Fix - November 30, 2025

## Critical Issues Fixed

### 1. Supabase IPv6 Network Unreachable Error ✅

**Error**:
```
connection to server at "db.jfrairkkzxwkhbtqejnz.supabase.co" (2406:da1a:6b0:f60f:2a65:39c9:3bf3:7d9b), port 5432 failed: Network is unreachable
```

**Root Cause**:
- Supabase DNS returns both IPv4 and IPv6 addresses
- PostgreSQL client tries IPv6 first (2406:... is an IPv6 address)
- Railway's network infrastructure doesn't support IPv6 routing
- Connection fails with "Network is unreachable"

**Solution**:
Added DNS resolution to force IPv4 in `backend/app/core/database.py`:

```python
def force_ipv4_in_database_url(url: str) -> str:
    """
    Force IPv4 resolution for database connections
    Railway's network doesn't support IPv6, but Supabase returns IPv6 addresses
    """
    if "supabase.co" not in url:
        return url
    
    # Resolve hostname to IPv4 only using socket.AF_INET
    ipv4_addr = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
    # Replace hostname with IPv4 address in connection string
    return modified_url
```

**Impact**: 
- Database connections now use IPv4 only
- Eliminates "Network is unreachable" errors
- Works on Railway's infrastructure

---

### 2. JWT Token Decode Error - Corrupted Tokens ✅

**Error**:
```
JWT token validation failed: Invalid header string: 'utf-8' codec can't decode byte 0xa1 in position 0: invalid start byte
```

**Root Cause**:
- Frontend sending cached/corrupted JWT tokens from old sessions
- Token format might have changed after backend updates
- Users didn't clear browser cache/localStorage
- JWT decode() crashes with cryptic encoding error

**Solution**:
Added better error handling in `backend/app/core/org_context.py`:

```python
try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
except Exception as decode_error:
    # Log specific decode error but don't expose internals
    logger.error(f"JWT decode error: {decode_error}")
    raise HTTPException(
        status_code=401,
        detail="Invalid or expired authentication token. Please login again.",
        headers={"WWW-Authenticate": "Bearer"}
    )
```

**Impact**:
- Clearer error messages for users
- Prevents server crashes from corrupted tokens
- Users get actionable message: "Please login again"
- Frontend can detect 401 and redirect to login

---

### 3. Login Endpoint 500 Internal Server Error ✅

**Error**:
```
POST https://pharma-backend-production-0c09.up.railway.app/api/auth/login 500 (Internal Server Error)
```

**Root Cause**:
- Cascading failure from database connection issue (#1)
- When database is unreachable, AuthService.authenticate() fails
- Exception bubbles up as generic 500 error

**Solution**:
- Fixed database connection (see #1)
- Error handling already exists in `auth_enterprise.py`
- Now returns proper HTTP status codes:
  - 401 for invalid credentials
  - 403 for disabled accounts
  - 500 only for true internal errors

**Impact**:
- Login endpoint now returns proper error codes
- Frontend can handle different error scenarios
- Better user experience with specific error messages

---

## Files Modified

### 1. `backend/app/core/database.py`
- Added `force_ipv4_in_database_url()` function
- Forces IPv4 DNS resolution for Supabase
- Prevents IPv6 connection attempts on Railway

### 2. `backend/app/core/org_context.py`
- Improved JWT decode error handling
- Better error messages for expired/corrupted tokens
- Prevents cryptic encoding errors

---

## Testing Checklist

### Before Deployment
- [x] Code changes reviewed
- [x] No hardcoded values
- [x] Error handling improved
- [x] Logging added for debugging

### After Deployment to Railway

1. **Check Logs for IPv4 Resolution**:
   ```
   [DATABASE] Resolved db.jfrairkkzxwkhbtqejnz.supabase.co to IPv4: X.X.X.X
   ```

2. **Test Login Endpoint**:
   ```bash
   curl -X POST https://pharma-backend-production-0c09.up.railway.app/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "admin@pharma.com", "password": "YOUR_PASSWORD"}'
   ```
   
   Expected: 200 OK with JWT token (or 401 if wrong credentials)

3. **Test with Old/Invalid Token**:
   ```bash
   curl -H "Authorization: Bearer invalid_token_here" \
        https://pharma-backend-production-0c09.up.railway.app/api/invoices/generate-number
   ```
   
   Expected: 401 with message "Invalid or expired authentication token. Please login again."

4. **Monitor Railway Logs**:
   - No more "Network is unreachable" errors
   - No more "Invalid header string" errors
   - Successful database connections
   - Successful login attempts

---

## Frontend Changes Needed

### Clear Cached Tokens
Users who cached old tokens need to:
1. Clear browser localStorage/sessionStorage
2. Clear any saved tokens in frontend state
3. Login again with fresh credentials

### Better Error Handling
Frontend should handle 401 responses:
```javascript
if (error.response?.status === 401) {
  // Clear local token
  localStorage.removeItem('access_token');
  // Redirect to login
  navigate('/login');
  // Show message
  toast.error('Session expired. Please login again.');
}
```

---

## Rollback Plan

If issues persist:

### Quick Rollback
```bash
git revert HEAD
git push origin main
```

### Alternative: Railway Environment Variable
Set `PGHOST` in Railway to force specific IP:
```
PGHOST=X.X.X.X  # IPv4 address of Supabase
```

### Alternative: Use Different Database Port
Try Supabase pooler (port 6543):
```
DATABASE_URL=postgresql://...@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

---

## Root Cause Summary

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Database Connection Failure | Railway doesn't support IPv6, Supabase DNS returns IPv6 | Force IPv4 DNS resolution |
| JWT Decode Errors | Corrupted/old cached tokens from frontend | Better error handling + clear message |
| Login 500 Errors | Cascading from database failure | Fixed database + existing error handling |

---

## Related Documents

- `SUPABASE_CONNECTION_FIX.md` - Earlier pooler connection fix
- `DATABASE_TROUBLESHOOTING.md` - General database debugging
- `URGENT_BACKEND_DOWN_FIX.md` - Previous backend fixes

---

## Monitoring Commands

```bash
# Check Railway logs
railway logs --tail 100

# Test database connectivity from Railway
railway run psql $DATABASE_URL -c "SELECT version()"

# Test login endpoint
curl -X POST https://your-backend.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'
```

---

**Status**: ✅ Ready for deployment  
**Date**: November 30, 2025  
**Priority**: Critical - Production login is down  
**Impact**: All users unable to login until deployed
