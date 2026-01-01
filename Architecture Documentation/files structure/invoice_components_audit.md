# Invoice Components Comprehensive Audit

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Invoice-Related Files** | 48 |
| **JS/JSX Files (Need TSX Conversion)** | 18 |
| **TSX/TS Files** | 30 |
| **Duplicate/Redundant Files** | 4 |
| **Mislocated Files** | 3 |

---

## Location Map

### 1. Core Invoice Components (`/components/sales/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoiceFlow.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/InvoiceFlow.tsx) | ✅ TSX | 17KB | Main invoice creation wizard flow | ✅ OK |
| ~~InvoiceManagement.tsx~~ | - | - | ~~Invoice list & management dashboard~~ | ✅ ARCHIVED → Replaced by InvoiceList |
| [InvoiceList.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/InvoiceList.tsx) | ✅ TSX | 44KB | Invoice list with filters (ACTIVE) | ✅ OK |
| ~~InvoiceContainer.tsx~~ | - | - | ~~Invoice layout wrapper~~ | ✅ ARCHIVED → Prototype code with placeholders |
| [InvoiceSidebar.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/InvoiceSidebar.tsx) | ✅ TSX | 8KB | Sidebar for invoice details | ✅ OK |
| [InvoiceSuccessModal.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/InvoiceSuccessModal.tsx) | ✅ TSX | 9KB | Success confirmation modal | ✅ OK |

---

### 2. Invoice Step Components (`/components/sales/invoice/steps/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoiceDetailsStep.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/invoice/steps/InvoiceDetailsStep.tsx) | ✅ TSX | 42KB | Customer & invoice details entry | ✅ OK |
| [InvoiceItemsStep.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/invoice/steps/InvoiceItemsStep.tsx) | ✅ TSX | 20KB | Line items entry step | ✅ OK |
| [InvoicePreviewStep.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/invoice/steps/InvoicePreviewStep.tsx) | ✅ TSX | 22KB | Final preview before save | ✅ OK |

---

### 3. Invoice Hooks (`/components/sales/invoice/hooks/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [useInvoiceLogic.ts](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/invoice/hooks/useInvoiceLogic.ts) | ✅ TS | 40KB | Core invoice business logic hook | ✅ OK |

---

### 4. Invoice UI Components (`/components/sales/ui/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoiceSummaryTop.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/ui/InvoiceSummaryTop.tsx) | ✅ TSX | 5KB | Invoice totals summary header | ✅ OK |
| [ConvertToInvoiceButton.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/ui/ConvertToInvoiceButton.tsx) | ✅ TSX | 2KB | Order-to-invoice conversion | ✅ OK |
| [BillSummary.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/ui/BillSummary.tsx) | ✅ TSX | 5KB | Bill totals display | ⚠️ DUPLICATE |
| [PaymentDetails.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/ui/PaymentDetails.tsx) | ✅ TSX | 12KB | Payment method selection | ✅ OK |

---

### 5. Legacy Invoice Components (`/components/invoice/`) ⚠️ REVIEW NEEDED

> [!WARNING]
> This directory contains LEGACY components that may be REDUNDANT with the `/sales/` module.

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoicePreview.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/invoice/ui/InvoicePreview.js) | ❌ JS | 27KB | Invoice PDF preview | 🔴 CONVERT TO TSX |
| [InvoicePreviewEnterprise.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/invoice/ui/InvoicePreviewEnterprise.js) | ❌ JS | 26KB | Enterprise invoice preview | 🔴 CONVERT TO TSX |
| [BatchSelectionModalV2.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/invoice/modals/BatchSelectionModalV2.js) | ❌ JS | 20KB | Batch selection modal | 🟡 MOVE TO GLOBAL |
| [invoiceStyles.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/invoice/styles/invoiceStyles.js) | ❌ JS | 5KB | Invoice styling constants | 🟡 MERGE INTO CONFIG |

---

### 6. Global Invoice Components (`/components/global/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoiceSelector.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/global/modals/InvoiceSelector.tsx) | ✅ TSX | - | Invoice selection modal | ✅ OK |
| [InvoiceSearch.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/global/search/InvoiceSearch.js) | ❌ JS | - | Invoice search component | 🔴 CONVERT TO TSX |
| [BillSummary.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/global/ui/display/BillSummary.tsx) | ✅ TSX | - | Bill summary display | ⚠️ DUPLICATE |

---

### 7. Payment Module Invoice Components (`/components/payment/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [InvoiceSelector.tsx](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/payment/ui/InvoiceSelector.tsx) | ✅ TSX | - | Invoice selection for payments | ⚠️ DUPLICATE |

---

### 8. Returns Module Invoice Components (`/components/returns/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [PurchaseInvoiceSelector.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/returns/ui/PurchaseInvoiceSelector.js) | ❌ JS | - | Purchase invoice selection | 🔴 CONVERT TO TSX |
| [SupplierInvoiceSelector.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/returns/ui/SupplierInvoiceSelector.js) | ❌ JS | - | Supplier invoice selection | 🔴 CONVERT TO TSX |

---

### 9. Challan Module Invoice Components (`/components/challan/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [ImportFromInvoiceModal.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/challan/ui/ImportFromInvoiceModal.js) | ❌ JS | - | Import items from invoice | 🔴 CONVERT TO TSX |

---

### 10. Services & APIs (`/services/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [invoices.api.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/services/api/modules/sales/invoices.api.js) | ❌ JS | 4KB | Invoice API calls | 🟡 CONVERT TO TS |
| [supplierInvoices.api.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/services/api/modules/purchase/supplierInvoices.api.js) | ❌ JS | - | Supplier invoice API | 🟡 CONVERT TO TS |
| [invoiceApiService.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/services/invoiceApiService.js) | ❌ JS | - | Legacy invoice service | 🔴 DELETE/MIGRATE |
| [invoiceValidator.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/services/invoiceValidator.js) | ❌ JS | - | Invoice validation | 🟡 CONVERT TO TS |
| [localInvoiceService.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/services/offline/documents/localInvoiceService.js) | ❌ JS | - | Offline invoice storage | 🟡 CONVERT TO TS |

---

### 11. Hooks (`/hooks/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [useInvoiceCalculation.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/hooks/useInvoiceCalculation.js) | ❌ JS | 9KB | Invoice math calculations | 🔴 CONVERT TO TS |

---

### 12. Types (`/types/models/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [invoice.ts](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/types/models/invoice.ts) | ✅ TS | 4KB | Invoice TypeScript types | ✅ OK |

---

### 13. Config (`/config/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [invoice.config.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/config/invoice.config.js) | ❌ JS | 5KB | Invoice configuration | 🟡 CONVERT TO TS |

---

### 14. Utils (`/utils/`)

| File | Format | Size | Purpose | Status |
|------|--------|------|---------|--------|
| [invoicePdfGenerator.js](file:///Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/utils/invoicePdfGenerator.js) | ❌ JS | - | PDF generation for invoices | 🔴 CONVERT TO TS |

---

## Issues Summary

### 🔴 Files Requiring TSX/TS Conversion (11)

1. `/components/invoice/ui/InvoicePreview.js`
2. `/components/invoice/ui/InvoicePreviewEnterprise.js`
3. `/components/invoice/modals/BatchSelectionModalV2.js`
4. `/components/global/search/InvoiceSearch.js`
5. `/components/returns/ui/PurchaseInvoiceSelector.js`
6. `/components/returns/ui/SupplierInvoiceSelector.js`
7. `/components/challan/ui/ImportFromInvoiceModal.js`
8. `/hooks/useInvoiceCalculation.js`
9. `/services/invoiceApiService.js`
10. `/services/invoiceValidator.js`
11. `/utils/invoicePdfGenerator.js`

### ⚠️ ~~Duplicate Components~~ → Same-Name, Different Purpose (4)

> [!NOTE]
> **Phase 1 Analysis Result**: These are NOT true duplicates. They serve different purposes.

| Component | Location 1 | Location 2 | Analysis |
|-----------|------------|------------|----------|
| BillSummary | `/global/ui/display/` (Props-based, generic) | `/sales/ui/` (Uses SalesContext, specific) | ✅ KEEP BOTH |
| InvoiceSelector | `/global/modals/` (Generic picker, 400 lines) | `/payment/ui/` (Payment allocation, 286 lines) | ✅ KEEP BOTH |

**Rationale**:
- **Global BillSummary**: Accepts `data` and `onFieldChange` props - reusable anywhere
- **Sales BillSummary**: Uses `useSales()` context directly - sales module specific
- **Global InvoiceSelector**: Generic invoice search/select modal
- **Payment InvoiceSelectorV2**: Payment allocation with `usePayment()` context

### 🟡 Mislocated Files (2)

| File | Current Location | Suggested Location |
|------|------------------|-------------------|
| BatchSelectionModalV2.js | `/invoice/modals/` | `/global/modals/` |
| invoiceStyles.js | `/invoice/styles/` | `/config/` or `/styles/` |

---

## Recommended Actions

### Phase 1: Consolidate Duplicates
1. Keep `BillSummary.tsx` in `/global/ui/display/` (more reusable)
2. Keep `InvoiceSelector.tsx` in `/global/modals/` (more reusable)
3. Update imports across codebase

### Phase 2: Convert JS → TSX (Components)
1. `InvoicePreview.js` → `InvoicePreview.tsx`
2. `InvoicePreviewEnterprise.js` → `InvoicePreviewEnterprise.tsx`
3. `InvoiceSearch.js` → `InvoiceSearch.tsx`
4. `ImportFromInvoiceModal.js` → `ImportFromInvoiceModal.tsx`
5. `PurchaseInvoiceSelector.js` → `PurchaseInvoiceSelector.tsx`
6. `SupplierInvoiceSelector.js` → `SupplierInvoiceSelector.tsx`

### Phase 3: Convert JS → TS (Services/Hooks)
1. `useInvoiceCalculation.js` → `useInvoiceCalculation.ts`
2. `invoiceValidator.js` → `invoiceValidator.ts`
3. `invoicePdfGenerator.js` → `invoicePdfGenerator.ts`
4. `invoice.config.js` → `invoice.config.ts`

### Phase 4: Cleanup Legacy
1. Evaluate `/components/invoice/` directory for deletion
2. Move `BatchSelectionModalV2.js` to `/global/modals/`
3. Merge `invoiceStyles.js` into config or delete

---

## Directory Structure (Target State)

```
src/
├── components/
│   ├── sales/
│   │   ├── InvoiceFlow.tsx          # Main invoice wizard
│   │   ├── InvoiceManagement.tsx    # Invoice list/management
│   │   ├── InvoiceListV2.tsx        # Enhanced list
│   │   ├── InvoiceContainer.tsx     # Layout wrapper
│   │   ├── InvoiceSidebar.tsx       # Details sidebar
│   │   ├── InvoiceSuccessModal.tsx  # Success modal
│   │   ├── invoice/
│   │   │   ├── hooks/
│   │   │   │   └── useInvoiceLogic.ts
│   │   │   └── steps/
│   │   │       ├── InvoiceDetailsStep.tsx
│   │   │       ├── InvoiceItemsStep.tsx
│   │   │       └── InvoicePreviewStep.tsx
│   │   └── ui/
│   │       ├── InvoiceSummaryTop.tsx
│   │       ├── InvoicePreview.tsx       # MOVED from /invoice/
│   │       └── ConvertToInvoiceButton.tsx
│   ├── global/
│   │   ├── modals/
│   │   │   ├── InvoiceSelector.tsx
│   │   │   └── BatchSelectorV2.tsx      # MOVED from /invoice/
│   │   └── search/
│   │       └── InvoiceSearch.tsx        # CONVERTED
│   └── returns/
│       └── ui/
│           ├── PurchaseInvoiceSelector.tsx  # CONVERTED
│           └── SupplierInvoiceSelector.tsx  # CONVERTED
├── hooks/
│   └── useInvoiceCalculation.ts         # CONVERTED
├── services/
│   └── invoiceValidator.ts              # CONVERTED
├── types/models/
│   └── invoice.ts                       # EXISTING
├── config/
│   └── invoice.config.ts                # CONVERTED
└── utils/
    └── invoicePdfGenerator.ts           # CONVERTED
```
