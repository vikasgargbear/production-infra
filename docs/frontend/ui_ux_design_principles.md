# UI/UX Design Principles - Pharma ERP

Comprehensive design system extracted from Invoice creation flow. All transaction components (Returns, Credit Notes, Debit Notes, Payments) should follow these patterns.

---

## Reference Screenshots

### Invoice Step 1 - Items Entry
![Invoice Step 1](/Users/vikasgarg/.gemini/antigravity/brain/fd2f2967-28b2-40eb-8ea2-b115920a4146/uploaded_image_0_1769157912896.png)

### Invoice Step 2 - Details
![Invoice Step 2](/Users/vikasgarg/.gemini/antigravity/brain/fd2f2967-28b2-40eb-8ea2-b115920a4146/uploaded_image_1_1769157912896.png)

### Invoice Step 3 - Preview
![Invoice Step 3](/Users/vikasgarg/.gemini/antigravity/brain/fd2f2967-28b2-40eb-8ea2-b115920a4146/uploaded_image_2_1769157912896.png)

---

## 1. Layout Structure

### ✅ CORRECT Pattern (Invoice)
```
┌─────────────────────────────────────────────────────────┐
│ ModuleHeader (blue badge, status, actions)        × │
├─────────────────────────────────────────────────────────┤
│ KeyboardShortcuts bar                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   bg-blue-50 container                                  │
│   ┌─────────────────────────────────────────────────┐  │
│   │ Date fields in grid (3 columns)                 │  │
│   └─────────────────────────────────────────────────┘  │
│   ┌─────────────────────────────────────────────────┐  │
│   │ CUSTOMER section with search                    │  │
│   └─────────────────────────────────────────────────┘  │
│   ┌─────────────────────────────────────────────────┐  │
│   │ PRODUCTS section with search                    │  │
│   └─────────────────────────────────────────────────┘  │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ DocumentFooter (Reset | Continue →)                     │
└─────────────────────────────────────────────────────────┘
```

### ❌ WRONG Pattern (Current Returns)
```
- Uses gray-50 instead of blue-50
- Wraps everything in extra white cards (redundant)
- Has verbose keyboard shortcuts text instead of styled bar
- Uses max-w-6xl container (too narrow, not full-width)
```

---

## 2. Background Colors

| Component | Correct | Wrong |
|-----------|---------|-------|
| Main container | `bg-blue-50` | `bg-gray-50` |
| Cards/sections | White with subtle shadow | Nested white cards |
| Header | White with border-b | Same |

**Rule**: Use blue-50 for all transaction flows (Invoice, Returns, Credit Note, Payment). Gray-50 is for list/dashboard pages.

---

## 3. ModuleHeader Props

```tsx
<ModuleHeader
    title="Invoice"                    // Document type
    documentNumber={invoice.invoice_number}  // e.g. "DRAFT-20260123"
    status="draft"                     // draft | review | preview
    icon={FileText}                    // Lucide icon
    iconColor="text-blue-600"          // Color for icon
    onClose={onClose}                  // X button handler
    // historyType="invoice"           // ❌ REMOVE - Don't show History on creation steps 2/3
    showSaveDraft={true}               // Optional: Save Draft button
    additionalActions={[               // Custom buttons
        {
            label: 'Import from Order/Challan',
            icon: FileInput,
            onClick: () => setShowImportModal(true),
            variant: 'secondary'
        }
    ]}
/>
```

**Rules**:
- `historyType` should ONLY be on Step 1 of creation flows
- Don't show History button on Steps 2 and 3 (Details/Preview)

---

## 4. Keyboard Shortcuts Bar

### ✅ Use Global Component
```tsx
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';

<KeyboardShortcuts shortcuts={SHORTCUT_SETS.CREATE} />
```

### ❌ Don't Do This
```tsx
<div className="bg-gray-50 px-4 py-2 text-xs text-gray-700 border-b">
    Keyboard shortcuts: <strong>Ctrl+R</strong> - Search Customer | ...
</div>
```

---

## 5. Date Fields Layout

### ✅ Correct: 3-Column Grid with StandardDatePicker
```tsx
<div className="grid grid-cols-3 gap-4 mb-6">
    <StandardDatePicker
        label="Invoice Date"
        value={invoice.invoice_date}
        onChange={(value) => setInvoice(prev => ({ ...prev, invoice_date: value }))}
        required
    />
    <StandardDatePicker
        label="Due Date"
        value={invoice.due_date}
        onChange={(value) => setInvoice(prev => ({ ...prev, due_date: value }))}
        required
    />
    <div>
        <label className="block text-sm font-medium text-gray-600 mb-2">
            M.R. (Medical Representative)
        </label>
        <select>...</select>
    </div>
</div>
```

### ❌ Wrong: Wrapped in separate white card with different layout
```tsx
<div className="bg-white rounded-lg shadow-sm border p-6">  // ❌ Extra card
    <div className="flex items-start gap-6">  // ❌ Flex instead of grid
        <div className="w-64">  // ❌ Fixed width
            <DatePicker />
        </div>
        ...
    </div>
</div>
```

---

## 6. Section Headers

### ✅ Correct Pattern
```tsx
<div className="mb-6">
    <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
            <User className="w-4 h-4 mr-2" />
            CUSTOMER
        </h3>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            Create Customer
        </button>
    </div>
    <CustomerSearch ... />
</div>
```

**Rules**:
- Uppercase label: `CUSTOMER`, `PRODUCTS`, `ITEMS`
- Blue-700 color for section text
- Icon before label (4x4, mr-2)
- Action button on right side
- mb-3 between header and content, mb-6 after section

---

## 7. Customer/Party Search

### ✅ Use Global CustomerSearch Component
```tsx
import { CustomerSearch } from '../../../global';

<CustomerSearch
    value={invoice?.customer_details || null}
    onChange={handleCustomerSelect}
    displayMode="compact"
    placeholder="Search customer by name, phone, or code..."
    showCreateButton={false}
    clearable={true}
/>
```

### ❌ Don't Create Custom Selectors
```tsx
// ❌ ReturnCustomerSelector is redundant
<ReturnCustomerSelector ... />  
```

All transaction flows should use the same `CustomerSearch` global component.

---

## 8. Items Table

### ✅ Use Global ItemsTableKeyboard
```tsx
import { ItemsTableKeyboard } from '../../../global';

<ItemsTableKeyboard
    ref={itemsTableRef}
    items={invoice.items}
    onUpdateItem={handleUpdateItem}
    onRemoveItem={handleRemoveItem}
    productSearchRef={productSearchRef}
    currencySymbol="₹"
/>
```

---

## 9. Footer

### ✅ Use Global DocumentFooter
```tsx
import { DocumentFooter } from '../../../global';

<DocumentFooter
    totalItems={invoice.items?.length || 0}
    totalAmount={invoice.final_amount}
    onCancel={onClose}
    onContinue={onContinue}
    cancelLabel="Reset"
    continueLabel="Continue"
    continueDisabled={!selectedCustomer || !invoice.items?.length}
    continueButtonColor="blue"
/>
```

---

## 10. Step 2 (Details) Design

### Numbered Sections with White Cards
```tsx
<div className="bg-blue-50">
    {/* Section 1: Delivery */}
    <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                1
            </div>
            <span className="font-semibold text-gray-900">Delivery</span>
            <button className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">
                + New Address
            </button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            {/* Content inside white card */}
        </div>
    </div>

    {/* Section 2: Payment */}
    <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 ...">
                2
            </div>
            <span className="font-semibold text-gray-900">Payment</span>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            {/* Content */}
        </div>
    </div>
</div>
```

---

## 11. Amounts Display

### Within Card - Right Aligned
```tsx
<div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
    <div className="flex justify-between text-sm">
        <span className="text-gray-600">Taxable Amount</span>
        <span className="text-gray-900">₹40.00</span>
    </div>
    <div className="flex justify-between text-lg font-semibold">
        <span className="text-gray-900">Total Amount</span>
        <span className="text-gray-900">₹45.00</span>
    </div>
</div>
```

---

## 12. Consistency Checklist

Before creating any transaction component, verify:

- [ ] Uses `bg-blue-50` main background
- [ ] Uses `ModuleHeader` with correct props
- [ ] Uses `KeyboardShortcuts` global component
- [ ] Date fields in 3-column grid
- [ ] Section headers: uppercase, blue-700, icon, action button
- [ ] Uses `CustomerSearch` global (not custom selector)
- [ ] Uses `ProductSearch` global (not custom selector)
- [ ] Uses `ItemsTableKeyboard` for items
- [ ] Uses `DocumentFooter` for navigation
- [ ] No `historyType` on steps 2/3
- [ ] Full-width layout (no max-w-6xl on creation flows)
- [ ] Minimal whitespace (no extra padding/cards)

---

## Components to Refactor

| Component | Current Issues |
|-----------|----------------|
| `SalesReturnFlow` | gray-50 bg, custom ReturnCustomerSelector, verbose shortcut bar, extra white cards, max-w-6xl container |
| `PurchaseReturnFlow` | Same issues as SalesReturnFlow |
| Payment components | Need to audit |
| Credit/Debit Notes | Need to audit |

---

## Implementation Priority

1. **Create shared step components** that follow these patterns
2. **Refactor SalesReturnFlow** to use blue-50, CustomerSearch, KeyboardShortcuts
3. **Refactor PurchaseReturnFlow** similarly
4. **Audit and update** payment/credit/debit note flows
5. **Remove redundant components** (ReturnCustomerSelector, etc.)
