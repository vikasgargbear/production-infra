# UI/UX Design Standards

This document defines the standard design tokens and patterns for all UI components to ensure consistency across the application.

---

## 1. Layout Standards

### Full-Page Flow Layouts
Used for: CustomerFlow, ProductFlow, SupplierFlow, InvoiceFlow

```
Container:     fixed inset-0 bg-gray-50 z-50
Content Width: max-w-4xl mx-auto
Padding:       px-6 (horizontal), py-4 (header/footer), py-6 (content)
```

### Header
```
Height:        py-4 (16px vertical padding)
Background:    bg-white border-b border-gray-200
Layout:        flex items-center justify-between
Button Align:  RIGHT (Save button on right side)
```

### Footer 
```
Height:        py-4 (16px vertical padding) - MUST match header
Background:    bg-white border-t border-gray-200
Layout:        flex items-center justify-end gap-3
Button Align:  RIGHT (Cancel + Save buttons on right)
Width:         NO max-w-4xl constraint (full width, buttons align to right edge)
```

---

## 2. Input Standards

### Form Input Heights
All form inputs MUST use consistent vertical padding:

```css
Standard Input:   py-2.5 (10px vertical padding)
Button Height:    py-2.5 (matches inputs)
Modal Inputs:     py-2.5 (same as standard)
```

### Input Styling
```css
Border:          border border-gray-300 rounded-lg
Focus:           focus:ring-2 focus:ring-{color}-500 focus:border-transparent
Full Class:      w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-{color}-500 focus:border-transparent
```

### Focus Ring Colors by Module
- Customers:  `focus:ring-blue-500` (blue theme)
- Products:   `focus:ring-green-500` (green theme)
- Suppliers:  `focus:ring-blue-500` (blue theme)
- Purchases:  `focus:ring-purple-500` (purple theme)
- Sales:      `focus:ring-blue-500` (blue theme)

---

## 3. Button Standards

### Primary Action Buttons
```css
Background:    bg-{color}-600 text-white
Hover:         hover:bg-{color}-700
Padding:       px-6 py-2.5
Border:        rounded-lg
Disabled:      disabled:opacity-50
Full Class:    px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors
```

### Secondary/Cancel Buttons
```css
Background:    bg-white (transparent)
Border:        border border-gray-300
Text:          text-gray-700
Hover:         hover:bg-gray-50
Padding:       px-6 py-2.5
Full Class:    px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors
```

### Create Entity Buttons (e.g., "Create Customer")
For CONSISTENT button widths across all entity creation buttons:
```css
Min Width:     min-w-[140px] (ensures all Create buttons have same width)
Padding:       px-4 py-2
Font:          text-sm font-medium
Full Class:    min-w-[140px] px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700
```

---

## 4. Search Component Standards

### EntitySearch (Global Standard)
ALL search components should use the same `EntitySearch` or follow this pattern:

```css
Container:     relative
Input:         w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg
Icon:          absolute left-3 top-1/2 -translate-y-1/2 text-gray-400
Dropdown:      absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg z-10
```

### Search Box Padding
```css
Section Padding:  p-4 (16px all sides) - consistent for ALL search sections
Search Row Gap:   gap-4 between label and search input
```

### Search Components to Consolidate
Instead of having multiple search components, use these global ones:
- `CustomerSearch` - for customer lookup
- `ProductSearch` - for product lookup  
- `SupplierSearch` - for supplier lookup
- `EntitySearch` - generic reusable base

**AVOID** creating inline search implementations. Always import from `global/search/`.

---

## 5. Section Standards

### Card/Section Containers
```css
Background:    bg-white
Border:        border border-gray-200 rounded-xl
Padding:       p-6
Spacing:       space-y-8 (between sections)
```

### Section Headers
```css
Font:          text-lg font-semibold text-gray-900
Icon:          w-5 h-5 text-{module-color}-600
Layout:        flex items-center gap-2
Margin:        mb-4
```

---

## 6. Spacing Standards

### Gap Between Elements
```css
Form Fields:     gap-4 (16px)
Section Gap:     space-y-8 (32px between sections)
Button Gap:      gap-3 (12px between Cancel/Save)
```

---

## 7. Color Palette by Module

| Module    | Primary Color | Focus Ring      | Icon Color      |
|-----------|---------------|-----------------|-----------------|
| Customer  | blue-600      | blue-500        | blue-600        |
| Product   | green-600     | green-500       | green-600       |
| Supplier  | blue-600      | blue-500        | blue-600        |
| Purchase  | purple-600    | purple-500      | purple-600      |
| Sales     | blue-600      | blue-500        | blue-600        |
| Invoice   | blue-600      | blue-500        | blue-600        |

---

## 8. Checklist for New Components

Before creating any new form/flow component, verify:

- [ ] Header py-4, right-aligned save button
- [ ] Footer py-4 (matches header), right-aligned buttons
- [ ] All inputs use py-2.5
- [ ] Content uses max-w-4xl mx-auto px-6
- [ ] Sections use bg-white rounded-xl border p-6
- [ ] Uses global search components (not inline implementations)
- [ ] Create buttons use min-w-[140px] for consistent width
- [ ] Focus ring matches module color theme

---

## 9. Anti-Patterns to Avoid

1. **Centered footer buttons** - Always right-align
2. **Inline search implementations** - Use global search components
3. **Mixed input heights** - All inputs py-2.5
4. **Variable button widths** - Use min-w-[140px] for Create buttons
5. **Full-width footer** - Should NOT use max-w-4xl (buttons align to right edge)
6. **Duplicate components** - Check global/ before creating new
