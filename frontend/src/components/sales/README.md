# Sales Module

**Status:** ✅ Optimized (Jan 2026)

Production-ready sales module with shared infrastructure and clean architecture.

---

## 📋 Quick Links

- **[Module Optimization Playbook](./MODULE_OPTIMIZATION_PLAYBOOK.md)** - Complete guide for optimizing other modules
- **[Shared Types](./types/salesSharedTypes.ts)** - Base types for all sales modules
- **[Shared Hooks](./hooks/)** - Reusable hooks (useSalesTransaction, useEmployees, useDraftAutoSave)
- **[Shared Utils](./utils/)** - Reusable utilities (product transform, offline helpers)

---

## 🏗️ Architecture

```
sales/
├── hooks/              # Shared hooks (3 files)
│   ├── useSalesTransaction.ts
│   ├── useEmployees.ts
│   └── useDraftAutoSave.ts
├── utils/              # Shared utilities (3 files)
│   ├── offlineSaveHelpers.ts
│   ├── productItemTransform.ts
│   └── index.ts
├── types/              # Shared types
│   └── salesSharedTypes.ts
├── invoice/            # Invoice module
│   ├── hooks/
│   │   ├── useInvoiceLogic.ts (700 lines)
│   │   ├── useInvoiceDraft.ts
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

## 🚀 Usage

### Using Shared Product Transform
```typescript
import { prepareItemForInvoice } from './utils';

const invoiceItem = prepareItemForInvoice(product);
```

### Using Draft Auto-Save
```typescript
import { useDraftAutoSave } from '../../hooks';

useDraftAutoSave({
  data: invoice,
  storageKey: STORAGE_KEYS.INVOICE_DRAFT,
  shouldSave: (inv) => inv.items.length > 0
});
```

### Using Offline Helpers
```typescript
import { generateTempId, deductStockLocally } from '../../utils';

const tempId = generateTempId();
await deductStockLocally(invoice.items); // ⚠️ Invoice only!
```

---

## ⚠️ Important Notes

### Stock Deduction - Invoice Only
`deductStockLocally()` should **only** be used for invoices:
- ✅ **Invoice** = Actual sale, deduct stock
- ❌ **Challan** = Delivery note, no stock deduction
- ❌ **Order** = Sales order, no stock deduction

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

## 📖 Learn More

See **[MODULE_OPTIMIZATION_PLAYBOOK.md](./MODULE_OPTIMIZATION_PLAYBOOK.md)** for:
- Complete optimization methodology
- Step-by-step guide for other modules
- Reusable patterns and templates
- Common pitfalls and solutions

---

**Last Updated:** January 2, 2026
