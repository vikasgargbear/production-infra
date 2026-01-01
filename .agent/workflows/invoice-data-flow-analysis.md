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

## ✅ Implemented Solution (Option A)

We have successfully implemented the **Single API with Embedded Batches** architecture, resolving the `unit_price: 0` bug and optimizing performance.

### 🏗️ New Architecture

#### 1. Backend (`/products/search-with-batches`)
*   **File:** `backend/app/api/routes/master/products.py`
*   **Response:** Products now include an embedded `batches` array and a `best_batch` object (calculated by FEFO).
*   **Naming:** Returns strict canonical field names (`sale_price_per_unit`, `mrp_per_unit`), eliminating ambiguity.

#### 2. Centralized Product Model
*   **File:** `frontend/src/types/models/product.ts`
*   **Purpose:** The single source of truth for `Product` and `ProductBatch` types.
*   **Change:** Updated to include canonical fields (`mrp_per_unit`, `sale_price_per_unit`, `total_stock`) alongside legacy fields for backward compatibility.

#### 3. Data Mapper Logic
*   **File:** `frontend/src/utils/productMapper.ts`
*   **Purpose:** Handles all data transformation from Raw API -> Application Model.
*   **Key Logic:**
    *   Maps `sale_price_per_unit` → `unit_price` correctly.
    *   Centrally calculates `days_to_expiry` from `expiry_date`.
    *   Populates legacy aliases (`total_quantity`, `sale_price`) to support older components.

### 📂 Useful Files Inventory (Invoice & Product Flow)

These are the **critical files** that power the optimized flow. Any file with a similar name (e.g., `.js` version of a `.ts` file) not listed here is likely redundant.

#### 🖥️ Backend Files
| File Path | Purpose |
|-----------|---------|
| `backend/app/api/routes/master/products.py` | **Primary Endpoint**. Handles `search-with-batches`. |
| `backend/app/api/routes/inventory/stock.py` | **Stock Management**. Source of truth for raw batch data. |
| `backend/app/api/routes/sales/invoices.py` | **Invoice Processing**. Handles final invoice submission. |

#### 🌐 Frontend Files

**1. Data & Logic Layer (The "Brain")**
| File Path | Purpose |
|-----------|---------|
| `frontend/src/types/models/product.ts` | **Type Definitions**. Single source of truth for `Product` & `Batch` interfaces. |
| `frontend/src/utils/productMapper.ts` | **Data Mapper**. Standardizes API data & calculates expiry. |
| `frontend/src/services/offline/cache/localFirstService.ts` | **Smart Caching**. Orchestrates offline-first data fetching. |
| `frontend/src/services/api/modules/master/products.api.js` | **API Client**. Low-level HTTP calls to backend. |
| `frontend/src/utils/fieldNormalizer.js` | **Tax Logic**. Standardizes GST/Tax calculations. |

**2. UI Components (The "Face")**
| File Path | Purpose |
|-----------|---------|
| `frontend/src/components/global/search/ProductSearchSimple.tsx` | **Search Widget**. Entry point for adding items. |
| `frontend/src/components/global/modals/BatchSelector.tsx` | **Batch Selection**. Modal for choosing specific batches/expiry. |
| `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.ts` | **Invoice State**. Manages the cart, totals, and item adding logic. |

### 🗑️ Redundant / Obsolete Files (Clean up)
These files were identified as duplicates or deprecated during this optimization:

| File Path | Status | Action |
|-----------|--------|--------|
| `frontend/src/utils/dataMapper.ts` | **Deprecated** | Deleted (Merged into `productMapper.ts`) |
| `frontend/src/components/sales/invoice/types/invoiceTypes.ts` | **Partial Deprecation** | Keep for `ProductInput` but prefer `product.ts` for entities. |
| `frontend/src/components/global/modals/BatchSelector.js` | **Duplicate** | **DELETE**. (Use `.tsx` version) |
| `frontend/src/services/offline/cache/localFirstService.js` | **Duplicate** | **DELETE**. (Use `.ts` version) |


---

## 🚀 Optimized Data Flow

```
User Search
    │
    ▼
productSearchSimple
    │
    ▼
localFirstService.cloudSearchProducts()
    │
    ▼
GET /api/products/search-with-batches  (SINGLE CALL)
    │
    ▼
Backend returns: [ { product, batches: [...] } ]
    │
    ▼
productMapper.mapProductToCanonical()
    │ 1. Standardizes field names
    │ 2. Calculates expiry
    │
    ▼
UI Displays Results
    │
    ▼
User Selects Product
    │
    ▼
BatchSelector opens (NO API CALL)
    │ 1. Uses product.batches (embedded)
    │ 2. Displays accurate pricing immediately
    │
    ▼
User Selects Batch
    │
    ▼
useInvoiceLogic.handleAddItem()
    │ 1. Uses canonical batch data
    │ 2. unit_price = 40 (Correct!)
```

---

**Document Version:** 2.1 (Final)
**Date:** January 1, 2026
**Status:** Implementation Complete

### 📝 Latest Optimizations (v2.1)
1. **Removed Redundant API Calls**: `batchAPI.getByProduct()` no longer called when batches are embedded in product or cached in IndexedDB.
2. **Simplified Data Model**: Removed `quantity_usable` and `quantity_reserved_offline` - using canonical `quantity_available` for both online/offline.
3. **Consistent Naming**: 
   - Interface: `ProductWithBatch` (PascalCase for types)
   - Variable: `productWithBatch` (camelCase for variables)
4. **Centralized Merge Logic**: `productMapper.mergeProductAndBatch()` ensures batch pricing always overrides product pricing.

