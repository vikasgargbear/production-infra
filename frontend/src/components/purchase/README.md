# Purchase Module

**Status:** ✅ Modernized (Jan 2026)

Production-ready purchase module with hook-based architecture. No context providers - each flow manages its own state.

---

## 🏗️ Architecture

```
purchase/
├── hooks/                              # Shared hooks
│   ├── usePurchaseItems.ts            # Item CRUD operations
│   ├── useDraftAutoSave.ts            # Draft persistence
│   ├── usePurchaseTransaction.ts      # Transaction state management
│   └── index.ts
├── purchase-entry/                     # Purchase Entry (~840 lines)
│   ├── PurchaseEntryFlow.tsx          # UI component
│   └── hooks/
│       ├── usePurchaseEntryLogic.ts   # State & handlers (~560 lines)
│       └── index.ts
├── purchase-order/                     # Purchase Order (~700 lines)
│   ├── PurchaseOrderFlow.tsx          # UI component
│   └── hooks/
│       ├── usePurchaseOrderLogic.ts   # State & handlers (~365 lines)
│       └── index.ts
├── grn/                                # Goods Receipt Note
│   └── GRNFlow.tsx
├── ui/                                 # Shared UI (props-based)
│   ├── SupplierSelector.tsx
│   ├── PurchaseHeader.tsx
│   └── PurchaseSummary.tsx
├── types/                              # purchaseSharedTypes.ts
├── utils/                              # purchaseCalculations.ts
└── PurchaseHub.tsx                     # Entry point (NO context wrapper)
```

---

## 🎯 Key Improvements

### Code Organization
- **3 sub-modules** for different purchase flows
- **Shared infrastructure** eliminates 80%+ duplication
- **Clean separation** of concerns

### Shared Infrastructure
- **Types**: BasePurchaseItem, PurchaseOrder, PurchaseEntry, GRN
- **Hooks**: usePurchaseItems, useDraftAutoSave
- **Utils**: productItemTransform, purchaseCalculations

---

## 🚀 Usage

### Using Shared Product Transform
```typescript
import { prepareItemForPurchaseOrder } from '../utils';

const poItem = prepareItemForPurchaseOrder(product);
```

### Using Item Management Hook
```typescript
import { usePurchaseItems } from '../hooks';

const { items, handleAddItem, handleUpdateItem, handleRemoveItem } = 
  usePurchaseItems<PurchaseOrderItem>([]);
```

### Using Draft Auto-Save
```typescript
import { useDraftAutoSave, PURCHASE_DRAFT_KEYS } from '../hooks';

useDraftAutoSave({
  data: purchaseOrder,
  storageKey: PURCHASE_DRAFT_KEYS.PURCHASE_ORDER,
  shouldSave: (po) => po.items.length > 0
});
```

---

## 📋 Sub-Modules

### Purchase Order
Creates purchase orders to request goods from suppliers.  
**Endpoint**: `/purchase-orders/`  
**File**: `purchase-order/PurchaseOrderFlow.tsx`

### Purchase Entry  
Records received supplier invoices and updates inventory.  
**Endpoint**: `/purchases/`  
**File**: `purchase-entry/PurchaseEntryFlow.tsx`  
**Features**: PDF upload, batch/expiry tracking

### GRN (Goods Receipt Note)
Records receipt of goods against purchase orders.  
**Endpoint**: `/grn/`  
**File**: `grn/GRNFlow.tsx`

---

## 🔧 Development

### Running TypeScript Check
```bash
npx tsc --noEmit src/components/purchase/**/*.ts
```

### File Structure
- Each sub-module has its own folder
- Shared code lives at top level
- Module-specific code stays in sub-module folders

---

**Last Updated:** January 4, 2026
