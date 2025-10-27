# Systematic API Fix - Root Cause Analysis

## The Real Problem

**Database uses UUID for org_id, but something is sending integer "1"**

### Evidence:
```
Error: invalid input syntax for type uuid: "1"
```

### What Should Happen:

1. **Login** → JWT contains: `org_id: "e78d6777-35f6-4b19-994f-caaede2f021a"` (UUID)
2. **AuthContext** → Decodes JWT, stores in localStorage as:
   ```json
   {
     "user_id": 8,
     "email": "admin@pharma.com",
     "org_id": "e78d6777-35f6-4b19-994f-caaede2f021a",
     "role_id": 1,
     "branch_id": 5
   }
   ```
3. **API Interceptor** → Reads from localStorage, adds header:
   ```
   X-Org-Id: e78d6777-35f6-4b19-994f-caaede2f021a
   ```
4. **Backend** → Receives UUID, queries database successfully

### What's Currently Happening:

- Something is sending `X-Org-Id: 1` instead of the UUID
- This causes ALL master data endpoints to fail (employees, departments, branches)

## API Status Breakdown

### ✅ Working (200):
- `GET /api/inventory/batches` - Works!

### ❌ UUID Error (500):
- `GET /api/employees/` - org_id="1" instead of UUID
- `GET /api/departments/` - org_id="1" instead of UUID  
- `GET /api/branches/` - org_id="1" instead of UUID

### ❌ Method Not Allowed (405):
- `GET /api/customers` (without trailing slash)
- `GET /api/orders` (without trailing slash)
- `GET /api/invoices` (without trailing slash)
- `POST /api/delivery-challan/`
- Many others

**Fix:** Frontend should use trailing slashes or backend should handle both

### ❌ Unauthorized (401):
- `POST /api/orders/`
- `GET /api/products/search`
- Others

**Fix:** Not sending Authorization header or X-Org-Id

### ❌ Bad Request (400):
- `POST /api/stock-movements/receive`

**Fix:** Missing required parameters

### ❌ Validation Error (422):
- `POST /api/customers/`

**Fix:** Invalid data format

## Fix Priority

### Priority 1: Get Login Working ✅
- [x] Login endpoint works
- [x] JWT returned with proper UUID org_id
- [x] AuthContext exists

### Priority 2: Fix org_id Transmission (CRITICAL)
- [ ] Verify localStorage has correct UUID after login
- [ ] Verify interceptor reads correct UUID
- [ ] Verify X-Org-Id header contains UUID not "1"
- [ ] Test employees/departments/branches endpoints

### Priority 3: Fix 405 Errors
- [ ] Add trailing slash to frontend API calls
- [ ] Or make backend accept both with/without trailing slash

### Priority 4: Fix 401 Errors
- [ ] Ensure all API calls include Authorization header
- [ ] Ensure all API calls include X-Org-Id header

## Testing Plan

### Test 1: Login and Check localStorage
```javascript
// After login, check browser console:
const user = JSON.parse(localStorage.getItem('pharma_user'));
console.log('org_id type:', typeof user.org_id); // Should be "string"
console.log('org_id value:', user.org_id); // Should be UUID like "e78d6777-..."
console.log('org_id length:', user.org_id.length); // Should be 36 (UUID format)
```

### Test 2: Check API Request Headers
```javascript
// In browser DevTools → Network tab
// Click any API request
// Check Request Headers:
// Should have:
Authorization: Bearer eyJ...
X-Org-Id: e78d6777-35f6-4b19-994f-caaede2f021a (UUID, not "1")
```

### Test 3: Direct API Test with UUID
```bash
# This should work:
curl -H "X-Org-Id: e78d6777-35f6-4b19-994f-caaede2f021a" \
  https://pharma-backend-production-0c09.up.railway.app/api/employees/

# This should fail:
curl -H "X-Org-Id: 1" \
  https://pharma-backend-production-0c09.up.railway.app/api/employees/
```

## Most Likely Causes

1. **Old cached data in localStorage**
   - Solution: Clear localStorage and login again

2. **Hardcoded org_id somewhere**
   - Check for any `org_id: 1` or `X-Org-Id: 1` in frontend code
   - Grep for it

3. **Wrong parsing of JWT**
   - AuthContext might be storing wrong value
   - Check the decodeToken function

4. **Interceptor not reading from correct place**
   - Check apiClient.ts interceptor
   - Make sure it reads from localStorage correctly

## Quick Fix to Test

**In browser console after login:**
```javascript
// Manually set correct org_id
const user = JSON.parse(localStorage.getItem('pharma_user'));
user.org_id = "e78d6777-35f6-4b19-994f-caaede2f021a";
localStorage.setItem('pharma_user', JSON.stringify(user));

// Reload page
location.reload();

// Now test if employees load
```

If this works, we know the issue is in how org_id is being stored during login.

## Expected Flow After Fix

1. User visits app
2. Sees login page
3. Enters credentials
4. Login succeeds
5. JWT decoded → org_id (UUID) stored in localStorage
6. Main app loads
7. Navigate to Employee Management
8. API call: `GET /api/employees/` with header `X-Org-Id: <UUID>`
9. Backend returns employees
10. ✅ Everything works

## Current State

- ❌ APIs return 502/405/401 errors
- ❌ org_id being sent as "1" instead of UUID
- ❌ Cannot load employees, departments, branches
- ✅ Login works and returns proper JWT
- ✅ Backend is UP and healthy

## Next Steps

1. Hard refresh browser
2. Clear localStorage: `localStorage.clear()`
3. Login again
4. Check localStorage has UUID
5. Check Network tab has UUID in headers
6. Test employee endpoint
7. If still fails, debug interceptor
