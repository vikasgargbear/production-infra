# UI/UX Design Standards

This is the **single source of truth** for all UI/UX design patterns in PharmaERP. All new components MUST follow these standards.

> [!IMPORTANT]
> Before creating any new component, review this document. Consistency is critical for maintainability.

---

## Table of Contents

1. [Layout Standards](#1-layout-standards)
2. [Form Inputs](#2-form-inputs)
3. [Buttons](#3-buttons)
4. [Entity Search](#4-entity-search)
5. [Headers & Footers](#5-headers--footers)
6. [Background Colors](#6-background-colors)
7. [Section Headers](#7-section-headers)
8. [Selected Entity Tiles](#8-selected-entity-tiles)
9. [Summary Cards](#9-summary-cards)
10. [Print Templates](#10-print-templates)
11. [Anti-Patterns](#11-anti-patterns)
12. [Consistency Checklist](#12-consistency-checklist)

---

## 1. Layout Standards

### Full-Page Flow Layouts
Used for: CustomerFlow, ProductFlow, SupplierFlow, InvoiceFlow

```
Container:     fixed inset-0 bg-gray-50 z-50 (or bg-blue-50 for transactions)
Content Width: max-w-4xl mx-auto (for master entity forms)
Padding:       px-6 (horizontal), py-4 (header/footer), py-6 (content)
```

### Transaction Flows (Invoice, Returns, etc.)

```
┌─────────────────────────────────────────────────────────┐
│ ModuleHeader (blue badge, status, actions)        ×     │
├─────────────────────────────────────────────────────────┤
│ KeyboardShortcuts bar                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   bg-blue-50 container (FULL WIDTH, no max-w)           │
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

---

## 2. Form Inputs

### Standard Input Height

**All form inputs MUST use `py-2.5`** (10px vertical padding) for consistent height.

```css
/* Standard input */
w-full px-3 py-2.5 border border-gray-300 rounded-lg 
focus:ring-2 focus:ring-{color}-500 focus:border-transparent

/* Input with icon */
w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg 
focus:ring-2 focus:ring-{color}-500 focus:border-transparent

/* Search input */
w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg 
focus:ring-2 focus:ring-blue-500 focus:border-transparent
```

### Focus Ring Colors by Module

| Module     | Focus Ring        | Primary Color |
|------------|-------------------|---------------|
| Customer   | `focus:ring-blue-500`   | blue-600 |
| Product    | `focus:ring-green-500`  | green-600 |
| Supplier   | `focus:ring-blue-500`   | blue-600 |
| Purchase   | `focus:ring-purple-500` | purple-600 |
| Sales      | `focus:ring-blue-500`   | blue-600 |
| Invoice    | `focus:ring-blue-500`   | blue-600 |

---

## 3. Buttons

### Primary Action Buttons (Save, Submit)

```tsx
className="px-6 py-2.5 bg-blue-600 text-white rounded-lg 
           hover:bg-blue-700 disabled:opacity-50 transition-colors"
```

### Secondary/Cancel Buttons

```tsx
className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg 
           hover:bg-gray-50 disabled:opacity-50 transition-colors"
```

### Create Entity Buttons

For CONSISTENT button widths across all entity creation buttons:

```tsx
className="min-w-[140px] px-4 py-2 text-sm font-medium 
           bg-blue-600 text-white rounded-lg hover:bg-blue-700"
```

### Action Buttons (PDF, Excel, Print, WhatsApp)

Position: Right side of filter row, separated by flex spacer

```
[Filters...] ←spacer→ [WhatsApp] [PDF] [Excel] [Print]
```

Order: Communication (WhatsApp) → Export (PDF, Excel) → Print

---

## 4. Entity Search

### Global Search Components

Always use these global components - **NEVER create inline search implementations**:

- `CustomerSearch` - for customer lookup
- `ProductSearch` - for product lookup  
- `SupplierSearch` - for supplier lookup
- `EntitySearch` - generic reusable base

### Standard Search Pattern

```
┌───────────────────────────────────────────────────────────────┐
│ 📋 CUSTOMER                             [Create Customer]     │  ← Section header
│ ┌───────────────────────────────────────────────────────────┐ │
│ │  White card (p-4) wrapper                                 │ │
│ │  ┌─────────────────────────────────────────────────────┐ │ │
│ │  │ 🔍 Search customer by name, phone, or code...       │ │ │  ← Search input
│ │  └─────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Implementation

```tsx
{/* Section Label with Create button */}
<div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
        <User className="w-4 h-4 mr-2" />
        CUSTOMER
    </h3>
    <button 
        onClick={handleCreateCustomer}
        className="min-w-[140px] px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
        Create Customer
    </button>
</div>

{/* White card wrapper - REQUIRED for consistent padding */}
<div className="bg-white rounded-lg border border-gray-200 p-4">
    <CustomerSearch
        value={selectedCustomer}
        onChange={handleCustomerSelect}
        displayMode="compact"       // ← Critical: hides internal label
        placeholder="Search customer by name, phone, or code..."
        showCreateButton={false}    // ← We already have Create button above
        clearable={true}
    />
</div>
```

> [!WARNING]
> The white card wrapper (`bg-white rounded-lg border border-gray-200 p-4`) is **REQUIRED** for all entity search sections to match ProductSearch styling.

### Key Rules

1. **Outer Label**: Always add uppercase label with icon (`CUSTOMER`, `PRODUCTS`)
2. **displayMode**: Use `"compact"` to prevent duplicate labels
3. **White Card Wrapper**: Wrap search in `bg-white rounded-lg border border-gray-200 p-4`
4. **Create Button**: Place in section header with `min-w-[140px]`, NOT inside search
5. **showCreateButton**: Set to `false` since we have external Create button

---

## 5. Headers & Footers

### Header (Full-Page Flows)

```tsx
{/* Header - STANDARD: py-4, full-width, right-aligned save */}
<header className="bg-white border-b border-gray-200 shrink-0 px-6 py-4">
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
                <h1 className="text-xl font-semibold text-gray-900">New Customer</h1>
                <p className="text-sm text-gray-500">Create customer profile</p>
            </div>
        </div>
        <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save Customer
        </button>
    </div>
</header>
```

### Footer (Full-Page Flows)

```tsx
{/* Footer - STANDARD: py-4, full-width, right-aligned buttons */}
<footer className="bg-white border-t border-gray-200 shrink-0 px-6 py-4">
    <div className="flex items-center justify-end gap-3">
        <button className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Cancel
        </button>
        <button className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Save Customer
        </button>
    </div>
</footer>
```

> [!WARNING]
> - Header and Footer MUST both use `py-4` for consistent heights
> - Footer should be **full-width** - do NOT use `max-w-4xl` constraint
> - Buttons should always be **right-aligned** with `justify-end`

---

## 6. Background Colors

| Page Type | Background | Example |
|-----------|------------|---------|
| Master Entity Forms | `bg-gray-50` | CustomerFlow, ProductFlow |
| Transaction Flows | `bg-blue-50` | InvoiceFlow, SalesReturn |
| List/Dashboard Pages | `bg-gray-50` | Customer List, Dashboard |
| Cards/Sections | `bg-white` | Form sections |

**Rule**: Use `bg-blue-50` for all transaction flows (Invoice, Returns, Credit Note, Payment). Use `bg-gray-50` for list/dashboard pages and master data forms.

---

## 7. Section Headers

### Within Forms

```tsx
<section className="bg-white rounded-xl border border-gray-200 p-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Building2 className="w-5 h-5 text-blue-600" />
        Basic Information
    </h2>
    {/* Form fields... */}
</section>
```

### Within Transaction Flows

```tsx
<div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
        <User className="w-4 h-4 mr-2" />
        CUSTOMER
    </h3>
    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
        Create Customer
    </button>
</div>
```

---

## 8. Selected Entity Tiles

When displaying a selected entity (customer/supplier):

```
┌─────────────────────────────────────────────────────────────┐
│ [S]  Super Medical Store                              🗑️    │
│      GST: 27AAUFM1756H1ZE                                   │
│      📞 8949228635  📍 Jaipur                               │
└─────────────────────────────────────────────────────────────┘
```

**Rules**:
1. **Avatar**: Blue circle with first letter of name
2. **Info Stack**: Name → GST → Phone/City (one line each)
3. **Actions**: Only delete button in tile; other actions in action row

---

## 9. Summary Cards

Dashboard-style summary tiles:

```tsx
<div className="bg-gray-900 rounded-lg px-4 py-3">
    <span className="text-xs text-gray-400 block mb-1">Total Debit</span>
    <span className="text-lg font-bold text-white">₹2539.80</span>
</div>
```

**Rules**:
1. **Background**: `bg-gray-900` (dark)
2. **Label**: `text-xs text-gray-400`
3. **Value**: `text-lg font-bold text-white`

---

## 10. Print Templates

1. **No Total Row in Table**: Totals confuse users on multi-page prints
2. **Summary Section**: Show totals in footer summary instead
3. **Column Count**: Match colspan to actual visible columns

---

## 11. Anti-Patterns

> [!CAUTION]
> Avoid these common mistakes:

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| Centered footer buttons | Right-aligned (`justify-end`) |
| Different header/footer heights | Both use `py-4` |
| `max-w-4xl` on footer | Full-width footer |
| Inline search implementations | Use global search components |
| Mixed input heights (py-2, py-3) | All inputs use `py-2.5` |
| `displayMode="inline"` everywhere | Use `"compact"` with external label |
| Creating duplicate components | Check `global/` first |
| Custom ReturnCustomerSelector | Use `CustomerSearch` |
| `bg-gray-50` for transactions | Use `bg-blue-50` |

---

## 12. Consistency Checklist

Before creating or refactoring any component:

### Layout
- [ ] Uses correct background (`bg-blue-50` for transactions, `bg-gray-50` for master)
- [ ] Header uses `py-4` with right-aligned actions
- [ ] Footer uses `py-4` with `justify-end` (NO max-w constraint)
- [ ] Content uses `max-w-4xl mx-auto px-6` (master forms only)

### Inputs
- [ ] All inputs use `py-2.5` for consistent height
- [ ] Focus ring matches module color theme
- [ ] Uses `focus:border-transparent` with focus ring

### Search
- [ ] Uses global `CustomerSearch`/`ProductSearch`/`SupplierSearch`
- [ ] Uses `displayMode="compact"` with external label
- [ ] Create button in section header, NOT inside search
- [ ] Consistent section padding `p-4`

### Buttons
- [ ] Primary buttons use module color (blue/green/purple)
- [ ] Create buttons use `min-w-[140px]` for consistent width
- [ ] Secondary buttons use border style

### Components
- [ ] Uses `ModuleHeader` for transaction flows
- [ ] Uses `KeyboardShortcuts` global component
- [ ] Uses `DocumentFooter` for navigation
- [ ] Uses `ItemsTableKeyboard` for items

---

## 13. Multi-Step Flow Standards

Used for: InvoiceFlow, SalesReturnFlow, PurchaseFlow, PaymentFlow

### Step Consistency Rules

1. **Background**: ALL steps in a flow MUST use the same background (`bg-blue-50` for transactions)
2. **Content padding**: ALL steps MUST use `px-6 py-6` (never `px-8`)
3. **Content width**: ALL steps MUST use the same `max-w-*` (e.g., `max-w-6xl`)
4. **Footer**: ALL steps MUST use `DocumentFooter` component — never hand-code a footer
5. **Section headers**: ALL steps MUST use the same section header pattern within a flow

### Section Headers in Transaction Flows

Use the standard uppercase pattern consistently:

```tsx
<h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
    <Icon className="w-4 h-4 mr-2" />
    SECTION TITLE
</h3>
```

Do NOT mix numbered circles, different font sizes, or different colors for section headers within the same flow.

### Label Standard (ALL forms)

```tsx
<label className="block text-sm font-medium text-gray-700 mb-2">
    Field Name
</label>
```

- Size: `text-sm` (NOT `text-xs`)
- Weight: `font-medium`
- Color: `text-gray-700` (NOT `text-gray-500` or `text-blue-700`)
- Margin: `mb-2` (NOT `mb-1`)

---

## 14. Component Usage Rules

### Always Use Global Components

| Need | Use Global | Never Use |
|------|------------|-----------|
| Dropdown | `Select` from global | Native `<select>` |
| Number field | `NumberInput` from global | `<input type="number">` |
| Currency field | `CurrencyInput` from global | `<input type="number">` with ₹ |
| Date field | `StandardDatePicker` from global | `<input type="date">` |
| Toggle/Switch | `Toggle` from global (when available) | Hand-coded toggle |
| Status indicator | `StatusBadge` from global | Custom colored spans |

**Exception**: Native `<select>` is acceptable ONLY inside the global component implementations themselves.

### Focus Ring Standard

ALL inputs MUST use `focus:border-transparent` with the focus ring:

```css
focus:ring-2 focus:ring-{module-color}-500 focus:border-transparent
```

Never use `focus:border-{color}-500` — the ring replaces the border highlight.

### Card Border Radius Standard

| Card Type | Radius |
|-----------|--------|
| Form section cards | `rounded-xl` |
| Table wrappers | `rounded-lg` |
| Search wrappers | `rounded-lg` |
| Modal containers | `rounded-xl` |
| Small badges/pills | `rounded-full` |

---

## 15. Toast Notification Standard

Use **`react-toastify`** as the single toast system across the entire app.

```tsx
import { toast } from 'react-toastify';

toast.success('Invoice created!');
toast.error('Failed to save');
toast.info('Feature coming soon');
```

Do NOT use the custom `useToast()` hook for new code. The global `ToastProvider` component (`useToast`) should be deprecated in favor of `react-toastify`.

---

## 16. Code Quality Standards

### No Debug Logging in Production

Remove all `console.log` statements before merging. Use a logger utility with levels if debug output is needed:

```tsx
// ❌ Wrong
console.log('[Invoice] Data:', data);
console.log('🔄 [STEP 1→2] Calculating...');

// ✅ Correct - remove or use debug utility
import { logger } from '@/utils/logger';
logger.debug('[Invoice] Data:', data);  // Only outputs in dev mode
```

### TypeScript Strictness

Avoid `as any` type casting. If types don't match between components:

```tsx
// ❌ Wrong
<Component invoice={invoice as any} />

// ✅ Correct - fix the type definition
<Component invoice={invoice} />  // Ensure types align
```

### ARIA Accessibility

ALL interactive elements MUST have accessible labels:

```tsx
// Toggle switches
<button role="switch" aria-checked={isEnabled} aria-label="Enable split payment">

// Icon-only buttons
<button aria-label="View invoice" title="View Invoice">

// Checkboxes in tables
<input type="checkbox" aria-label={`Select invoice ${invoice.invoice_number}`} />
```

---

## 17. File Hygiene

- Delete orphaned/duplicate component files immediately
- Never keep `-NEW`, `-OLD`, `-backup` files in the codebase
- If refactoring creates new files, delete the old ones in the same commit

---

## Related Documents

Current interaction and accessibility behavior must be verified against
`frontend/src`, its component tests, and the live Playwright suites. Historical
line-number audit snapshots are not design authority.
