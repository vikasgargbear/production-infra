# Supabase Connection Pooler Fix

## Problem

**Error**: `FATAL: Tenant or user not found` when connecting to Supabase database

**Root Cause**: Supabase has two connection modes:
1. **Direct Connection** (port 5432) - Session mode
2. **Connection Pooler** (port 6543) - Transaction mode

The error occurs when using the **pooler URL** without the `pgbouncer=true` parameter.

## Solution

### Automatic Fix (Implemented)

The code now automatically detects Supabase URLs and adds `pgbouncer=true`:

```python
# backend/app/core/database.py
if "supabase.com" in DATABASE_URL and "pgbouncer=true" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}pgbouncer=true"
```

### Manual Fix (Railway Environment Variables)

If the automatic fix doesn't work, update the `DATABASE_URL` environment variable in Railway:

**Option 1: Add pgbouncer parameter**
```
Original URL format:
postgresql://[user]:[pass]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres

Fixed - add ?pgbouncer=true at the end:
postgresql://[user]:[pass]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Option 2: Use direct connection (if pooler not needed)**
```
Change port from 6543 (pooler) to 5432 (direct):
postgresql://[user]:[pass]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

**Option 3: Use Supabase direct connection string**
```
Get the direct connection URL from Supabase dashboard:
Settings → Database → Connection string → Direct connection
```

## Supabase Connection Modes Explained

### Transaction Mode (Pooler with pgbouncer=true)
- **Port**: 6543
- **URL**: `*.pooler.supabase.com:6543`
- **Requires**: `?pgbouncer=true` parameter
- **Best for**: Serverless, high-concurrency, short transactions
- **Limitations**: 
  - No prepared statements
  - No LISTEN/NOTIFY
  - No advisory locks

### Session Mode (Direct connection)
- **Port**: 5432 or 6543 without pgbouncer
- **URL**: `*.pooler.supabase.com:5432` or `db.*.supabase.co:5432`
- **Best for**: Long-running queries, full PostgreSQL features
- **Limitations**: 
  - Connection limit (200 connections for Supabase Free tier)

## How to Check Current Configuration

### Railway
1. Go to Railway dashboard
2. Select your project
3. Go to Variables tab
4. Check `DATABASE_URL` value

### Local Development
```bash
echo $DATABASE_URL
```

## Testing the Fix

### 1. Check Logs
After deployment, check Railway logs for:
```
[DATABASE] Supabase pooler detected - added pgbouncer=true parameter
```

### 2. Test Login
```bash
curl -X POST https://your-backend.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "password"}'
```

Should return JWT token, not 500 error.

### 3. Test Any Endpoint
```bash
curl -H "Authorization: Bearer <token>" \
     https://your-backend.railway.app/api/customers
```

## Common Errors and Fixes

### Error: "Tenant or user not found"
**Cause**: Using pooler without `pgbouncer=true`  
**Fix**: Add `?pgbouncer=true` to DATABASE_URL

### Error: "prepared statement already exists"
**Cause**: Using prepared statements with transaction pooler  
**Fix**: Add `?pgbouncer=true` OR switch to direct connection (port 5432)

### Error: "too many connections"
**Cause**: Exceeded Supabase connection limit  
**Fix**: Use transaction pooler (port 6543 with pgbouncer=true)

### Error: "connection timeout"
**Cause**: Network issues or pooler overload  
**Fix**: 
1. Check Supabase dashboard for outages
2. Reduce pool_size in database.py
3. Use direct connection as fallback

## Configuration in Railway

### Setting the DATABASE_URL

1. **Railway Dashboard** → **Your Project** → **Variables**

2. **Add/Update** `DATABASE_URL`:
   ```
   postgresql://[user]:[pass]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

3. **Redeploy** the application

### Recommended Pool Settings for Supabase

Already configured in `backend/app/core/database.py`:
```python
pool_size=2,           # Very small for Supabase limits
max_overflow=3,        # Max 5 total connections
pool_pre_ping=True,    # Check connections before use
pool_recycle=60,       # Recycle every minute
pool_timeout=10        # 10 second timeout
```

## Verification Steps

After deploying the fix:

1. ✅ Check Railway logs for database connection success
2. ✅ Test `/api/auth/login` endpoint
3. ✅ Test any authenticated endpoint
4. ✅ Monitor for "Tenant or user not found" errors (should be gone)

## Rollback Plan

If issues persist:

### Quick Fix: Use Direct Connection
Update DATABASE_URL in Railway to use port 5432:
```
postgresql://[user]:[pass]@db.[project-id].supabase.co:5432/postgres
```

### Alternative: Different Database
If Supabase continues to have issues, consider:
- Railway PostgreSQL (built-in)
- Neon (serverless Postgres)
- PlanetScale (MySQL alternative)

## Related Files Changed

- `backend/app/core/database.py` - Added pgbouncer parameter detection
- `backend/app/api/routes/auth_supabase.py` - Added better error handling

## References

- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [PgBouncer Documentation](https://www.pgbouncer.org/)
- [SQLAlchemy Supabase](https://github.com/supabase-community/supabase-py)

## Status

- ✅ Code fix deployed
- ⏳ Waiting for Railway to apply changes
- 🔜 Need to verify DATABASE_URL in Railway includes `pgbouncer=true`

**Last Updated**: November 30, 2025
