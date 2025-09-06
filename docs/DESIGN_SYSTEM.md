# Enterprise Design System Guide

## Color System

### Primary Palette
```css
/* Brand Colors */
primary-500: #3b82f6   /* Main actions */
primary-600: #2563eb   /* Hover state */
primary-700: #1d4ed8   /* Active state */

/* Module Colors */
sales-500: #22c55e     /* Sales (Green) */
purchase-500: #d857ff  /* Purchase (Purple) */
payment-500: #10b981   /* Payment (Emerald) */
inventory-500: #f59e0b /* Inventory (Amber) */
reports-500: #ef4444   /* Reports (Red) */

/* Neutral Scale */
gray-50: #fafafa      /* Lightest background */
gray-100: #f5f5f5     /* Light background */
gray-200: #e5e5e5     /* Border color */
gray-300: #d4d4d4     /* Disabled state */
gray-400: #a3a3a3     /* Placeholder text */
gray-500: #737373     /* Secondary text */
gray-600: #525252     /* Primary text */
gray-700: #404040     /* Emphasized text */
gray-800: #262626     /* Headings */
gray-900: #171717     /* Darkest text */

/* Status Colors */
success: #22c55e      /* Success, valid */
warning: #f59e0b      /* Warning, attention */
danger: #ef4444       /* Error, critical */
info: #3b82f6         /* Information */
```

### Usage Guidelines
- **Primary actions**: Use module-specific colors
- **Secondary actions**: Use gray scale
- **Destructive actions**: Use danger/red
- **Success states**: Use success/green
- **Loading states**: Use primary-500 with animation

## Typography

### Font Scale
```css
text-xs: 0.75rem      /* 12px - Labels, captions */
text-sm: 0.875rem     /* 14px - Body small, help text */
text-base: 1rem       /* 16px - Body default */
text-lg: 1.125rem     /* 18px - Subheadings */
text-xl: 1.25rem      /* 20px - Section headings */
text-2xl: 1.5rem      /* 24px - Page titles */
```

### Font Weights
```css
font-normal: 400      /* Body text */
font-medium: 500      /* Emphasized text */
font-semibold: 600    /* Subheadings */
font-bold: 700        /* Headings */
```

### Text Colors
- **Primary text**: `text-gray-900` or `text-gray-800`
- **Secondary text**: `text-gray-600`
- **Disabled text**: `text-gray-400`
- **Link text**: `text-blue-600 hover:text-blue-700`
- **Error text**: `text-red-600`

## Spacing System

### Base Unit: 4px (0.25rem)
```css
/* Common spacing values */
space-0: 0
space-1: 0.25rem     /* 4px */
space-2: 0.5rem      /* 8px */
space-3: 0.75rem     /* 12px */
space-4: 1rem        /* 16px */
space-5: 1.25rem     /* 20px */
space-6: 1.5rem      /* 24px */
space-8: 2rem        /* 32px */
```

### Padding Guidelines
- **Cards/Tiles**: `p-4` or `p-6`
- **Buttons**: `px-4 py-2` (default), `px-3 py-1.5` (small)
- **Input fields**: `px-3 py-2`
- **Modals**: `p-6`

### Margin Guidelines
- **Between sections**: `mb-6`
- **Between cards**: `mb-4`
- **Between form fields**: `mb-4`
- **Between labels and inputs**: `mb-2`
- **Section titles**: `mb-3`

## Component Patterns

### Card/Tile Structure
```jsx
<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
  {/* Content */}
</div>
```

### Input Fields
```jsx
<input
  type="text"
  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
  placeholder="Enter value..."
/>
```

### Buttons

#### Primary Button
```jsx
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
  Primary Action
</button>
```

#### Secondary Button
```jsx
<button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
  Secondary Action
</button>
```

#### Small Button (Title Bar)
```jsx
<button className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
  <Icon className="w-4 h-4 mr-1" />
  Action
</button>
```

### Status Badges
```jsx
/* Success */
<span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
  Active
</span>

/* Warning */
<span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded">
  Pending
</span>

/* Danger */
<span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
  Expired
</span>
```

## Icons

### Size Guidelines
- **In buttons**: `w-4 h-4` (16px)
- **In headers**: `w-5 h-5` (20px)
- **Standalone**: `w-6 h-6` (24px)
- **Large/Empty states**: `w-12 h-12` (48px)

### Color Guidelines
- **Primary icons**: `text-blue-600`
- **Success icons**: `text-green-600`
- **Warning icons**: `text-amber-600`
- **Danger icons**: `text-red-600`
- **Neutral icons**: `text-gray-400` or `text-gray-600`

## Responsive Design

### Breakpoints
```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Grid System
```jsx
/* Responsive columns */
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Items */}
</div>

/* Responsive flex */
<div className="flex flex-col md:flex-row gap-4">
  {/* Items */}
</div>
```

## Animation & Transitions

### Standard Transitions
```css
transition-all     /* All properties */
transition-colors  /* Color changes */
transition-opacity /* Fade effects */
transition-transform /* Scale/rotate */

/* Duration */
duration-150  /* Fast (150ms) */
duration-200  /* Default (200ms) */
duration-300  /* Slow (300ms) */
```

### Loading States
```jsx
<Loader2 className="w-6 h-6 animate-spin text-blue-600" />
```

### Hover Effects
- **Links**: Color change + underline
- **Buttons**: Darker background
- **Cards**: Slight shadow increase
- **Table rows**: Light background

## Accessibility

### Focus States
- All interactive elements must have visible focus states
- Use `focus:ring-2 focus:ring-blue-500` for buttons
- Use `focus:border-blue-500` for inputs

### ARIA Labels
- Add descriptive labels to icon-only buttons
- Use proper heading hierarchy (h1 → h2 → h3)
- Include alt text for images

### Keyboard Navigation
- Ensure all actions are keyboard accessible
- Implement proper tab order
- Provide keyboard shortcuts for common actions

## Forms

### Form Layout
```jsx
<form className="space-y-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Field Label
    </label>
    <input className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
    <p className="mt-1 text-sm text-gray-500">Help text</p>
  </div>
</form>
```

### Validation States

#### Error State
```jsx
<div>
  <input className="border-red-300 focus:ring-red-500 focus:border-red-500" />
  <p className="mt-1 text-sm text-red-600">Error message</p>
</div>
```

#### Success State
```jsx
<div>
  <input className="border-green-300 focus:ring-green-500 focus:border-green-500" />
  <p className="mt-1 text-sm text-green-600">Success message</p>
</div>
```

## Tables

### Basic Table
```jsx
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <tr>
      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Column
      </th>
    </tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200">
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">
        Data
      </td>
    </tr>
  </tbody>
</table>
```

## Modals

### Modal Structure
```jsx
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
  <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
    <div className="px-6 py-4 border-b border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900">Modal Title</h2>
    </div>
    <div className="px-6 py-4">
      {/* Content */}
    </div>
    <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
      <button className="px-4 py-2 border border-gray-300 rounded-lg">
        Cancel
      </button>
      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">
        Confirm
      </button>
    </div>
  </div>
</div>
```

## Best Practices

### Do's
- ✅ Use consistent spacing
- ✅ Follow color guidelines
- ✅ Maintain visual hierarchy
- ✅ Provide feedback for all actions
- ✅ Use appropriate icon sizes
- ✅ Test on multiple screen sizes
- ✅ Ensure keyboard accessibility

### Don'ts
- ❌ Mix different button styles
- ❌ Use custom colors outside palette
- ❌ Create new spacing values
- ❌ Skip loading states
- ❌ Ignore focus states
- ❌ Use inline styles
- ❌ Hardcode values

---

*This design system ensures consistency across the entire application. All new components should follow these guidelines.*