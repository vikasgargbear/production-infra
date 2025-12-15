# CORS and Service Worker Cache Issues - Analysis & Fix

## Issue 1: CORS Error on OAuth Endpoint

### Error:
```
Access to fetch at 'https://pharma-backend-production-0c09.up.railway.app/api/auth/oauth/google/url' 
from origin 'http://localhost:3000' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Root Cause:
The OPTIONS handler in `main.py` (line 120-122) returns a JSON response **without CORS headers**.

```python
@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    return {"message": "OK", "status": "preflight_success"}  # ❌ No CORS headers!
```

### Why This Happens:
1. Browser sends OPTIONS preflight request for CORS
2. Your custom OPTIONS handler intercepts it
3. Returns response WITHOUT `Access-Control-Allow-Origin` header
4. Browser blocks the actual request

### Solution:
The OPTIONS handler should return a proper Response with CORS headers, OR let the CORS middleware handle it automatically.

**Option A: Remove custom OPTIONS handler (RECOMMENDED)**
- Let FastAPI's CORS middleware handle all OPTIONS requests automatically
- It already has `allow_origins=["*"]` configured

**Option B: Fix OPTIONS handler to include CORS headers**
```python
from fastapi.responses import Response

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    return Response(
        content='',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '3600'
        }
    )
```

## Issue 2: Repetitive Service Worker Cache Logs

### Observation:
```
service-worker.js:74 [ServiceWorker] Serving from cache: .../api/products/?limit=100...
service-worker.js:74 [ServiceWorker] Serving from cache: .../api/products/?limit=100...
service-worker.js:74 [ServiceWorker] Serving from cache: .../api/products/?limit=100...
```

### Root Causes:

#### 1. Multiple Component Renders (Primary)
React components are making duplicate API calls due to:
- **React.StrictMode** in development (doubles renders)
- **Multiple component instances** requesting same data
- **No request deduplication** at application level
- **Component re-renders** triggering new fetch calls

#### 2. Service Worker is Working Correctly
The service worker IS doing its job:
- Caching GET requests
- Serving from cache when available
- Logging each cache hit (for debugging)

The logs are **informational**, not errors. The issue is the duplicate requests themselves.

### Solutions:

#### Solution 1: Add Request Deduplication (RECOMMENDED)
Create a request deduplication layer to prevent duplicate in-flight requests:

```javascript
// frontend/src/services/api/requestCache.js
class RequestCache {
  constructor() {
    this.pendingRequests = new Map();
  }

  async dedupe(key, requestFn) {
    // If request is in-flight, return the existing promise
    if (this.pendingRequests.has(key)) {
      console.log('[RequestCache] Deduping:', key);
      return this.pendingRequests.get(key);
    }

    // Start new request
    const promise = requestFn().finally(() => {
      // Remove from cache when done
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  clear() {
    this.pendingRequests.clear();
  }
}

export const requestCache = new RequestCache();
```

**Usage in API client:**
```javascript
// In apiClient.js
import { requestCache } from './requestCache';

export const get = async (url, options) => {
  const cacheKey = `GET:${url}:${JSON.stringify(options)}`;
  
  return requestCache.dedupe(cacheKey, async () => {
    return axios.get(url, options);
  });
};
```

#### Solution 2: React Query / SWR (BEST LONG-TERM)
Use a library that handles caching and deduplication automatically:

```javascript
// With React Query
import { useQuery } from '@tanstack/react-query';

function ProductList() {
  const { data } = useQuery({
    queryKey: ['products', { limit: 100 }],
    queryFn: () => productAPI.list({ limit: 100 }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  // Automatically dedupes requests with same queryKey
}
```

#### Solution 3: Reduce Service Worker Logging (QUICK FIX)
If logs are just annoying, reduce them:

```javascript
// In service-worker.js, replace:
console.log('[ServiceWorker] Serving from cache:', request.url);

// With conditional logging:
if (Math.random() < 0.1) { // Log 10% of cache hits
  console.log('[ServiceWorker] Cache hits:', this.cacheHitCount++);
}
```

#### Solution 4: React.StrictMode (DEV ONLY)
In development, React.StrictMode causes double-renders. This is intentional for detecting issues but causes duplicate API calls.

```javascript
// In index.js - ONLY for production build
{process.env.NODE_ENV === 'production' ? (
  <App />
) : (
  <React.StrictMode>
    <App />
  </React.StrictMode>
)}
```

### Analysis of Your Specific Repetitions

Looking at your logs:
```
[ServiceWorker] Serving from cache: .../api/products/?limit=100... (8 times)
[ServiceWorker] Serving from cache: .../api/customers/?search=su... (multiple times)
[ServiceWorker] Serving from cache: .../api/inventory/batches?product_id=122 (multiple times)
```

**Why 8 times for products?**
- InvoiceFlow component mounts
- ProductSearch component renders (1st)
- User types → component re-renders (2nd)
- React StrictMode doubles everything (4th)
- Multiple invoice line items = multiple ProductSearch instances (8th)

**Why repetitive customer searches?**
- User types "s" → fetch
- User types "u" → new fetch
- User types "p" → new fetch
- Each keystroke = new request
- All served from cache (which is good!)

**Why batches repeated?**
- Each time product is selected
- BatchSelector component fetches batches
- Multiple line items = multiple BatchSelector instances

## Recommendations

### Immediate Fix (CORS):
1. **Remove the custom OPTIONS handler** from `main.py` line 120-122
2. Let FastAPI's CORS middleware handle OPTIONS requests automatically
3. Verify CORS works with: `curl -X OPTIONS https://pharma-backend-production-0c09.up.railway.app/api/auth/oauth/google/url -H "Origin: http://localhost:3000" -v`

### Short-term Fix (Repetitions):
1. Add request deduplication wrapper in `apiClient.js`
2. Debounce search inputs (use `useDebounce` hook)
3. Reduce service worker console logs

### Long-term Fix (Architecture):
1. Implement React Query or SWR for data fetching
2. Centralize API state management
3. Use proper caching strategies with TTL

## Quick Debounce Hook

```javascript
// hooks/useDebounce.js
import { useState, useEffect } from 'react';

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

**Usage:**
```javascript
function ProductSearch({ query, onSearch }) {
  const debouncedQuery = useDebounce(query, 300); // Wait 300ms after typing stops
  
  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      onSearch(debouncedQuery);
    }
  }, [debouncedQuery]);
}
```

## Testing

### Test CORS Fix:
```bash
# Test OPTIONS preflight
curl -X OPTIONS \
  https://pharma-backend-production-0c09.up.railway.app/api/auth/oauth/google/url \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -v

# Should return:
# < HTTP/1.1 200 OK
# < Access-Control-Allow-Origin: *
# < Access-Control-Allow-Methods: *
# < Access-Control-Allow-Headers: *
```

### Test Request Deduplication:
```javascript
// Browser console - should see only 1 network request:
Promise.all([
  productAPI.list({ limit: 100 }),
  productAPI.list({ limit: 100 }),
  productAPI.list({ limit: 100 })
]);
```

## Summary

| Issue | Root Cause | Fix | Priority |
|-------|-----------|-----|----------|
| CORS Error | Custom OPTIONS handler without headers | Remove OPTIONS handler | 🔴 HIGH |
| Repetitive Cache Hits | No request deduplication | Add dedupe layer + debounce | 🟡 MEDIUM |
| Noisy Logs | Service worker logging every hit | Reduce logging frequency | 🟢 LOW |

**The good news:** Your service worker IS working correctly for offline support. The repetitions are from React components, not the service worker itself.
