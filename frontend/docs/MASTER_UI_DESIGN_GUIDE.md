# Master UI Design Guide
*Last Updated: September 2024*

## 🎯 Core Principles

### 1. **No Redundancy**
- Never show the same information twice in the same view
- If information appears in a status badge, don't repeat it in text
- Example: Don't show "₹5.00 will go to credit" twice in payment UI

### 2. **Consistency Above All**
- Same data should display identically everywhere
- Font sizes, spacing, and formatting must match across similar components
- Example: Address display format should be identical whether billing or shipping

### 3. **Smart Space Utilization**
- Allocate field widths based on content needs
- Payment fields: 35% method, 35% amount, 30% reference
- Bank info gets more space than dates

### 4. **User-Friendly Inputs**
- All number inputs must allow clearing with backspace/delete
- Never force "0" that can't be deleted
- Empty states should be truly empty, not "0"

## 📐 Layout Standards

### Field Width Distribution
```
Split Payment:     35% | 35% | 30%
Address Forms:     Full width for address lines
Phone Fields:      With country code: 20% | 80%
Date Fields:       Standard HTML date input width
```

### Spacing Guidelines
- Section padding: `p-4` (16px)
- Section gap: `gap-4` (16px) 
- Inline elements: `gap-2` (8px)
- Form fields: `space-y-3` (12px vertical)
- Related info groups: `space-y-1` (4px)

### Typography Hierarchy
```css
Main Content:        text-sm (14px)
Labels:             text-xs font-semibold (12px bold)
Secondary Info:      text-xs text-gray-500 (12px)
Phone/Important:     text-xs font-medium (12px medium)
Totals/Headers:      text-lg font-semibold (18px bold)
```

## 🎨 Component Design Patterns

### Success Modals
- **Auto-close timer**: 5 seconds default
- **No duplicate notifications**: Remove toast if modal shows
- **Show once**: Either toast OR modal, never both
- **Essential info only**: Document number, customer, amount

### Address Display
When "Same as billing" is checked:
```jsx
// ✅ CORRECT - Exact same format
<div className="text-sm text-gray-600">
  <div className="space-y-1">
    {address.line1 && <p>{address.line1}</p>}
    {address.line2 && <p>{address.line2}</p>}
    {address.mobile && (
      <p className="flex items-center gap-1 text-xs text-gray-700 font-medium">
        <Phone className="w-3 h-3" />
        {address.mobile}
      </p>
    )}
  </div>
</div>

// ❌ WRONG - Different format/styling
<p className="text-xs">{address.line1}, {address.line2}</p>
```

### Payment Display
```jsx
// ✅ CORRECT - Single status display
<StatusBadge status="partial" amount={paid} credit={balance} />

// ❌ WRONG - Redundant information
<StatusBadge status="partial" amount={paid} credit={balance} />
<p>₹{balance} will go to credit</p>  {/* Duplicate! */}
```

### Print-Friendly Elements
```jsx
// Always provide print-specific display
<div className="hidden print:block">{actualData}</div>
<div className="print:hidden"><InteractiveComponent /></div>
```

## 🔧 Input Behavior Standards

### Number Inputs
```jsx
// ✅ CORRECT - Allows empty state
const handleAmountChange = (value) => {
  setAmount(value === '' ? '' : parseFloat(value) || 0);
};

// ❌ WRONG - Forces 0
const handleAmountChange = (value) => {
  setAmount(parseFloat(value) || 0);  // Can't delete 0!
};
```

### Select/Dropdown Defaults
- Always auto-select if only one option
- Auto-select default bank account
- Pre-select most common payment terms

### Checkbox Behavior
- "Same as billing" should instantly copy all data
- Include mobile/phone numbers in address copy
- Maintain exact formatting when copying

## 🚫 Anti-Patterns to Avoid

### 1. **Redundant Headers**
```jsx
// ❌ WRONG
<h3>Shipping Address</h3>
<label>
  <checkbox /> Same as billing
</label>
<p>Using Billing Address</p>  {/* Redundant! */}

// ✅ CORRECT
<h3>Shipping Address</h3>
<label>
  <checkbox /> Same as billing
</label>
```

### 2. **Inconsistent Display**
```jsx
// ❌ WRONG - Different formats
Billing:  AS-4, Shop No. 1
          Vasundra Kutumb
          Jaipur, 302022
          
Shipping: AS-4, Shop No. 1, Vasundra Kutumb, Jaipur, 302022

// ✅ CORRECT - Same format
Both use identical multi-line format
```

### 3. **Missing Mobile Fallbacks**
```jsx
// ❌ WRONG
const mobile = addressData?.mobile;

// ✅ CORRECT
const mobile = addressData?.mobile || 
               customer?.phone || 
               customer?.mobile;
```

## 🎯 State Management Rules

### Form Data Synchronization
```jsx
// Always sync child -> parent on init
useEffect(() => {
  if (onSave && formData) {
    onSave(formData);  // Ensure parent has complete data
  }
}, [customer]);
```

### Variable Naming Conflicts
```jsx
// ❌ WRONG - Shadowing
const [toast, setToast] = useState();  // Shadows imported toast
toast.success();  // Error!

// ✅ CORRECT - Clear naming
const [toastMessage, setToastMessage] = useState();
toast.success();  // Works!
```

## 📋 Quick Reference Checklist

### Before Committing Any UI Change:
- [ ] No duplicate information displays?
- [ ] Consistent formatting across similar components?
- [ ] Number inputs allow empty state?
- [ ] Print view shows actual data (not placeholders)?
- [ ] Mobile/phone numbers included in all addresses?
- [ ] Success notifications show once (modal OR toast)?
- [ ] Field widths optimized for content?
- [ ] Same font sizes for similar content types?
- [ ] Proper spacing between elements?
- [ ] No console.log statements?

## 🔄 Common Fixes Reference

| Issue | Solution |
|-------|----------|
| Can't delete 0 in input | Handle empty string separately: `value === '' ? '' : parseFloat(value)` |
| Phone not showing | Add fallbacks: `data.mobile \|\| customer.phone \|\| customer.mobile` |
| Duplicate success messages | Remove toast.success() when using GenericSuccessModal |
| Different address formats | Use exact same component structure for both |
| Bank info not on PDF | Use `print:block` and `print:hidden` classes |
| Toast is not a function | Rename state variable to avoid shadowing |

## 🎨 Color Usage

### Status Colors
- Success: `text-green-600`, `bg-green-50`
- Warning: `text-yellow-600`, `bg-yellow-50`
- Error: `text-red-600`, `bg-red-50`
- Info: `text-blue-600`, `bg-blue-50`
- Neutral: `text-gray-600`, `bg-gray-50`

### Interactive Elements
- Primary buttons: `bg-blue-500 hover:bg-blue-600`
- Secondary buttons: `bg-gray-100 hover:bg-gray-200`
- Danger buttons: `bg-red-500 hover:bg-red-600`
- Links: `text-blue-600 hover:text-blue-700`

## 📱 Responsive Considerations

### Mobile-First Approach
```jsx
// Start with mobile layout
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
```

### Touch Targets
- Minimum 44x44px for all clickable elements
- Add padding to small icons: `p-2` minimum
- Space between clickable items: `gap-2` minimum

## ✅ Component Globalization Rules

### What Goes Global
- Reusable UI components (ItemsTable, CustomerSearch)
- Common form elements (AddressForm, DatePicker)
- Utility components (StatusBadge, PrintUtility)
- Shared modals (GenericSuccessModal)

### What Stays Local
- Module-specific headers (InvoiceSummaryTop)
- Specialized business logic components
- Module-specific modals with unique workflows
- Components tied to specific routes

---

*This guide represents all UI decisions and patterns established during the application cleanup and modernization process. Follow these standards for all new development and when refactoring existing code.*