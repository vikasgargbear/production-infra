# Batch Offline Storage Implementation Plan

## Problem
Batch selection is slow because:
1. **No persistent storage** - Every time user selects product, API call is made
2. **Memory-only cache** - searchCache is just a Map(), lost on page refresh
3. **No offline support** - Can't select batches without internet
4. **10-minute TTL** - Even if cached, expires quickly

## Current Flow (SLOW)
```
User selects product "Paracetamol"
  ↓
BatchSelector opens
  ↓
Check searchCache (memory only)
  ↓
Cache miss (or expired)
  ↓
API call: GET /inventory/batches?product_id=123  (~100ms network)
  ↓
Transform batches
  ↓
Show dropdown
  
Total: ~150-200ms (feels slow)
```

## Proposed Solution: IndexedDB + Preloading

### 1. Add Batches Store to IndexedDB ✅
```javascript
// offlineDatabase.js - DONE
batches store with indexes:
- product_id (for fast lookup)
- batch_number
- expiry_date
- updated_at
```

### 2. Preload Batches Strategy

**Option A: Preload ALL batches on app load** (Recommended for small inventory)
```javascript
// On app init:
- Fetch all active batches from backend
- Store in IndexedDB
- Expires after 24 hours
- Background refresh every hour

Pros:
- Instant batch selection (0ms)
- Works 100% offline
- Simple implementation

Cons:
- Initial load time (~2-5 seconds for 1000 batches)
- More memory usage
```

**Option B: Lazy load + cache per product** (Current with IndexedDB)
```javascript
// On product selection:
- Check IndexedDB for batches by product_id
- If found & fresh → use immediately
- If not found → fetch from API + store in IndexedDB
- Cache for 24 hours

Pros:
- Lower initial load
- Scales to large inventory

Cons:
- First selection still requires API call
- Still ~100ms first time
```

**Option C: Smart preloading** (Best of both)
```javascript
// On app init:
- Preload batches for top 50 products (fast-moving)
- Lazy load for others
- Background sync for updates

Pros:
- Fast for common products (80/20 rule)
- Scalable
- Good offline support

Cons:
- More complex logic
```

### 3. New Flow (INSTANT)

```
User selects product "Paracetamol"
  ↓
BatchSelector opens
  ↓
Query IndexedDB by product_id  (~5ms)
  ↓
If found & fresh → Show immediately
  ↓
Background: Check API for updates
  
Total: ~5-10ms (feels instant!)
```

### 4. Implementation Steps

#### Step 1: Add IndexedDB Methods ✅
```javascript
// offlineDatabase.js
async getBatchesByProduct(productId) {
  const db = await this.init();
  const tx = db.transaction('batches', 'readonly');
  const index = tx.objectStore('batches').index('product_id');
  return await index.getAll(productId);
}

async storeBatches(batches) {
  const db = await this.init();
  const tx = db.transaction('batches', 'readwrite');
  const store = tx.objectStore('batches');
  
  for (const batch of batches) {
    await store.put({
      ...batch,
      updated_at: new Date().toISOString()
    });
  }
  
  await tx.done;
}
```

#### Step 2: Update BatchSelector to Use IndexedDB
```javascript
// BatchSelector.js
const loadBatches = async () => {
  if (!product) return;

  setLoading(true);
  
  try {
    // 1. Try IndexedDB first (INSTANT)
    const cachedBatches = await offlineDB.getBatchesByProduct(product.product_id);
    
    if (cachedBatches && cachedBatches.length > 0) {
      // Check if cache is fresh (< 24 hours)
      const lastUpdate = new Date(cachedBatches[0].updated_at);
      const hoursSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate < 24) {
        // Use cached data immediately
        processBatches(cachedBatches);
        setLoading(false);
        
        // Background refresh if > 1 hour old
        if (hoursSinceUpdate > 1) {
          fetchAndUpdateBatches(product.product_id);
        }
        return;
      }
    }
    
    // 2. Cache miss or stale → fetch from API
    await fetchAndUpdateBatches(product.product_id);
    
  } catch (error) {
    // Fallback to API
    await fetchAndUpdateBatches(product.product_id);
  }
};

const fetchAndUpdateBatches = async (productId) => {
  const response = await batchAPI.getByProduct(productId);
  const batchesData = response.data?.batches || response.data || [];
  
  // Store in IndexedDB for next time
  await offlineDB.storeBatches(batchesData);
  
  processBatches(batchesData);
};
```

#### Step 3: Preload Strategy (Option C - Smart)
```javascript
// In app initialization (App.js or index.js)
import { preloadBatches } from './services/batchPreloader';

useEffect(() => {
  // Preload after 2 seconds (don't block initial load)
  setTimeout(() => {
    preloadBatches();
  }, 2000);
}, []);

// batchPreloader.js
export const preloadBatches = async () => {
  try {
    // Get top products (fast-moving)
    const topProducts = await getTopProducts(50);
    
    // Fetch batches for each
    for (const product of topProducts) {
      const batches = await batchAPI.getByProduct(product.product_id);
      await offlineDB.storeBatches(batches.data || []);
    }
    
    console.log('✅ Batches preloaded for top 50 products');
  } catch (error) {
    console.warn('Batch preloading failed:', error);
  }
};
```

### 5. Performance Comparison

| Scenario | Current | With IndexedDB | Improvement |
|----------|---------|----------------|-------------|
| **First time** | ~150ms | ~150ms (still needs API) | 0% |
| **Second time (same session)** | ~0ms (memory cache) | ~5ms (IndexedDB) | Similar |
| **After page refresh** | ~150ms (cache lost) | ~5ms (IndexedDB persisted) | **97% faster!** |
| **Offline** | ❌ Fails | ✅ Works | **Infinite better** |
| **With preloading** | ~150ms | ~5ms | **97% faster!** |

### 6. Storage Size Estimation

For 1000 batches:
```
1 batch = ~500 bytes (batch_id, product_id, batch_number, dates, quantities, prices)
1000 batches = 500KB
IndexedDB limit = 50MB minimum (usually unlimited)
```

**Conclusion**: Storage is not a concern.

### 7. Maintenance & Sync

**Cache Invalidation:**
- 24-hour expiry (stale-while-revalidate pattern)
- Background refresh after 1 hour
- Manual refresh on inventory operations (purchase, adjustment)

**Clear cache when:**
- User adds new batch (via purchase/GRN)
- Batch quantity updated
- Batch deleted/expired

```javascript
// After purchase/GRN
await offlineDB.clearBatchesForProduct(product_id);
// Will force fresh fetch next time
```

### 8. Implementation Priority

1. ✅ **DONE**: Add batches store to IndexedDB
2. **TODO**: Add getBatchesByProduct and storeBatches methods
3. **TODO**: Update BatchSelector to check IndexedDB first
4. **TODO**: Implement preloading (Option A or C)
5. **TODO**: Add cache invalidation hooks
6. **TODO**: Test offline functionality

### 9. Migration Path

Since DB_VERSION is incremented from 1 → 2:
- Existing users will automatically migrate on next page load
- IndexedDB will add batches store
- No data loss
- Seamless upgrade

---

## Status
- [x] Database schema added
- [ ] Storage methods implemented
- [ ] BatchSelector updated
- [ ] Preloading strategy implemented
- [ ] Testing completed

**Next Steps**: Implement storage methods and update BatchSelector
