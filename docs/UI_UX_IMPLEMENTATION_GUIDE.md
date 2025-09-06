# UI/UX Implementation Guide

## Core Principles

### 1. Section Layout Pattern
**ALWAYS place section titles OUTSIDE the tiles/cards** to save space and improve visual hierarchy.

#### ❌ Wrong Way:
```jsx
<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
  <h3 className="text-lg font-medium text-gray-900 mb-4">
    <Icon className="w-5 h-5 mr-2" />
    Section Title
  </h3>
  {/* Content */}
</div>
```

#### ✅ Correct Way:
```jsx
<div className="mb-6">
  <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
    <Icon className="w-5 h-5 mr-2 text-blue-600" />
    Section Title
  </h3>
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    {/* Content */}
  </div>
</div>
```

**Benefits:**
- Saves vertical space inside cards
- Creates clear visual hierarchy
- Improves scannability
- Consistent with modern UI patterns

### 2. Auto-Focus Flow Pattern
**Implement streamlined user flows with automatic focus progression**

#### Implementation Example:
```jsx
// When user selects an option, auto-focus next input
const handleTypeSelection = (type) => {
  setSelectedType(type);
  // Auto-focus next element after selection
  setTimeout(() => {
    const nextElement = document.querySelector('[data-next-input]');
    if (nextElement) nextElement.focus();
  }, 100);
};

// Chain focus through form elements
<Select
  data-reason-select
  autoFocus
  onChange={(value) => {
    setReason(value);
    if (value) {
      // Move to next input automatically
      setTimeout(() => {
        document.querySelector('[data-date-picker]')?.focus();
      }, 100);
    }
  }}
/>
```

**Benefits:**
- Reduces clicks/taps
- Speeds up data entry
- Improves accessibility
- Creates intuitive flow

### 3. Title Bar Actions Pattern
**Place action buttons in title bar for better space usage**

#### Implementation:
```jsx
<div className="mb-6">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-lg font-medium text-gray-900 flex items-center">
      <Icon className="w-5 h-5 mr-2 text-blue-600" />
      Section Title
    </h3>
    <div className="flex gap-2">
      <button className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
        <Plus className="w-4 h-4" />
        <span>Add Item</span>
      </button>
      <button className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">
        <Upload className="w-4 h-4" />
        <span>Bulk Upload</span>
      </button>
    </div>
  </div>
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
    {/* Content */}
  </div>
</div>
```

**Benefits:**
- Saves space inside cards
- Actions immediately visible
- Better visual hierarchy
- Consistent with modern UI patterns

### 4. Enterprise Constants Pattern
**Never hardcode values - use centralized constants**

#### File Structure:
```
/src/constants/
  ├── stockAdjustment.js
  ├── orderStatus.js
  ├── paymentMethods.js
  └── index.js
```

#### Example Implementation:
```jsx
// constants/stockAdjustment.js
export const ADJUSTMENT_TYPES = {
  INCREASE: 'increase',
  DECREASE: 'decrease'
};

export const ADJUSTMENT_REASONS = {
  increase: [
    { value: 'gift', label: 'Gift/Free Sample Received' },
    { value: 'transfer_in', label: 'Transfer from Another Location' }
  ],
  decrease: [
    { value: 'damaged', label: 'Damaged Goods' },
    { value: 'expired', label: 'Expired Products' }
  ]
};

// Component usage
import { ADJUSTMENT_REASONS } from '../../constants/stockAdjustment';

const reasons = ADJUSTMENT_REASONS[adjustmentType];
```

### 5. Conditional Display Pattern
**Show only relevant options based on user selections**

```jsx
// Show only relevant reasons based on adjustment type
{adjustmentType && (
  <Select
    options={ADJUSTMENT_REASONS[adjustmentType]}
  />
)}

// Clear dependent fields when parent changes
const handleTypeChange = (newType) => {
  setType(newType);
  setReason(''); // Clear dependent field
  setItems([]);   // Reset items
};
```

### 6. Visual Feedback Pattern
**Provide immediate visual feedback for user actions**

```jsx
// Active state styling
className={`flex-1 p-3 rounded-lg border-2 transition-all ${
  isActive
    ? 'border-green-500 bg-green-50 text-green-700'
    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
}`}

// Loading states
{isLoading && (
  <div className="text-center py-8">
    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
    <p className="text-gray-600">Processing...</p>
  </div>
)}
```

## Component Structure Guidelines

### 1. Document Flow Components
```jsx
<EnhancedGlobalDocumentFlow
  documentType="stock-adjustment"  // Configure in documentConfigs
  currentStep={currentStep}
  createContent={createContent}     // Step 1 content
  reviewContent={reviewContent}     // Step 2 content
  keyboardShortcuts={{
    'Ctrl+A': 'Add Item',
    'Ctrl+S': 'Save',
    'Esc': 'Close'
  }}
/>
```

### 2. Form Section Structure
```jsx
// Multiple sections with consistent structure
<div className="space-y-6">
  {/* Section 1 */}
  <div className="mb-6">
    <h3 className="text-lg font-medium text-gray-900 mb-3">Section Title</h3>
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Section content */}
    </div>
  </div>

  {/* Section 2 - Conditional */}
  {condition && (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-3">Conditional Section</h3>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Section content */}
      </div>
    </div>
  )}
</div>
```

### 3. Keyboard Shortcuts
- Define shortcuts at component level, not inline
- Use EnhancedGlobalDocumentFlow's keyboardShortcuts prop
- Avoid duplicate shortcut displays

## Best Practices Checklist

- [ ] Section titles outside cards
- [ ] Auto-focus progression implemented
- [ ] Constants used instead of hardcoded values
- [ ] Conditional display based on user selections
- [ ] Clear visual feedback for all actions
- [ ] Keyboard shortcuts properly configured
- [ ] Loading states for async operations
- [ ] Error states with clear messages
- [ ] Consistent spacing (mb-6 for sections, mb-3 for titles)
- [ ] Icons with consistent colors (text-blue-600 for primary)

## Common Patterns

### Selection → Action Flow
1. User selects primary option (e.g., adjustment type)
2. Auto-focus moves to dependent field (e.g., reason)
3. Previous selections cleared when changing primary option
4. Show only relevant options at each step

### Progressive Disclosure
1. Start with minimal required fields
2. Show additional options based on selections
3. Hide complex features until needed
4. Use conditional rendering extensively

### Data Attribute Pattern
Use data attributes for targeting elements programmatically:
```jsx
<Select data-reason-select />
<DatePicker data-date-picker />
<button data-add-product />
```

This enables reliable element selection for auto-focus and testing.

## Migration Guide

When updating existing components:

1. **Identify nested titles** - Look for h3/h4 inside cards
2. **Extract titles** - Move them outside the card wrapper
3. **Add wrapper div** - Create mb-6 wrapper for section
4. **Update spacing** - Use mb-3 for title, p-6 for card content
5. **Add auto-focus** - Implement focus progression
6. **Extract constants** - Move hardcoded values to constants files
7. **Test flow** - Verify smooth user progression

## Examples from Codebase

### Stock Adjustment Flow
- Titles outside cards for "Adjustment Details" and "Products to Adjust"
- Auto-focus from type → reason → date → products
- Constants for adjustment types and reasons
- Conditional display of reason dropdown

### Invoice Flow
- Progressive disclosure of payment options
- Auto-focus through customer → products → payment
- Section titles outside cards consistently

### Product Master
- Dynamic loading of categories/types from API
- Fallback to empty arrays (no hardcoding)
- Clear separation of sections with titles outside

---

*This guide should be followed for all new component development and when refactoring existing components.*