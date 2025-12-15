# Debug Guide: Empty IndexedDB

## Problem
IndexedDB (PharmaERPOfflineV2) is empty - no data synced after login.

## Diagnostic Steps

### Step 1: Check if sync is being triggered
Open browser console after login and look for:

```
✅ Expected:
[DataSync] Starting full data sync...
[DataSync] Received: {products: X, batches: Y, customers: Z}
[DataSync] Stored X products
[DataSync] Stored Y batches
[DataSync] Full sync completed successfully

❌ Not seeing these? Sync is not being called.
```

### Step 2: Check for errors
Look for these error patterns:

```javascript
// Auth error (not logged in)
[Auth] Offline sync failed (will retry later): 401 Unauthorized

// Network error
[DataSync] Full sync failed: Network Error

// Backend error
[DataSync] Full sync failed: 500 Internal Server Error

// CORS error
Access to fetch at '.../api/sync/full-data' has been blocked by CORS
```

### Step 3: Manually trigger sync
Open browser console and run:

```javascript
// Test if sync service is available
await window.dataSyncService.fullSync()

// Expected success:
{
  success: true,
  counts: {
    products: 150,
    batches: 450,
    customers: 89,
    employees: 5
  }
}

// If error - check the error message
```

### Step 4: Check IndexedDB manually
1. Open DevTools → Application → IndexedDB
2. Look for database: `PharmaERPOfflineV2`
3. Check these stores:
   - `products` - Should have entries
   - `batches` - Should have entries
   - `customers` - Should have entries
   - `employees` - Should have entries
   - `sync_stats` - Should have `current` key with timestamp

### Step 5: Check if backend endpoint works
Test the backend directly:

```bash
# Replace with your auth token
curl https://pharma-backend-production-0c09.up.railway.app/api/sync/full-data \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "x-org-id: YOUR_ORG_ID"

# Should return:
{
  "products": [...],
  "batches": [...],
  "customers": [...],
  "employees": [...],
  "counts": {...}
}
```

## Common Issues & Solutions

### Issue 1: Sync not triggered (most common)
**Symptom:** No console logs from dataSyncService  
**Cause:** User not fully logged in, or AuthContext not calling sync  
**Fix:** Check AuthContext.js line 289 - ensure syncWithProgress() is called

### Issue 2: 401 Unauthorized
**Symptom:** `[DataSync] Full sync failed: 401`  
**Cause:** No auth token sent with request  
**Fix:** Check if apiClient includes Authorization header

### Issue 3: CORS error on /api/sync/full-data
**Symptom:** CORS policy blocked the request  
**Cause:** Backend CORS not configured for sync endpoint  
**Fix:** Restart backend after removing OPTIONS handler (already fixed)

### Issue 4: Backend returns empty data
**Symptom:** `counts: {products: 0, batches: 0, ...}`  
**Cause:** Database is actually empty OR org_id filter returns no results  
**Fix:** Check if data exists in database for the org_id

### Issue 5: IndexedDB quota exceeded
**Symptom:** `QuotaExceededError: The quota has been exceeded`  
**Cause:** Too much data for browser storage (rare - limit is ~50MB)  
**Fix:** Clear old data or reduce sync limits

## Quick Debug Script

Paste this in browser console after login:

```javascript
// Debug offline sync
async function debugOfflineSync() {
  console.log('=== OFFLINE SYNC DEBUG ===');
  
  // 1. Check if service is available
  if (!window.dataSyncService) {
    console.error('❌ dataSyncService not exposed on window');
    return;
  }
  console.log('✅ dataSyncService available');
  
  // 2. Check if user is authenticated
  const token = localStorage.getItem('authToken');
  if (!token) {
    console.error('❌ No auth token found - user not logged in');
    return;
  }
  console.log('✅ Auth token present');
  
  // 3. Test sync
  console.log('Testing sync...');
  try {
    const result = await window.dataSyncService.fullSync();
    console.log('✅ Sync result:', result);
    
    if (result.success) {
      console.log('✅ Sync successful!');
      console.log('  Products:', result.counts.products);
      console.log('  Batches:', result.counts.batches);
      console.log('  Customers:', result.counts.customers);
      console.log('  Employees:', result.counts.employees);
    } else {
      console.error('❌ Sync failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Sync threw error:', error);
  }
  
  // 4. Check IndexedDB
  console.log('Checking IndexedDB...');
  const db = await window.indexedDB.databases();
  const pharmaDb = db.find(d => d.name.includes('PharmaERP'));
  if (pharmaDb) {
    console.log('✅ Found database:', pharmaDb.name);
  } else {
    console.error('❌ PharmaERP database not found');
  }
  
  console.log('=== DEBUG COMPLETE ===');
}

debugOfflineSync();
```

## Expected Console Output (Working)

```
=== OFFLINE SYNC DEBUG ===
✅ dataSyncService available
✅ Auth token present
Testing sync...
[DataSync] Starting full data sync...
[DataSync] Received: { products: 150, batches: 450, customers: 89, employees: 5 }
[DataSync] Stored 150 products
[DataSync] Stored 450 batches
[DataSync] Stored 89 customers
[DataSync] Stored 5 employees
[DataSync] Full sync completed successfully
✅ Sync result: { success: true, counts: {...} }
✅ Sync successful!
  Products: 150
  Batches: 450
  Customers: 89
  Employees: 5
✅ Found database: PharmaERPOfflineV2
=== DEBUG COMPLETE ===
```

## If Sync Works but IndexedDB Still Empty

This means the data is being fetched but not stored. Check:

1. **Browser storage permissions:**
   - Check if IndexedDB is disabled in browser settings
   - Check if in incognito/private mode (limited storage)

2. **IndexedDB errors:**
   - Look for `IDBDatabase` errors in console
   - Check if `offlineDatabase.js` has errors

3. **Database version mismatch:**
   - Clear all IndexedDB databases and try again
   - Check if `DB_VERSION` is correct

```javascript
// Force IndexedDB reset
indexedDB.deleteDatabase('PharmaERPOfflineV2');
indexedDB.deleteDatabase('PharmaERPOffline'); // Old version
location.reload();
```

## Backend Logs to Check

If backend is the issue, check Railway logs for:

```
✅ Good:
[Sync] Fetched 150 products for org 1
[Sync] Fetched 450 batches for org 1
[Sync] Fetched 89 customers for org 1

❌ Bad:
[Sync] Full sync failed for org 1: <error>
No organization ID found
Database connection failed
```

## Next Steps Based on Findings

| Finding | Next Action |
|---------|------------|
| Sync not being called | Check AuthContext.js - ensure syncWithProgress() runs after login |
| 401 error | Check if auth token is included in request headers |
| CORS error | Deploy backend fix (remove OPTIONS handler) |
| Empty data returned | Check database - verify products/batches exist for org_id |
| Data fetched but not stored | Check offlineDatabase.js for errors |
| IndexedDB disabled | Enable in browser settings or use different browser |

## Force Full Re-sync

If you need to clear everything and start fresh:

```javascript
// Clear all offline data
await window.offlineDB.clearAll();

// Clear IndexedDB completely
indexedDB.deleteDatabase('PharmaERPOfflineV2');
indexedDB.deleteDatabase('PharmaERPOffline');

// Clear localStorage
localStorage.clear();

// Reload and login again
location.reload();
```
