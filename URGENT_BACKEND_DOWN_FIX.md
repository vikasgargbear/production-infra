# 🔴 URGENT: Backend Down - Action Plan

**Issue**: Backend crashed on Railway (works locally)  
**Root Cause**: Likely Railway environment issue (DATABASE_URL, deployment, etc.)  
**Impact**: Frontend can't reach backend

---

## 🚨 IMMEDIATE FIX

### Option 1: Check Railway Logs (Most Important!)

**Go to Railway Dashboard**:
```
https://railway.app/project/[your-project]/service/[backend]
```

**Click "Deployments" → Latest Deployment → "View Logs"**

**Look for**:
- Database connection errors
- Import errors
- Port binding issues
- Environment variable issues

### Option 2: Verify DATABASE_URL

**In Railway Variables**:
1. Check DATABASE_URL has NO line breaks
2. Should be ONE continuous line:
   ```
   postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres
   ```

### Option 3: Rollback Last Deploy

**If V2 code causing issues**:
```bash
cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra

# Revert last 2 commits
git revert HEAD~2..HEAD --no-edit

# Push
git push origin main
```

**This restores working state before V2 code**

---

## 🏥 OFFLINE-FIRST SOLUTION (While Backend Down)

Since you need offline-first for India's network, let me show you what's ALREADY implemented:

### 1. Local Invoice Number Generation ✅
**Already Working!**

Your frontend falls back to local:
```javascript
// documentNumberGenerator.js:104
Backend number generation failed, using local: Network Error
```

**This is GOOD!** It means offline mode is working.

### 2. IndexedDB Cache (Need to Add)

Create: `frontend/src/services/offlineStorage.js`

```javascript
// IndexedDB for offline data
import { openDB } from 'idb';

const DB_NAME = 'pharma_offline';
const DB_VERSION = 1;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Products cache
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'product_id' });
      }
      
      // Customers cache
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'customer_id' });
      }
      
      // MR list cache
      if (!db.objectStoreNames.contains('mr_list')) {
        db.createObjectStore('mr_list', { keyPath: 'employee_id' });
      }
      
      // Batches cache
      if (!db.objectStoreNames.contains('batches')) {
        const store = db.createObjectStore('batches', { keyPath: 'batch_id' });
        store.createIndex('product_id', 'product_id');
      }
      
      // Pending invoices (offline created)
      if (!db.objectStoreNames.contains('pending_invoices')) {
        db.createObjectStore('pending_invoices', { 
          keyPath: 'local_id',
          autoIncrement: true 
        });
      }
    },
  });
}

// Cache products locally
export async function cacheProducts(products) {
  const db = await getDB();
  const tx = db.transaction('products', 'readwrite');
  
  for (const product of products) {
    await tx.store.put({
      ...product,
      cached_at: Date.now()
    });
  }
  
  await tx.done;
}

// Get cached products
export async function getCachedProducts() {
  const db = await getDB();
  return db.getAll('products');
}

// Cache batches
export async function cacheBatches(productId, batches) {
  const db = await getDB();
  const tx = db.transaction('batches', 'readwrite');
  
  for (const batch of batches) {
    await tx.store.put({
      ...batch,
      product_id: productId,
      cached_at: Date.now()
    });
  }
  
  await tx.done;
}

// Get cached batches
export async function getCachedBatches(productId) {
  const db = await getDB();
  const index = db.transaction('batches').store.index('product_id');
  return index.getAll(productId);
}

// Save invoice offline
export async function saveInvoiceOffline(invoiceData) {
  const db = await getDB();
  await db.add('pending_invoices', {
    ...invoiceData,
    status: 'pending_sync',
    created_at: Date.now()
  });
}

// Sync pending invoices when online
export async function syncPendingInvoices() {
  const db = await getDB();
  const pending = await db.getAll('pending_invoices');
  
  const synced = [];
  for (const invoice of pending) {
    try {
      // Try to send to backend
      await api.post('/invoices/', invoice);
      
      // If successful, remove from pending
      await db.delete('pending_invoices', invoice.local_id);
      synced.push(invoice.local_id);
    } catch (error) {
      console.warn('Failed to sync invoice:', invoice.local_id);
    }
  }
  
  return synced;
}
```

### 3. Update Your API Service

```javascript
// services/api.js

import { 
  getCachedProducts, 
  cacheProducts,
  getCachedBatches,
  cacheBatches 
} from './offlineStorage';

// Offline-first product fetch
export async function getProducts() {
  try {
    // Try online first
    const response = await api.get('/products/');
    
    // Cache for offline use
    await cacheProducts(response.data);
    
    return response.data;
  } catch (error) {
    // If offline, use cache
    console.log('🔌 Offline: Using cached products');
    return await getCachedProducts();
  }
}

// Offline-first batch fetch
export async function getProductBatches(productId) {
  try {
    const response = await api.get(`/products/${productId}/batches`);
    
    // Cache for offline
    await cacheBatches(productId, response.data);
    
    return response.data;
  } catch (error) {
    console.log('🔌 Offline: Using cached batches');
    return await getCachedBatches(productId);
  }
}
```

---

## 🚀 PERFORMANCE: Fix Slow Batch Loading

### Current Issue:
```
Loading batches for a product is taking forever
```

### Solution: Preload & Cache

```javascript
// Preload batches when product selected
async function handleProductSelect(product) {
  setSelectedProduct(product);
  
  // Start loading batches immediately
  const batchesPromise = getProductBatches(product.product_id);
  
  // Don't wait, continue with other work
  batchesPromise.then(batches => {
    setBatches(batches);
  }).catch(err => {
    console.warn('Failed to load batches:', err);
    setBatches([]);  // Empty if fails
  });
  
  // Don't block the UI
}
```

### Add Loading States

```javascript
const [batchesLoading, setBatchesLoading] = useState(false);

async function loadBatches(productId) {
  setBatchesLoading(true);
  
  try {
    const batches = await getProductBatches(productId);
    setBatches(batches);
  } catch (error) {
    console.error('Batch load error:', error);
    setBatches([]);
  } finally {
    setBatchesLoading(false);
  }
}

// In render:
{batchesLoading ? (
  <Spinner />
) : (
  <BatchSelect batches={batches} />
)}
```

---

## 📊 MR List Not Loading

### Quick Fix:

```javascript
// services/api.js

let cachedMRList = null;
let cacheExpiry = null;

export async function getMRList() {
  // Use cache if fresh (< 5 minutes old)
  if (cachedMRList && cacheExpiry > Date.now()) {
    return cachedMRList;
  }
  
  try {
    const response = await employeesAPI.getAll({ limit: 100 });
    
    // Cache for 5 minutes
    cachedMRList = response.data;
    cacheExpiry = Date.now() + (5 * 60 * 1000);
    
    return cachedMRList;
  } catch (error) {
    // Return cached even if expired
    if (cachedMRList) {
      console.log('🔌 Using stale MR cache');
      return cachedMRList;
    }
    
    throw error;
  }
}
```

---

## ⚡ IMMEDIATE ACTION ITEMS

### 1. Check Railway Logs (DO THIS FIRST!)
```
railway.app → Your Project → Backend Service → Deployments → View Logs
```

**Look for the actual error!**

### 2. If Backend Won't Start, Rollback
```bash
git revert HEAD~2..HEAD --no-edit
git push origin main
```

### 3. While Waiting, Add Offline Support
- Install `idb` package: `npm install idb`
- Add offlineStorage.js
- Update API calls to use cache

### 4. Test Offline Mode
- Disconnect WiFi
- Try creating invoice
- Should work with cached data

---

## 🎯 ROOT CAUSE

**Backend works locally but not on Railway = Environment issue**

Possible causes:
1. DATABASE_URL malformed (line breaks?)
2. Missing environment variable
3. Railway deployment timeout
4. Port binding issue
5. Memory limit

**Check Railway logs to find actual cause!**

---

## ✅ OFFLINE-FIRST IS YOUR PRIORITY

You're building for India with poor network. Here's what you need:

**Already Works** ✅:
- Local invoice number generation
- Fallback on network errors

**Need to Add** ⚠️:
- IndexedDB caching
- Preload data
- Queue offline operations
- Sync when online

**I can help implement full offline-first after we get backend up!**

---

## 🚨 NEXT STEP

**GO TO RAILWAY NOW**:
1. Check deployment logs
2. Find actual error
3. Share error here

**Or rollback to working version**:
```bash
git revert HEAD~2..HEAD --no-edit && git push
```

**Then we fix offline-first properly!**
