# Invoice Data Flow Analysis & Optimization Plan

> **Document Version:** 1.0  
> **Date:** January 1, 2026  
> **Status:** Analysis Complete - Awaiting Implementation Decision

---

## 📋 Executive Summary

The current invoice creation flow has **multiple redundant API calls** and **inconsistent data transformation** causing pricing data (`sale_price_per_unit`) to be lost. This document maps the complete data flow and proposes an optimized architecture.

---

## 🔄 Current Data Flow (Optimized)

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
│  localFirstService  │     │     IndexedDB       │
│       (.ts)         │     │  (offlineDatabase)  │
└─────────────────────┘     └─────────────────────┘
         │                            ▲
         │ [ONLINE] Network-First     │ [OFFLINE] Fallback
         ▼                            │
┌─────────────────────────────────────┴───────────────────┐
│   GET /api/products/search-with-batches?q=X             │
│   ✅ SINGLE API CALL - Returns products WITH batches    │
└─────────────────────────────────────────────────────────┘
         │
         │ Response includes:
         │ { product, batches: [...], best_batch: {...} }
         ▼
┌─────────────────────┐
│   BatchSelector     │ ◀─── Opens Modal
│       (.tsx)        │
│   ✅ NO API CALL    │ ◀─── Uses product.batches directly
└─────────────────────┘
         │
         │ User selects batch
         │ mergeProductAndBatch(product, batch)
         ▼
┌─────────────────────┐
│  useInvoiceLogic    │ ◀─── handleAddItem()
│       (.ts)         │
│   unit_price = 40   │ ◀─── Correct batch price!
└─────────────────────┘
```

---

### Step-by-Step Breakdown (After Optimization)

#### 📍 Step 1: Product Search (with embedded batches)

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/search/ProductSearchSimple.tsx` |
| **Trigger** | User types in search box |
| **Calls** | `localFirstService.searchProducts(query)` |
| **API** | `GET /products/search-with-batches?q=X` |

**Data Retrieved (NEW - includes batches!):**
```typescript
{
  product_id: "122",
  product_name: "Airpods Pro",
  product_code: "PROD760548",
  hsn_code: "3004",
  gst_percent: 12,
  total_stock: 234,
  mrp_per_unit: 120,           // ✅ Canonical field
  sale_price_per_unit: 100,    // ✅ Canonical field
  batches: [                   // ✅ EMBEDDED - no separate call needed!
    {
      batch_id: 119,
      batch_number: "BATCH74760548",
      expiry_date: "2027-07-01",
      mrp_per_unit: 45,
      sale_price_per_unit: 40,
      quantity_available: 234
    }
  ],
  best_batch: {                // ✅ Pre-calculated FEFO batch
    batch_id: 119,
    sale_price_per_unit: 40
  }
}
```

---

#### 📍 Step 2: Batch Selector Opens (NO API CALL)

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/modals/BatchSelector.tsx` |
| **Trigger** | User clicks product from search results |
| **Data Source** | `product.batches` (embedded in search response) |

**✅ NO redundant API call!** BatchSelector now uses the embedded `batches` array.

---

#### 📍 Step 3: User Selects Batch

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/global/modals/BatchSelector.tsx` |
| **Function** | `handleBatchSelect(batch)` |
| **Merge** | `mergeProductAndBatch(product, batch)` |

**Data Output (via productMapper.mergeProductAndBatch):**
```typescript
productWithBatch = {
  ...product,                              // Base product data
  batch_id: 119,
  batch_number: "BATCH74760548",
  sale_price_per_unit: 40,                 // ✅ Batch price OVERWRITES product price
  mrp_per_unit: 45,                        // ✅ Batch MRP OVERWRITES product MRP
  quantity_available: 234,                 // ✅ Batch quantity
  expiry_date: "2027-07-01"
}
```

---

#### 📍 Step 4: Add to Invoice

| Property | Value |
|----------|-------|
| **File** | `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.ts` |
| **Function** | `handleAddItem(productWithBatch)` |

**Process (Simplified):**
1. Calls `prepareItemForInvoice(productWithBatch)`
2. Extracts `unit_price` from `sale_price_per_unit` = **40** ✅
3. Adds item to invoice cart

---

## ✅ Problems Resolved

### 1. **Pricing Data - FIXED**

```
Backend:    sale_price_per_unit: 40
     ↓ mergeProductAndBatch() ensures batch overrides product
Invoice:    unit_price = 40  ✅ CORRECT!
```

---

### 2. **API Calls - OPTIMIZED**

| Step | Before | After |
|------|--------|-------|
| 1 | `/products?search=X` | `/products/search-with-batches?q=X` |
| 2 | `/inventory/batches?product_id=X` ❌ | ✅ ELIMINATED (embedded) |
| 3 | IndexedDB fetch ❌ | ✅ ELIMINATED (data already present) |

**Result:** 3 data fetches → 1 API call

---

### 3. **Field Names - STANDARDIZED**

| Location | MRP Field | Sale Price Field |
|----------|-----------|------------------|
| Backend | `mrp_per_unit` | `sale_price_per_unit` |
| Frontend | `mrp_per_unit` | `sale_price_per_unit` |
| Invoice | `mrp_per_unit` | `unit_price` (from `sale_price_per_unit`) |

**Canonical naming enforced via `productMapper.ts`**

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

**Document Version:** 3.0 (Complete)
**Date:** January 1, 2026
**Status:** ✅ Implementation Complete & Deployed

---

## 📝 Complete Changelog

### Version 3.0 - January 1, 2026 (Current)

#### 🐛 Bug Fixes
| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `unit_price: 0` on invoice items | Product-level `sale_price_per_unit` was overriding batch-level pricing | Created `mergeProductAndBatch()` in `productMapper.ts` to explicitly overwrite product pricing with batch pricing |
| `sales.sales_orders` table not found | Wrong table name in `DocumentNumberService` config | Changed to correct table `sales.orders` |
| `sales.customer_outstanding` table not found | Separate table doesn't exist, column exists on customer | Updated to directly update `parties.customers.current_outstanding` |
| Circular dependency crash (webpack) | `ProductEditModal.js` imported `ProductMaster` which imported `ProductEditModal` | Deleted stale `.js` file, updated `.tsx` to use `ProductCreationModal` |
| Inconsistent batch data (1 vs 2 batches) | Local-first strategy returned stale cache | Changed to **Network-First** when online in `localFirstService.ts` |

#### 🚀 Frontend Optimizations
| Change | File | Impact |
|--------|------|--------|
| Network-First Strategy | `localFirstService.ts` | Fresh data when online, fallback when offline |
| Removed background API refresh | `BatchSelector.tsx` | No redundant `batchAPI.getByProduct()` calls |
| Removed unused fields | `BatchSelector.tsx` | Deleted `quantity_usable`, `quantity_reserved_offline` - use `quantity_available` |
| Centralized merge logic | `productMapper.ts` | New `mergeProductAndBatch()` function |
| Cleaned unused imports | `PartyEditModal.js` | Removed dead `batchAPI`, `productAPI` imports |

#### 🖥️ Backend Optimizations
| Change | File | Impact |
|--------|------|--------|
| New optimized endpoint | `products.py` | `GET /products/search-with-batches` returns products with embedded batches |
| Fixed table reference | `document_number_service.py` | `sales_order` config now uses `sales.orders` |
| Simplified outstanding | `invoices.py` | Direct UPDATE to `parties.customers.current_outstanding` |

#### 🗑️ Files Deleted
| File | Reason |
|------|--------|
| `frontend/src/utils/dataMapper.ts` | Merged into `productMapper.ts` |
| `frontend/src/components/global/modals/ProductEditModal.js` | Stale duplicate causing circular dependency |
| `frontend/src/components/global/modals/ProductEditModal.d.ts` | Orphaned type file |
| `frontend/src/components/global/modals/BatchSelector.js` | Migrated to `.tsx` |
| `frontend/src/services/offline/cache/localFirstService.js` | Migrated to `.ts` |

---

## 📂 Active File Inventory

### Backend (Python/FastAPI)
| File | Purpose |
|------|---------|
| `backend/app/api/routes/master/products.py` | Product search & `search-with-batches` endpoint |
| `backend/app/api/routes/sales/invoices.py` | Invoice CRUD, background outstanding update |
| `backend/app/api/services/document_number_service.py` | Generates SO/INV/GRN numbers |

### Frontend (TypeScript/React)
| File | Purpose |
|------|---------|
| `frontend/src/types/models/product.ts` | **Type Definitions** - Product & Batch interfaces |
| `frontend/src/utils/productMapper.ts` | **Data Mapper** - `mapProductToCanonical()`, `mergeProductAndBatch()` |
| `frontend/src/services/offline/cache/localFirstService.ts` | **Caching** - Network-first search strategy |
| `frontend/src/services/api/modules/master/products.api.js` | **API Client** - `searchWithBatches()` |
| `frontend/src/components/global/search/ProductSearchSimple.tsx` | **UI** - Product search input |
| `frontend/src/components/global/modals/BatchSelector.tsx` | **UI** - Batch selection modal |
| `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.ts` | **Logic** - Invoice cart management |

---

## 🧪 Testing Checklist

- [x] Invoice creation returns 200 OK
- [x] `unit_price` correctly shows batch price (40), not product average (100)
- [x] Customer `current_outstanding` updates after invoice
- [x] No circular dependency errors on app load
- [x] Embedded batches load in BatchSelector without API call
- [ ] Offline mode falls back to IndexedDB correctly
- [ ] CORS issues resolved after Railway redeploy

---

## 🔄 Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                      OPTIMIZED INVOICE FLOW                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User Search                                                     │
│     └─► localFirstService.searchProducts()                         │
│         └─► [ONLINE] GET /products/search-with-batches (SINGLE!)   │
│         └─► [OFFLINE] IndexedDB.getAll('products')                 │
│                                                                     │
│  2. Display Results                                                 │
│     └─► ProductSearchSimple renders product cards                  │
│                                                                     │
│  3. User Clicks Product                                             │
│     └─► BatchSelector opens (NO API CALL - uses product.batches)   │
│                                                                     │
│  4. User Selects Batch                                              │
│     └─► mergeProductAndBatch(product, batch)                       │
│         └─► Batch pricing OVERWRITES product pricing               │
│                                                                     │
│  5. Add to Invoice                                                  │
│     └─► useInvoiceLogic.handleAddItem(productWithBatch)            │
│         └─► unit_price = batch.sale_price_per_unit = 40 ✅         │
│                                                                     │
│  6. Submit Invoice                                                  │
│     └─► POST /api/invoices/                                        │
│         └─► Creates order in sales.orders                          │
│         └─► Creates invoice in sales.invoices                      │
│         └─► Updates parties.customers.current_outstanding          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Maintained by:** AI Assistant  
**Last Updated:** January 1, 2026 @ 14:20 PST


