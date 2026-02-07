# UI/UX Audit: Invoice Module

> **Audited**: 2026-02-06
> **Scope**: InvoiceFlow (Steps 1-3), InvoiceList, InvoiceTable, sub-components
> **Compared Against**: `docs/design-system.md`, `docs/guides/ui-design-standards.md`, `DESIGN_PRINCIPLES_HISTORY.md`, `src/styles/DESIGN_GUIDE.md`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical (breaks design system contract) | 6 |
| Major (visible inconsistency) | 9 |
| Minor (polish / cleanup) | 7 |
| **Total Issues** | **22** |

---

## CRITICAL Issues

### C-1: Input Height Inconsistency (`py-2.5` rule violated)

**Standard**: All inputs MUST use `py-2.5` (10px vertical padding)

| File | Line | Actual | Expected |
|------|------|--------|----------|
| `InvoiceItemsStep.tsx` | 207 | `py-2` | `py-2.5` |
| `InvoiceDetailsStep.tsx` | 131, 146, 157, 169 | `py-2` | `py-2.5` |
| `InvoicePreviewStep.tsx` | 180, 194, 208, 222, 253, 265, 278 | `py-1.5` | `py-2.5` |
| `InvoiceDetailsStep.tsx` | 618 | Button `py-2` | `py-2.5` |

**Impact**: Delivery options fields and e-invoice fields are shorter than the rest of the form. Breaks visual rhythm.

---

### C-2: Native HTML Elements Instead of Global Components

**Standard**: Always use global components — never create inline implementations.

| File | Line | Issue | Should Use |
|------|------|-------|------------|
| `InvoiceItemsStep.tsx` | 195-218 | Native `<select>` for M.R. | `Select` from global |
| `InvoiceDetailsStep.tsx` | 127-137 | Native `<select>` for Delivery Type | `Select` from global |
| `InvoiceDetailsStep.tsx` | 248-263, 349-372 | Native `<select>` for Payment Method | `Select` from global |
| `InvoiceDetailsStep.tsx` | 267-286, 376-381 | Native `<input type="number">` for amounts | `NumberInput` or `CurrencyInput` |
| `InvoiceDetailsStep.tsx` | 221-232 | Hand-coded toggle switch | Need global `Toggle`/`Switch` component |

**Impact**: Inconsistent styling, no searchability, no keyboard accessibility from global components.

---

### C-3: ProductSearch Missing White Card Wrapper

**Standard** (ui-design-standards.md §4): Entity searches MUST be wrapped in `bg-white rounded-lg border border-gray-200 p-4`.

```
InvoiceItemsStep.tsx:263 — ProductSearch is NOT wrapped
InvoiceItemsStep.tsx:237 — CustomerSearch IS wrapped ✓
```

**Impact**: ProductSearch and CustomerSearch look different within the same step. Direct violation of the entity search standard.

---

### C-4: "Create Product" Button Missing `min-w-[140px]`

**Standard** (ui-design-standards.md §3): Create entity buttons need `min-w-[140px]` for consistent width.

```
InvoiceItemsStep.tsx:231 — Create Customer: has min-w-[140px] ✓
InvoiceItemsStep.tsx:257 — Create Product: MISSING min-w-[140px] ✗
```

**Impact**: Create buttons are different widths in the same form.

---

### C-5: Focus Ring Pattern Inconsistency

**Standard**: `focus:ring-2 focus:ring-{color}-500 focus:border-transparent`

| File | Actual | Issue |
|------|--------|-------|
| `InvoiceItemsStep.tsx:207` | `focus:border-blue-500` | Should be `focus:border-transparent` |
| `InvoiceDetailsStep.tsx:131` | `focus:border-blue-500` | Should be `focus:border-transparent` |
| `InvoicePreviewStep.tsx:180+` | `focus:ring-orange-500 focus:border-orange-500` | Wrong color + not transparent |

**Impact**: Different focus behaviors across the flow.

---

### C-6: Two Toast Systems Coexisting

**Standard**: Use one toast system consistently.

```
InvoiceFlow.tsx: import { toast } from 'react-toastify'    ← External library
Global library: useToast() hook with ToastProvider          ← Custom system
```

Both systems render simultaneously. Only one should be used across the app.

---

## MAJOR Issues

### M-1: Label Style Inconsistency (3 Different Patterns)

| Location | Style | Pattern |
|----------|-------|---------|
| Step 1 (M.R.) | `text-sm font-medium text-gray-600 mb-2` | Pattern A |
| Step 2 (Delivery) | `text-xs font-medium text-gray-500 mb-1` | Pattern B |
| Step 2 (Payment) | `text-sm font-medium text-gray-700 mb-2` | Pattern C |
| Step 3 (E-invoice) | `text-xs font-medium text-blue-700 mb-1` | Pattern D |

**Standard**: Labels should be `text-sm font-medium text-gray-700` with `mb-2`. Four different label styles in a 3-step flow.

---

### M-2: Section Header Pattern Mismatch

| Location | Pattern |
|----------|---------|
| Step 1 | `text-sm font-semibold text-blue-700 uppercase tracking-wider` + icon |
| Step 2 | Numbered circle (`w-8 h-8 bg-blue-100 rounded-full`) + `text-lg font-semibold text-gray-800` |
| Step 3 (Notes) | `text-xs font-bold text-gray-800 uppercase` |

Three completely different section header patterns within one invoice flow.

---

### M-3: Step 2 Footer Not Using DocumentFooter

- Step 1: Uses `DocumentFooter` component ✓
- Step 2: **Hand-coded footer** at `InvoiceDetailsStep.tsx:584-623`
- Step 3: Uses `DocumentFooter` component ✓

The custom footer uses `justify-between` (not `justify-end`), and the Continue button uses `py-2` instead of the standard `py-2.5`.

---

### M-4: Content Background Inconsistency Across Steps

| Step | Background |
|------|------------|
| Step 1 | `bg-blue-50` ✓ |
| Step 2 | `bg-blue-50` ✓ |
| Step 3 (content area) | `bg-white` ✗ |

**Standard**: Transaction flows should use `bg-blue-50` consistently. Step 3 switches to white background.

---

### M-5: InvoiceList Background Color Wrong

**Standard** (ui-design-standards.md §6): List/Dashboard pages use `bg-gray-50`. Transaction flows use `bg-blue-50`.

```
InvoiceList.tsx:566 — bg-blue-50  ✗ (this is a LIST page, should be bg-gray-50)
```

**Note**: DESIGN_PRINCIPLES_HISTORY.md §4 says "Background: bg-blue-50 for consistency" which contradicts ui-design-standards.md §6. **These two docs disagree** — needs resolution.

---

### M-6: Toggle Switch Uses Non-Standard Color

```
InvoiceDetailsStep.tsx:222 — bg-indigo-600 (active toggle color)
```

The app color system uses `blue-600` for primary actions. `indigo-600` is not in the color system.

---

### M-7: Card Border Radius Inconsistency

| Location | Radius |
|----------|--------|
| Step 1 (Customer card) | `rounded-lg` |
| Step 2 (Delivery/Payment cards) | `rounded-xl` + `shadow-sm` |
| Step 3 (Notes card) | `rounded-lg` |
| InvoiceTable wrapper | `rounded-lg` |

Mixed `rounded-lg` and `rounded-xl` within the same flow. The design system says cards use `rounded-lg` (8px) for modals/dropdowns, `rounded-xl` (12px) for large cards. Need clear rule for form section cards.

---

### M-8: Duplicate Component Files

Orphaned/duplicate files that add confusion:

| Active | Duplicate/Orphaned |
|--------|-------------------|
| `invoicelist/components/InvoiceTable.tsx` | `components/InvoiceTable.tsx` |
| `invoicelist/components/InvoiceBulkActions.tsx` | `components/InvoiceBulkActions.tsx` |
| `invoicelist/components/InvoiceFilters.tsx` | `components/InvoiceFilters.tsx` |
| `InvoiceList.tsx` | `InvoiceList-NEW.tsx` |

4 orphaned files should be deleted.

---

### M-9: Padding Inconsistency in Step 3

```
InvoicePreviewStep.tsx:63 — px-8 py-6 (Step 3 content)
InvoiceItemsStep.tsx:170 — px-6 py-6 (Step 1 content)
InvoiceDetailsStep.tsx:65 — px-6 py-6 (Step 2 content)
```

Step 3 uses `px-8` while Steps 1 and 2 use `px-6`. Standard is `px-6`.

---

## MINOR Issues

### m-1: Console.log Statements in Production Code

| File | Count | Examples |
|------|-------|---------|
| `InvoiceDetailsStep.tsx` | 2 | `console.log('[Invoice] Address changed:')` |
| `InvoiceFlow.tsx` | 8+ | `console.log('🔄 [STEP 1→2]')`, `console.log('✅')` |
| `InvoiceList.tsx` | 5+ | `console.log('[Invoice API]')`, `console.log('Invoice details:')` |

Should be removed or gated behind a debug flag.

---

### m-2: Excessive `as any` Type Casting

`InvoiceFlow.tsx` has **25+ instances** of `as any`, bypassing TypeScript safety:
```tsx
invoice={invoice as any}
setInvoice={setInvoice as any}
selectedCustomer={selectedCustomer as any}
```

Indicates a type definition mismatch between the hook and step components.

---

### m-3: Missing ARIA Attributes

| Element | File | Issue |
|---------|------|-------|
| Split Payment toggle | `InvoiceDetailsStep.tsx:221` | No `role="switch"`, no `aria-label`, no `aria-checked` |
| Table action buttons | `InvoiceTable.tsx:258-288` | Uses `title` only, no `aria-label` |
| Checkboxes | `InvoiceTable.tsx:140-152` | No `aria-label` for select/deselect |
| Error dismiss button | `InvoiceItemsStep.tsx:159-164` | No `aria-label="Dismiss error"` |

**Standard** (design-system.md §Accessibility): All interactive elements need ARIA labels.

---

### m-4: Inline IIFE Calculations in JSX

```tsx
// InvoiceDetailsStep.tsx:588-607
{(() => {
    const totalPaid = (invoice.payments || []).reduce(...)
    // ... complex calculation in render
})()}
```

Should be extracted to `useMemo` for readability and performance.

---

### m-5: Error Banner Dismiss Button Hover State

```tsx
// InvoiceItemsStep.tsx:162
className="ml-auto hover:opacity-70"  // Weak hover feedback
```

Should use `hover:bg-red-100 rounded-lg p-1` for consistent interactive feedback.

---

### m-6: ModuleHeader `historyType` Prop on Create Flow

```tsx
// InvoiceItemsStep.tsx:127
historyType="invoice"  // Shows History button on CREATE page
```

Per DESIGN_PRINCIPLES_HISTORY.md §1: "No History button when already on history page." The create flow probably shouldn't show this either since it navigates away from the flow.

---

### m-7: Empty `onSaveDraft` Handler

```tsx
// InvoiceItemsStep.tsx:129-131
showSaveDraft={true}
onSaveDraft={() => {
    // TODO: Implement save draft
}}
```

Shows a non-functional button. Either implement or hide with `showSaveDraft={false}`.

---

## Design Principle Gaps Identified

Issues that reveal **missing or conflicting principles** in the design docs:

### GAP-1: No Global Toggle/Switch Component
The toggle in InvoiceDetailsStep is hand-coded. Need a global `Toggle` or `Switch` component with standardized sizes, colors, and ARIA attributes.

### GAP-2: List Page Background Color Contradiction
- `ui-design-standards.md §6` says: List pages = `bg-gray-50`
- `DESIGN_PRINCIPLES_HISTORY.md §4` says: "Background: `bg-blue-50` for consistency"
- **Need single source of truth decision**.

### GAP-3: No "Step Flow" Design Pattern Documented
The 3-step invoice flow has no documented pattern for:
- Should section headers be consistent across steps?
- Should all steps share the same footer component?
- Should content background be the same across all steps?
- Step indicator/progress bar pattern

### GAP-4: No Card Radius Standard for Form Sections
The design system defines `rounded-lg` (8px) and `rounded-xl` (12px) but doesn't specify which to use for form section cards within transaction flows.

### GAP-5: No Toast System Decision
Two toast systems exist. Need to document which one to use and deprecate the other.

### GAP-6: No Console.log Policy
No guideline about debug logging in production code.

### GAP-7: No TypeScript `as any` Policy
Rampant type casting indicates need for a TypeScript strictness guideline.

### GAP-8: Native HTML Elements Policy Not Enforced
The standard says "use global components" but there's no enforcement or lint rule. Need to clarify: when is a native `<select>` acceptable vs. when must you use `<Select>`?

---

## Recommended Fixes Priority

### Immediate (before next release)
1. Fix input heights to `py-2.5` across all steps
2. Wrap ProductSearch in white card wrapper
3. Add `min-w-[140px]` to Create Product button
4. Fix focus ring pattern to use `focus:border-transparent`
5. Fix Step 3 content background to `bg-blue-50`
6. Fix Step 3 horizontal padding to `px-6`

### Short-term (next sprint)
7. Replace native `<select>` with global `Select` component
8. Standardize label styles across all steps
9. Create and use `DocumentFooter` in Step 2
10. Standardize section header pattern across steps
11. Delete orphaned duplicate files
12. Fix toggle color from `indigo-600` to `blue-600`

### Medium-term (design system improvements)
13. Create global `Toggle`/`Switch` component
14. Resolve list page background color contradiction in docs
15. Document "Step Flow" design pattern
16. Consolidate toast systems (pick one)
17. Add card radius standard for form sections
18. Remove console.log statements, add debug logging guidelines
19. Fix TypeScript types to eliminate `as any` casting
20. Add ARIA attributes to interactive elements

---

## Files Audited

| File | Lines | Issues Found |
|------|-------|-------------|
| `InvoiceItemsStep.tsx` | 396 | 6 |
| `InvoiceDetailsStep.tsx` | 631 | 10 |
| `InvoicePreviewStep.tsx` | 321 | 5 |
| `InvoiceFlow.tsx` | 471 | 4 |
| `InvoiceList.tsx` | 691 | 3 |
| `InvoiceTable.tsx` | 316 | 2 |
| `InvoiceBulkActions.tsx` | 52 | 0 (clean!) |

---

**Next Module to Audit**: Sales Returns, Purchase, or Payment (recommend Sales Returns since it closely mirrors Invoice flow)
