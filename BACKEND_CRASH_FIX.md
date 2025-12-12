# Backend Crash Fix - December 12, 2025

## Issue
Backend was crashing on Railway with:
```
NameError: name 'get_org_id_string' is not defined
```

## Root Cause
Multiple files were using `Depends(get_org_id_string)` but didn't import the function from `core.jwt_auth`.

## Files Fixed

### Commit 1: `2bae503`
Added missing imports to:
1. `backend/app/api/routes/compliance/compliance.py`
2. `backend/app/api/routes/schemes_discounts.py`
3. `backend/app/api/routes/loyalty_points.py`
4. `backend/app/api/routes/org/company.py`

### Commit 2: `11bc49c`
Added missing import to:
5. `backend/app/api/routes/finance/credit_notes.py`

## Fix Applied
Added this line to all affected files:
```python
from ....core.jwt_auth import get_org_id_string
```

## Status
- ✅ All imports fixed
- ✅ Pushed to Railway
- ⏳ Deployment in progress (~2-3 minutes)

## Test After Deployment
```bash
curl -I "https://pharma-backend-production-0c09.up.railway.app/"
```
Should return: HTTP/2 200 or 404 (both mean backend is running)

## Related Issues Fixed Earlier
- Removed broken imports (conversions, api_wrapper, enterprise_api_complete)
- Removed unused imports (direct_sales, quick_sale)
