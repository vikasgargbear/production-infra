# Global Color System

## Overview

Our application uses a consistent, WhatsApp/ChatGPT-inspired color system that provides visual hierarchy and module recognition while maintaining a clean, professional appearance.

## Color Palette

### Neutral Colors (`app-*`)
Used for text, borders, backgrounds, and general UI elements:

```css
app-50   #fafafa   /* Lightest background */
app-100  #f5f5f5   /* Light gray background */
app-200  #e5e5e5   /* Border gray */
app-300  #d4d4d4   /* Disabled gray */
app-400  #a3a3a3   /* Secondary text */
app-500  #737373   /* Primary text light */
app-600  #525252   /* Primary text */
app-700  #404040   /* Primary text dark */
app-800  #262626   /* Heading text */
app-900  #171717   /* Black text */
```

### Primary Brand (`primary-*`)
Used for primary actions, buttons, links:

```css
primary-500  #3b82f6   /* Main primary color */
primary-600  #2563eb   /* Hover state */
primary-700  #1d4ed8   /* Active state */
```

### Module-Specific Colors

#### Sales (`sales-*` - Green)
```css
sales-500  #22c55e   /* Sales actions */
sales-600  #16a34a   /* Sales hover */
```

#### Purchase (`purchase-*` - Purple)
```css
purchase-500  #d857ff   /* Purchase actions */
purchase-600  #b83aeb   /* Purchase hover */
```

#### Payment (`payment-*` - Emerald)
```css
payment-500  #10b981   /* Payment actions */
payment-600  #059669   /* Payment hover */
```

#### Delivery (`delivery-*` - Amber)
```css
delivery-500  #f59e0b   /* Delivery actions */
delivery-600  #d97706   /* Delivery hover */
```

### Status Colors

#### Success (`success-*`)
```css
success-500  #22c55e   /* Success states */
success-100  #dcfce7   /* Success backgrounds */
```

#### Warning (`warning-*`)
```css
warning-500  #f59e0b   /* Warning states */
warning-100  #fef3c7   /* Warning backgrounds */
```

#### Danger (`danger-*`)
```css
danger-500   #ef4444   /* Error states */
danger-100   #fee2e2   /* Error backgrounds */
```

## Usage Guidelines

### Component-Level Usage

#### General Components
- **Headers**: `text-app-800`, `bg-white`, `border-app-200`
- **Body text**: `text-app-700`
- **Secondary text**: `text-app-500`
- **Borders**: `border-app-200`
- **Backgrounds**: `bg-app-50` (page), `bg-white` (cards)

#### Module-Specific Components

##### Sales Components
```tsx
// Primary elements
className="bg-sales-600 text-white hover:bg-sales-700"

// Secondary elements  
className="text-sales-600 bg-sales-50"

// Icons and accents
className="text-sales-500"
```

##### Purchase Components
```tsx
// Primary elements
className="bg-purchase-600 text-white hover:bg-purchase-700"

// Secondary elements
className="text-purchase-600 bg-purchase-50"
```

##### Payment Components
```tsx
// Primary elements
className="bg-payment-600 text-white hover:bg-payment-700"

// Secondary elements
className="text-payment-600 bg-payment-50"
```

##### Delivery/Challan Components
```tsx
// Primary elements
className="bg-delivery-600 text-white hover:bg-delivery-700"

// Secondary elements
className="text-delivery-600 bg-delivery-50"
```

### Status Indicators

```tsx
// Success
className="bg-success-100 text-success-800 border-success-200"

// Warning
className="bg-warning-100 text-warning-800 border-warning-200"

// Error
className="bg-danger-100 text-danger-800 border-danger-200"
```

### Tables and Data Display

```tsx
// Headers
className="bg-app-50 text-app-500 border-app-200"

// Cells
className="text-app-700 border-app-100"

// Hover states
className="hover:bg-app-100"

// Striped rows
className="even:bg-app-50"
```

## Migration from Old Colors

When updating existing components, replace:

```css
/* OLD → NEW */

/* Neutral colors */
gray-50 → app-50
gray-100 → app-100
gray-200 → app-200
gray-500 → app-500
gray-600 → app-600
gray-700 → app-700
gray-800 → app-800
gray-900 → app-900

/* Primary actions */
blue-500 → primary-500
blue-600 → primary-600
blue-700 → primary-700

/* Module colors (context-dependent) */
green-500 → sales-500 (in sales components)
purple-500 → purchase-500 (in purchase components)
emerald-500 → payment-500 (in payment components)
amber-500 → delivery-500 (in delivery components)

/* Status colors */
green-500 → success-500 (for success states)
red-500 → danger-500 (for error states)
yellow-500 → warning-500 (for warning states)
```

## Design Principles

1. **Consistency**: All components use the same neutral color scale (`app-*`)
2. **Recognition**: Each business module has a distinct color identity
3. **Hierarchy**: Color intensity indicates importance and interaction states
4. **Accessibility**: All color combinations meet WCAG contrast requirements
5. **Scalability**: Easy to add new modules or adjust colors globally

## Examples

### Button Variants
```tsx
// Primary button
<button className="bg-primary-600 text-white hover:bg-primary-700">

// Sales module button
<button className="bg-sales-600 text-white hover:bg-sales-700">

// Neutral button
<button className="bg-app-100 text-app-700 hover:bg-app-200">

// Danger button
<button className="bg-danger-600 text-white hover:bg-danger-700">
```

### Card Components
```tsx
<div className="bg-white border border-app-200 rounded-lg">
  <div className="bg-app-50 px-4 py-3 border-b border-app-200">
    <h3 className="text-app-800 font-semibold">Card Header</h3>
  </div>
  <div className="p-4">
    <p className="text-app-700">Card content</p>
    <p className="text-app-500 text-sm">Secondary text</p>
  </div>
</div>
```

This color system ensures a cohesive, professional appearance while helping users quickly identify which module they're working in.