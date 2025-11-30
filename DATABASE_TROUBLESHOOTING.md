# Database Connection Troubleshooting Guide

## Current Issue Summary

### Symptoms
1. ❌ Login returns 500 Internal Server Error
2. ❌ Invoice page redirects to login page
3. ❌ Database connection errors in logs

### Timeline
1. **Security fixes deployed** - JWT-only authentication (working)
2. **First attempt**: Added invalid `pgbouncer=true` parameter → Failed
3. **Current fix**: Removed invalid parameter, optimized pool settings

---

## Understanding the Problem

### The Invoice → Login Redirect Issue

This is a **cascade failure**:

```
1. Database connection broken
   ↓
2. Login endpoint fails (500 error)
   ↓
3. No JWT token issued to user
   ↓
4. User tries to access /invoices
   ↓
5. Frontend checks: "Do I have a valid JWT?"
   ↓
6. Answer: NO (because login failed)
   ↓
7. Frontend redirects to /login
   ↓
8. Login still broken → LOOP
```

**Fix**: Once database connection works → Login works → JWT issued → Invoice page loads

---

## Supabase Connection Modes

Supabase offers two connection types:

### 1. Transaction Pooler (Port 6543)
**URL Format**: `postgresql://...@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`

**Pros**:
- Handles high concurrency
- Better for serverless
- Auto-scales connections

**Cons**:
- Sometimes unstable
- Connection mode mismatches
- Requires aggressive pool recycling

**Current Code**: Detects port 6543, uses aggressive settings

### 2. Direct Connection (Port 5432)
**URL Format**: `postgresql://...@db.PROJECT-ID.supabase.co:5432/postgres`

**Pros**:
- More stable
- Full PostgreSQL features
- Simpler connection management

**Cons**:
- Connection limit (200 for free tier)
- Less scalable

**Recommendation**: **Use this if pooler keeps failing**

---

## How to Fix in Railway

### Option 1: Switch to Direct Connection (RECOMMENDED)

1. **Go to Supabase Dashboard**:
   - Your Project → Settings → Database
   - Find "Connection string"
   - Copy the **"Direct connection"** string (port 5432)

2. **Update Railway**:
   - Railway Dashboard → Your Project → Variables
   - Find `DATABASE_URL`
   - Replace with the direct connection URL
   - Click "Redeploy"

3. **Verify**: Port should be `:5432` not `:6543`

### Option 2: Keep Pooler (Already Deployed)

The code now handles pooler mode correctly:
- Detects port 6543
- Uses minimal pool (1 connection)
- Aggressive recycling (30 seconds)
- Proper timeouts

**Wait 2-3 minutes for Railway to deploy, then test**

---

## Testing Steps

### 1. Check Railway Logs

Look for:
```
[DATABASE] Supabase Transaction Pooler detected (port 6543)
[DATABASE] Using aggressive connection recycling for pooler mode
```

OR

```
(No message = using direct connection)
```

### 2. Test Login API

```bash
curl -X POST https://your-backend.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

**Expected**: JSON with `access_token`  
**If Still 500**: Check error message, proceed to troubleshooting

### 3. Test Invoice Page

1. Login successfully
2. Navigate to Sales → Invoices
3. Should load invoice page (not redirect to login)

---

## Common Errors & Solutions

### Error: "invalid connection option 'pgbouncer'"
✅ **FIXED** - Removed in latest deployment

### Error: "Tenant or user not found"
**Cause**: Pooler mode mismatch  
**Fix**: Switch to direct connection (port 5432)

### Error: "too many connections"
**Cause**: Exceeded Supabase connection limit  
**Fix**: 
1. Code already uses minimal pool (1-3 connections)
2. If persists, switch to direct connection
3. Check for connection leaks in code

### Error: "timeout"
**Cause**: Network issues or database overload  
**Fix**:
1. Check Supabase status page
2. Try direct connection
3. Increase timeouts in code (if needed)

### Error: "SSL connection required"
**Cause**: Missing `?sslmode=require` in URL  
**Fix**: Add to DATABASE_URL: `...postgres?sslmode=require`

---

## Railway Environment Variables

### What You Need

**Minimum**:
- `DATABASE_URL` - PostgreSQL connection string

**Recommended**:
- `JWT_SECRET_KEY` - For token signing
- `SUPABASE_URL` - (Optional) For Supabase Auth
- `SUPABASE_ANON_KEY` - (Optional) For Supabase Auth

### How to Check/Update

1. Railway Dashboard → Project → Variables tab
2. Look for `DATABASE_URL`
3. Check if it contains:
   - `supabase.com` - Yes? Using Supabase
   - `:6543` - Yes? Using pooler
   - `:5432` - Yes? Using direct connection

---

## Detailed Connection Settings

### Current Code Behavior

**If Pooler Detected (port 6543)**:
```python
pool_size = 1              # One connection in pool
max_overflow = 2           # Max 3 total (1 + 2)
pool_recycle = 30          # Recycle every 30 seconds
pool_timeout = 5           # Wait max 5 seconds
connect_timeout = 10       # Database connect timeout
statement_timeout = 30000  # 30 second query limit
```

**If Direct Connection (port 5432 or local)**:
```python
pool_size = 5              # Five connections in pool
max_overflow = 10          # Max 15 total (5 + 10)
pool_recycle = 3600        # Recycle every hour
pool_timeout = 30          # Wait max 30 seconds
```

---

## Decision Tree

```
Is login working?
├─ YES → Great! Issue resolved
└─ NO → Continue

Check Railway logs for errors:
├─ "invalid connection option" → ✅ Fixed in latest deploy
├─ "Tenant or user not found" → Switch to direct connection
├─ "timeout" → Check Supabase status, try direct connection
└─ Other error → Check specific error below

Still broken after 5 minutes?
└─ Switch to direct connection (port 5432) - most reliable option
```

---

## Ultimate Fix: Switch to Direct Connection

### Step-by-Step Guide

1. **Get Direct Connection URL**:
   - Supabase Dashboard
   - Settings → Database
   - "Connection string" section
   - Select "Direct connection"
   - Copy the full URL (includes password)

2. **Update Railway**:
   - Railway Dashboard
   - Your project
   - Variables tab
   - Find `DATABASE_URL`
   - Click Edit
   - Paste the direct connection URL
   - **Important**: Make sure it has port `:5432`
   - Save

3. **Redeploy**:
   - Railway will auto-redeploy
   - Wait 2-3 minutes
   - Check logs for successful startup

4. **Test**:
   - Try login again
   - Should work now!

---

## What Changed Today

### Security Improvements ✅
- JWT-only authentication (no more X-Org-Id header bypass)
- Thread-safe tenant context
- 53 API endpoints secured

### Database Issues ❌→✅
- First attempt: Added invalid parameter (failed)
- Second attempt: Removed invalid parameter, optimized settings (deployed)
- Final solution (if needed): Switch to direct connection

---

## Monitoring & Prevention

### Check These Regularly

1. **Railway Logs**: Look for database errors
2. **Response Times**: Should be < 1 second for login
3. **Error Rate**: Should be near 0%
4. **Connection Pool**: Should not exceed 3-5 connections

### Future Improvements

1. **Add Health Check Endpoint**:
   ```python
   @app.get("/health/database")
   def check_database():
       try:
           db.execute("SELECT 1")
           return {"status": "healthy"}
       except:
           return {"status": "unhealthy"}, 500
   ```

2. **Add Connection Pool Monitoring**:
   - Log pool size periodically
   - Alert if connections maxed out

3. **Consider Alternative**:
   - Railway PostgreSQL (built-in, simpler)
   - Neon (serverless Postgres)
   - If Supabase continues having issues

---

## Current Status

- ✅ Security fixes deployed and working
- ⏳ Database connection fix deployed (waiting for Railway)
- 🔜 Test login in 2-3 minutes
- ❓ May need to switch to direct connection

## Next Steps

1. **Wait 2-3 minutes** for Railway to finish deploying
2. **Test login** - try the login page
3. **If still broken**: Follow "Ultimate Fix" section above
4. **Report results**: Let me know what happens!

---

**Last Updated**: November 30, 2025  
**Status**: Hotfix deployed, awaiting test results
