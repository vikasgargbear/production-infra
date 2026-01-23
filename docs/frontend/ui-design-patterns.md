# PharmaERP UI Design Patterns

Standard UI patterns and conventions for consistent UI across the application.

---

## Entity Search Pattern

When implementing entity search (Customer, Supplier, Product), follow this standard layout:

### Standard Pattern (Recommended)

```
┌─────────────────────────────────────────────────────┐
│ 📋 CUSTOMER                                          │  ← Outer label (uppercase, with icon)
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🔍 Search customer by name, phone, or code...   │ │  ← Search input (compact mode)
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Implementation

```tsx
{/* Outer label - ALWAYS visible before selection */}
<div className="flex items-center gap-2 mb-3">
  <User className="w-4 h-4 text-gray-500" />
  <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">
    CUSTOMER
  </span>
</div>

{/* Light background container */}
<div className="rounded-xl p-4 bg-blue-50">  {/* Use bg-green-50 for Supplier */}
  <CustomerSearch
    value={selectedCustomer}
    onChange={setSelectedCustomer}
    displayMode="compact"  // ← Critical: hides duplicate inner label
    clearable={true}
  />
</div>
```

### Key Rules

1. **Outer Label**: Always add an outer `CUSTOMER` or `SUPPLIER` label with icon
2. **Background Container**: 
   - Customer: `bg-blue-50` (light blue)
   - Supplier: `bg-green-50` (light green/mint)
3. **displayMode**: Use `"compact"` to hide the inner label in EntitySearch
4. **No Duplication**: Never show both outer label AND inner EntitySearch label

---

## Selected Party Tile Pattern

When displaying a selected entity (customer/supplier), use this condensed format:

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [S]  Super Medical Store                              🗑️    │
│      GST: 27AAUFM1756H1ZE                                   │
│      📞 8949228635  📍 Jaipur                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Rules

1. **Avatar**: Blue circle with first letter of name
2. **Info Stack**: Name → GST → Phone/City (one line each)
3. **Actions**: Only delete button in tile; other actions (WhatsApp, Email) go in action row
4. **Icons**: Use emoji for phone (📞) and location (📍) for visual clarity

---

## Action Buttons Pattern

Action buttons (PDF, Excel, Print, WhatsApp) should be in a dedicated row:

### Layout

```
[Last 3 Months ▼] [📅 10/22/2025] to [📅 01/22/2026] [All Types ▼]     [WhatsApp] [PDF] [Excel] [Print]
```

### Key Rules

1. **Position**: Right side of filter row, separated by flex spacer
2. **Order**: Communication (WhatsApp) → Export (PDF, Excel) → Print
3. **Styling**: Solid colored buttons with icons and text labels
4. **Conditional**: Only show WhatsApp if party has phone number

---

## Summary Cards Pattern

Dashboard-style summary tiles use dark background:

### Layout

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Total Debit     │ │ Total Credit    │ │ Net Balance     │ │ Transactions    │
│ ₹2539.80        │ │ ₹45.00          │ │ ₹0.00           │ │ 35              │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
     (dark bg)           (dark bg)           (dark bg)           (dark bg)
```

### Styling

```tsx
<div className="bg-gray-900 rounded-lg px-4 py-3">
  <span className="text-xs text-gray-400 block mb-1">Total Debit</span>
  <span className="text-lg font-bold text-white">₹2539.80</span>
</div>
```

### Key Rules

1. **Background**: `bg-gray-900` (dark)
2. **Label**: `text-xs text-gray-400` (subtle gray)
3. **Value**: `text-lg font-bold text-white` (bold white)
4. **Layout**: Label stacked above value

---

## Module Header Pattern

### Standard Header

```
Party Ledger                                                    [Refresh]  [×]
```

### Rules

1. **No History Button**: Remove unless specifically needed
2. **Refresh**: Text only, no spinning icon
3. **Simple Actions**: Keep action list minimal

---

## Print Template Guidelines

1. **No Total Row**: Totals confuse users on multi-page prints
2. **Summary Section**: Show totals in footer summary instead
3. **Column Count**: Match colspan to actual visible columns
