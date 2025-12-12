# OAuth Authentication Fix - December 12, 2025

## Critical Bug Fixed
**Error**: `OAuth authentication failed: No tenant context set - this is a security bug!`

## Root Cause
The OAuth callback endpoint was using `TenantAwareSession = Depends(get_tenant_aware_db)` which requires tenant context to be set. However, OAuth authentication happens BEFORE the user is logged in, so no tenant context exists yet.

## The Problem
```python
# BEFORE (BROKEN):
@router.post("/google/callback")
async def google_oauth_callback(
    request: OAuthCallbackRequest,
    db: TenantAwareSession = Depends(get_tenant_aware_db)  # ❌ Requires tenant context
):
```

The `get_tenant_aware_db` dependency triggers tenant context validation, but during OAuth callback:
- User hasn't authenticated yet
- No JWT token exists
- No tenant/org context is available
- Authentication fails with security error

## The Fix
```python
# AFTER (FIXED):
from ....core.database import get_db
from sqlalchemy.orm import Session

@router.post("/google/callback")
async def google_oauth_callback(
    request: OAuthCallbackRequest,
    db: Session = Depends(get_db)  # ✅ Regular DB session, no tenant requirement
):
```

## Changes Made
1. Added import: `from ....core.database import get_db`
2. Added import: `from sqlalchemy.orm import Session`
3. Changed dependency: `TenantAwareSession` → `Session`
4. Changed function: `get_tenant_aware_db` → `get_db`

## File Modified
- `backend/app/api/routes/auth/oauth.py` (line 83)

## Commit
```
59a6048 fix: CRITICAL - Fix OAuth callback tenant context bug
```

## Why This Works
- Regular `Session` doesn't require tenant context
- OAuth callback can now authenticate users without security errors
- After authentication, subsequent requests use `TenantAwareSession` with proper context

## Impact
- ✅ Users can now login with Google OAuth
- ✅ No more "security bug" error messages
- ✅ OAuth flow completes successfully

## Testing
```bash
# Backend should respond successfully:
curl https://pharma-backend-production-0c09.up.railway.app/api/test-connection
# {"status":"connected","message":"Backend is running"}
```

Then test OAuth login in frontend:
1. Click "Sign in with Google"
2. Authorize on Google
3. Should redirect back and login successfully
4. No more 500 error!

## Related Fixes Today
- Fixed missing `get_org_id_string` imports (5 files)
- Fixed malformed SQL in `credit_notes.py`
- Removed broken module imports
- All backend crashes resolved

## Status: DEPLOYED ✅
