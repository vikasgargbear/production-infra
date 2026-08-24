# Sales Module

**Status:** Cloud-authoritative

Sales reads and supported writes use the canonical API boundary. Unsupported
writes fail closed; there is no local persistence or background synchronization.

---

## 📋 Quick Links

- **[Shared Types](./types/salesSharedTypes.ts)** - Base types for all sales modules
- **[Shared Hooks](./hooks/)** - API-backed reusable hooks
- **[Shared Utils](./utils/)** - Product and document transformations

---

## 🏗️ Architecture

```
sales/
├── hooks/              # Shared API-backed hooks
├── utils/              # Shared document transformations
├── types/              # Shared types
│   └── salesSharedTypes.ts
├── invoice/            # Invoice module
│   ├── hooks/
│   │   ├── useInvoiceLogic.ts
│   │   └── useInvoiceSave.ts
│   └── utils/
│       └── invoiceItemUtils.ts
├── challan/            # Challan module
│   ├── hooks/
│   │   └── useChallanLogic.ts (380 lines)
│   └── utils/
│       └── challanItemUtils.ts
└── order/              # Order module
    └── utils/
        └── orderItemUtils.ts
```

---

## 🎯 Key Improvements

### Code Reduction
- **useInvoiceLogic:** 1109 → 700 lines (-37%)
- **useChallanLogic:** 552 → 380 lines (-31%)

### Shared Infrastructure
- **18 utility/hook files** created
- **6 shared utilities** used across all modules
- **0 TypeScript errors**

---

## Runtime boundary

- The API is the source of truth for customers, products, batches, stock, tax,
  numbering, and persistence.
- The browser may hold form state only for the currently open flow.
- A successful UI message requires a successful server response.
- Invoice mutations use the reviewed canonical operator-command endpoint.

---

## 🔧 Development

### Running TypeScript Check
```bash
npx tsc --noEmit src/components/sales/**/*.ts
```

### File Structure
- Each module has `hooks/` and `utils/` folders
- Shared code lives at top level
- Module-specific code stays in module folders

---


---

**Last Updated:** January 2, 2026
