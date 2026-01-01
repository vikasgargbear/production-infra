# Invoice Data Flow Analysis & Optimization Plan

> **Document Version:** 1.0  
> **Date:** January 1, 2026  
> **Status:** Analysis Complete - Awaiting Implementation Decision

---

## 📋 Executive Summary

The current invoice creation flow has **multiple redundant API calls** and **inconsistent data transformation** causing pricing data (`sale_price_per_unit`) to be lost. This document maps the complete data flow and proposes an optimized architecture.

---

## 🔄 Current Data Flow

### Overview Diagram

```
User Types Search Query
         │
         ▼
┌─────────────────────┐
│  ProductSearchSimple │ ◀─── Entry Point
│       (.tsx)         │
└─────────────────────┘
         │
         │ searchProducts(query)
         ▼
┌─────────────────────┐     ┌─────────────────────┐
│  localFirstService  │────▶│     IndexedDB       │
│       (.ts)         │     │  (offlineDatabase)  │
└─────────────────────┘     └─────────────────────┘
         │                            │
         │ Cache miss?                │ Cache hit
         ▼                            ▼
┌─────────────────────┐     ┌─────────────────────┐
│   productAPI.search │     │ Return cached data  │
│  /products?search=X │     │ (missing batch $$$) │
└─────────────────────┘     └─────────────────────┘
         │
         │ User clicks product
         ▼
┌─────────────────────┐
│   BatchSelector     │ ◀─── Opens Modal
│       (.tsx)        │
└─────────────────────┘
         │
         │ batchAPI.getByProduct()
         ▼
┌─────────────────────┐
│ /inventory/batches  │ ◀─── 2nd API CALL (REDUNDANT)
│   ?product_id=X     │
└─────────────────────┘
         │
         │ User selects batch
         ▼
┌─────────────────────┐
│  useInvoiceLogic    │ ◀─── handleAddItem()
│       (.ts)         │
└─────────────────────┘
         │
         │ If offline
         ▼
┌─────────────────────┐
│ offlineDB.getBatches│ ◀─── 3rd DATA FETCH (REDUNDANT)
│   ForProduct()      │
└─────────────────────┘
```

---

### Step-by-Step Breakdown

#### 📍 Step 1: Product Search

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/search/ProductSearchSimple.tsx` |
| **Trigger** | User types in search box |
| **Calls** | `localFirstService.searchProducts(query)` |

**Data Retrieved:**
```typescript
{
  product_id: "122",
  product_name: "Airpods Pro",
  product_code: "PROD760548",
  hsn_code: "3004",
  gst_percent: 12,
  current_stock: 234,
  // ❌ MISSING: actual batch pricing
  mrp: 120,        // Product-level average
  sale_price: 100  // Product-level average
}
```

---

#### 📍 Step 2: Local First Service

| Property | Value |
|----------|-------|
| **File** | `frontend/src/services/offline/cache/localFirstService.ts` |
| **Cache Layers** | 1. Memory (searchCache) → 2. IndexedDB → 3. API |

**Data Transformation:**
```typescript
// Backend returns:
{ mrp_per_unit: 45, sale_price_per_unit: 40 }

// localFirstService transforms to:
{ mrp: 45, sale_price: 40 }  // ⚠️ Renames fields!
```

**Problem:** Only product-level data is cached. Batch-specific pricing requires a separate API call.

---

#### 📍 Step 3: Batch Selector Opens

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/modals/BatchSelector.tsx` |
| **Trigger** | User clicks product from search results |
| **API Call** | `batchAPI.getByProduct(productId)` |
| **Endpoint** | `GET /api/inventory/batches?product_id=122` |

**Data Retrieved:**
```typescript
{
  batches: [
    {
      batch_id: 119,
      batch_number: "BATCH74760548",
      expiry_date: "2027-07-01",
      mrp_per_unit: 45,           // ✅ Correct batch pricing
      sale_price_per_unit: 40,    // ✅ Correct batch pricing
      quantity_available: 234
    }
  ]
}
```

**🔄 REDUNDANCY:** This is a separate API call that could have been included in Step 1.

---

#### 📍 Step 4: User Selects Batch

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/modals/BatchSelector.tsx` |
| **Function** | `handleBatchSelect(batch)` |

**Data Output:**
```typescript
productWithBatch = {
  ...product,                           // From Step 1
  batch_id: 119,
  batch_number: "BATCH74760548",
  unit_price: batch.sale_price_per_unit,  // 40
  mrp: batch.mrp_per_unit,                // 45
  expiry_date: "2027-07-01"
}
```

---

#### 📍 Step 5: Add to Invoice

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.ts` |
| **Function** | `handleAddItem(product)` |

**Process:**
1. Calls `prepareItemForInvoice(product)`
2. If **OFFLINE**: Fetches batches from IndexedDB (🔄 REDUNDANT)
3. If **ONLINE**: Uses data as-is
4. Caches batch in IndexedDB (🔄 REDUNDANT - already cached by BatchSelector)

---

## ⚠️ Problems Identified

### 1. **Pricing Data Lost in Translation**

```
Backend:    sale_price_per_unit: 40
     ↓ localFirstService transforms
Cache:      sale_price: 40
     ↓ prepareItemForInvoice checks sale_price_per_unit first
Invoice:    unit_price: 0  ❌ BUG!
```

**Root Cause:** Field name inconsistency between sources.

---

### 2. **Multiple API Calls for Same Data**

| Step | API Call | Could Be Avoided? |
|------|----------|-------------------|
| 1 | `/products?search=X` | Required |
| 3 | `/inventory/batches?product_id=X` | ✅ Yes - include in Step 1 |
| 5 | IndexedDB fetch (offline) | ✅ Yes - already cached |

---

### 3. **Inconsistent Field Names**

| Source | MRP Field | Sale Price Field |
|--------|-----------|------------------|
| Backend | `mrp_per_unit` | `sale_price_per_unit` |
| localFirstService | `mrp` | `sale_price` |
| BatchSelector | `mrp_per_unit` | `sale_price_per_unit` |
| useInvoiceLogic | `mrp` | `unit_price` |

---

### 4. **Multiple Cache Layers**

```
searchCache (memory)  ─┐
localStorage          ├─── Which one is source of truth?
IndexedDB             ─┘
```

---

## ✅ Recommended Optimizations

### Option A: Single API with Embedded Batches (Recommended)

**New Backend Endpoint:**
```
GET /api/products/search-with-batches?query=airpods
```

**Response:**
```json
{
  "products": [
    {
      "product_id": 122,
      "product_name": "Airpods Pro",
      "gst_percent": 12,
      "batches": [
        {
          "batch_id": 119,
          "batch_number": "BATCH74760548",
          "mrp_per_unit": 45,
          "sale_price_per_unit": 40,
          "quantity_available": 234,
          "expiry_date": "2027-07-01"
        }
      ]
    }
  ]
}
```

**Benefits:**
- Single API call for all data
- BatchSelector uses cached batches (no API call)
- Consistent field names throughout

---

### Option B: Standardize Field Names (Quick Fix)

1. Keep existing architecture
2. Add canonical field name mapping at a single point
3. All components use mapped names

**Implementation:**
```typescript
// frontend/src/utils/dataMapper.ts
export const mapBatchData = (batch: any) => ({
  batch_id: batch.batch_id,
  batch_number: batch.batch_number,
  unit_price: batch.sale_price_per_unit || batch.sale_price || 0,
  mrp: batch.mrp_per_unit || batch.mrp || 0,
  // ... other fields
});
```

---

## 📊 Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Fix `sale_price_per_unit` → `unit_price` mapping | Low | High |
| 🟠 P1 | Create unified data mapper utility | Medium | High |
| 🟡 P2 | Add `/products/search-with-batches` endpoint | Medium | Medium |
| 🟢 P3 | Consolidate cache to single layer (IndexedDB) | High | Medium |

---

## 🎯 Next Steps

1. **Immediate:** Fix the `unit_price: 0` bug by ensuring `sale_price_per_unit` is used
2. **Short-term:** Create standardized data mapper
3. **Medium-term:** Implement embedded batches API

---

**Document Author:** AI Assistant  
**Review Status:** Pending User Review
