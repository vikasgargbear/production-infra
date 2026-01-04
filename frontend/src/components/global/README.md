# Global Module

**Status:** ✅ Production-Ready

Comprehensive shared component library used across all feature modules.

---

## 🏗️ Architecture

```
global/
├── creation/           # Entity creation modals (7)
│   ├── CustomerCreationB2B.tsx
│   ├── CustomerCreationB2C.tsx
│   ├── CustomerCreationModal.tsx
│   ├── CustomerCreation.tsx
│   ├── ProductCreationModal.tsx
│   ├── SupplierCreationModal.tsx
│   └── index.ts
├── edit/               # Entity edit modals (4)
│   ├── CustomerEditModal.tsx
│   ├── PartyEditModal.tsx
│   ├── ProductEditModal.tsx
│   └── index.ts
├── selector/           # Entity selectors (6)
│   ├── AddressSelector.tsx
│   ├── BankAccountSelector.tsx
│   ├── BatchSelector.tsx
│   ├── InvoiceSelector.tsx
│   ├── PackTypeSelector.tsx
│   └── index.ts
├── search/             # Search components (7)
│   ├── CustomerSearch.tsx
│   ├── InvoiceSearch.tsx
│   ├── ProductSearch.tsx
│   ├── ProductSearchSimple.tsx
│   ├── SupplierSearch.tsx
│   └── UniversalSearch.tsx
├── modals/             # Shared modals (8)
│   ├── ConfirmationModal.tsx
│   ├── FullScreenModal.tsx
│   ├── PDFUploadModal.tsx
│   ├── ShareModal.tsx
│   └── ...
├── layout/             # Layout components (4)
│   ├── EnhancedGlobalDocumentFlow.tsx
│   ├── ModuleHub.tsx
│   ├── Page.tsx
│   └──HeaderSection.tsx
├── navigation/         # Navigation (4)
│   ├── EnhancedSidebar.tsx
│   ├── NavBar.tsx
│   ├── Breadcrumbs.tsx
│   └── QuickActions.tsx
├── ui/                 # UI primitives (57 components!)
│   ├── forms/           # Form inputs
│   ├── display/         # Display components
│   ├── feedback/        # Feedback (toasts, alerts)
│   ├── buttons/         # Button variants
│   └── ...
├── upload/             # Upload components (2)
│   ├── BulkProductUpload.tsx
│   └── FileUpload.tsx
└── pdf/                # PDF utilities (1)
```

---

## 📋 Component Categories

### Creation Components (`creation/`)
Modals for creating new entities:
- **Customer** - B2B, B2C, and unified variants
- **Product** - Full product creation
- **Supplier** - Supplier onboarding

**Usage:**
```tsx
import { CustomerCreationB2B } from '../global/creation';

<CustomerCreationB2B 
  onSave={handleCustomerCreated} 
  onClose={closeModal} 
/>
```

### Edit Components (`edit/`)
Modals for editing existing entities:
- **Customer** - Edit customer details
- **Product** - Edit product information
- **Party** - Generic party editing

**Usage:**
```tsx
import { ProductEditModal } from '../global/edit';

<ProductEditModal 
  productId={123}
  onSave={handleUpdated}
  onClose={closeModal}
/>
```

### Selectors (`selector/`)
Interactive selection components:
- **Address** - Address picker
- **Bank Account** - Account selector
- **Batch** - Batch/lot selector with expiry
- **Invoice** - Invoice picker
- **Pack Type** - Packaging selector

**Usage:**
```tsx
import { BatchSelector } from '../global/selector';

<BatchSelector
  productId={productId}
  onSelect={handleBatchSelected}
/>
```

### Search Components (`search/`)
Powerful search interfaces:
- **Customer Search** - Customer lookup
- **Product Search** - Full product search
- **Product Search Simple** - Quick product picker
- **Supplier Search** - Supplier lookup
- **Invoice Search** - Invoice finder
- **Universal Search** - Cross-entity search

**Usage:**
```tsx
import { ProductSearchSimple } from '../global/search';

<ProductSearchSimple
  onSelect={handleProductSelected}
  autoFocus
/>
```

### Modals (`modals/`)
Reusable modal patterns:
- **ConfirmationModal** - Confirm actions
- **FullScreenModal** - Full-screen overlays
- **PDFUploadModal** - PDF processing
- **ShareModal** - Share via WhatsApp/Email

**Usage:**
```tsx
import { ConfirmationModal } from '../global/modals';

<ConfirmationModal
  open={isOpen}
  title="Delete Product?"
  message="This action cannot be undone"
  onConfirm={handleDelete}
  onCancel={handleCancel}
/>
```

### Layout Components (`layout/`)
Page structure components:
- **EnhancedGlobalDocumentFlow** - Document wizard framework
- **ModuleHub** - Module launcher pattern
- **Page** - Standard page wrapper
- **HeaderSection** - Page headers

**Usage:**
```tsx
import { Page } from '../global/layout';

<Page
  title="Products"
  subtitle="Manage your inventory"
  actions={<Button>Add Product</Button>}
>
  {/* content */}
</Page>
```

### Navigation (`navigation/`)
App navigation:
- **EnhancedSidebar** - Main sidebar
- **NavBar** - Top navigation
- **Breadcrumbs** - Breadcrumb trail
- **QuickActions** - Quick access menu

### UI Components (`ui/` - 57 components!)

#### Forms
- `NumberInput` - Numeric input with formatting
- `MonthYearPicker` - Month/year selection
- `StandardDatePicker` - Date picker
- `AddressForm` - Address input
- `GSTCalculator` - Tax calculator
- `SplitPayment` - Payment split UI

#### Display
- `DataTable` - Sortable, filterable tables
- `StatusBadge` - Status indicators
- `HistoryTable` - Activity history
- `ViewHistoryButton` - History viewer

#### Feedback
- `useToast` - Toast notifications
- `LoadingSpinner` - Loading states
- `ErrorBoundary` - Error handling

#### Buttons
- `ProceedToReviewComponent` - Review step button
- Action buttons, Icon buttons

#### And 40+ more UI primitives!

---

## 🚀 Usage Patterns

### Document Flow Pattern
```tsx
import { EnhancedGlobalDocumentFlow } from '../global/layout';
import { ProductSearchSimple } from '../global/search';
import { BatchSelector } from '../global/selector';

<EnhancedGlobalDocumentFlow
  title="Sales Invoice"
  steps={['Customer', 'Items', 'Review']}
  currentStep={step}
>
  <ProductSearchSimple onSelect={addItem} />
  <BatchSelector productId={id} onSelect={selectBatch} />
</EnhancedGlobalDocumentFlow>
```

### Module Hub Pattern
```tsx
import { ModuleHub } from '../global/layout';

<ModuleHub
  title="Sales Hub"
  subtitle="Manage all sales operations"
  icon={ShoppingCart}
  modules={salesModules}
  defaultModule="invoice"
/>
```

### Form Pattern
```tsx
import { NumberInput, StandardDatePicker, useToast } from '../global';

const toast = useToast();

<NumberInput
  value={quantity}
  onChange={setQuantity}
  min={0}
  placeholder="Quantity"
/>

<StandardDatePicker
  value={date}
  onChange={setDate}
/>
```

---

## 🎨 Design System

### Component Principles
1. **Composable** - Small, focused components
2. **Consistent** - Unified styling and behavior
3. **Accessible** - Keyboard navigation, ARIA labels
4. **Performant** - Optimized renders, memoization

### Naming Conventions
- **Modals:** `*Modal.tsx` (e.g., `ProductEditModal`)
- **Selectors:** `*Selector.tsx` (e.g., `BatchSelector`)
- **Search:** `*Search.tsx` (e.g., `ProductSearch`)
- **Forms:** `*Form.tsx` (e.g., `AddressForm`)

---

## 📊 Statistics

- **Total Components:** 95+
- **UI Primitives:** 57
- **Modals:** 8 shared + 11 entity-specific
- **Selectors:** 6
- **Search:** 7
- **LOC:** ~15,000 lines

---

## 🔧 Development

### Adding New Global Components

1. **Determine category** (creation, edit, selector, search, ui)
2. **Create component** in appropriate folder
3. **Export** from folder's `index.ts`
4. **Export** from main `global/index.ts`
5. **Document** common props/patterns

### Component Guidelines
- Keep components **focused** - single responsibility
- Use **TypeScript** - full type safety
- Include **prop documentation** - JSDoc comments
- Follow **naming conventions**
- Add to **barrel exports**

### Running TypeScript Check
```bash
npx tsc --noEmit src/components/global/**/*.ts
```

---

## ⚠️ Large Files

Files >500 lines (appropriate for complexity):

| File | Lines | Rationale |
|------|-------|-----------|
| `creation/ProductCreationModal.tsx` | 960 | Complex product form with many fields |
| `ui/ViewHistoryButton.tsx` | 875 | Includes history table & filters |
| `navigation/EnhancedSidebar.tsx` | 751 | Navigation complexity |
| `creation/CustomerCreationB2B.tsx` | 742 | B2B-specific form requirements |
| `creation/SupplierCreationModal.tsx` | 686 | Complex supplier form |

**Note:** These files are **appropriate** for their domain complexity. Decomposition would provide minimal value.

---

## 💡 Best Practices

### When to Use Global Components
✅ **Use global when:**
- Component used in 2+ modules
- Standard UI pattern (modal, form, selector)
- Core business entity (customer, product, supplier)
- Reusable utility (toast, loading, table)

❌ **Don't use global when:**
- Module-specific logic
- One-off component
- Tightly coupled to parent

### Importing from Global
```tsx
// ✅ Good - Use named imports
import { ProductSearchSimple, useToast } from '../global';

// ✅ Good - Use category imports
import { CustomerCreationB2B } from '../global/creation';

// ❌ Avoid - Don't import from deep paths
import ProductSearchSimple from '../global/search/ProductSearchSimple';
```

---

**Last Updated:** January 4, 2026
