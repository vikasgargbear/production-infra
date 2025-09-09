# Keyboard Navigation Guide

## Implementation Standards

### 1. Tab Order Within Tiles
Each tile/section should have a logical tab order:
- Inputs within the same tile should be traversed before moving to the next tile
- Use `tabindex` sparingly - rely on DOM order when possible
- Group related inputs in the same container

### 2. Standard Tab Index Ranges
To ensure consistent navigation across the app:
```
- Customer Selection Tile: 1-99
- Product Search Tile: 100-199  
- Items Table: 200-299
- Payment Section: 300-399
- Summary/Actions: 400-499
```

### 3. Keyboard Shortcuts
Standard shortcuts across all modules:
- `Tab`: Move to next input
- `Shift+Tab`: Move to previous input
- `Enter`: Submit form or move to next field (context-dependent)
- `Ctrl+Enter`: Save and proceed
- `Ctrl+S`: Save draft
- `Ctrl+P`: Print/Preview
- `Esc`: Close modal/cancel operation

### 4. Focus Management
- Auto-focus first input when opening a modal/form
- Return focus to trigger element when closing modal
- Show focus indicators clearly (ring-2 ring-blue-500)

## Component Examples

### Using KeyboardNavigableTile
```jsx
import { KeyboardNavigableTile, KeyboardNavigableForm } from '../global/ui/KeyboardNavigableTile';

function InvoiceForm() {
  return (
    <KeyboardNavigableForm>
      {/* Customer Tile - Tab through all customer fields first */}
      <KeyboardNavigableTile className="border rounded-lg p-4 mb-4">
        <h3>Customer Details</h3>
        <CustomerSearch />
        <input name="phone" placeholder="Phone" />
        <input name="email" placeholder="Email" />
      </KeyboardNavigableTile>
      
      {/* Product Tile - Then tab through product fields */}
      <KeyboardNavigableTile className="border rounded-lg p-4 mb-4">
        <h3>Add Products</h3>
        <ProductSearch />
        <input name="quantity" placeholder="Quantity" />
        <button>Add Item</button>
      </KeyboardNavigableTile>
      
      {/* Payment Tile - Finally payment fields */}
      <KeyboardNavigableTile className="border rounded-lg p-4">
        <h3>Payment</h3>
        <select name="method">
          <option>Cash</option>
          <option>Card</option>
        </select>
        <input name="amount" placeholder="Amount" />
      </KeyboardNavigableTile>
    </KeyboardNavigableForm>
  );
}
```

### Manual Tab Index (when needed)
```jsx
// Within a single tile, ensure logical flow
<div className="payment-tile">
  <select tabIndex={301}>Payment Method</select>
  <input tabIndex={302} placeholder="Amount" />
  <input tabIndex={303} placeholder="Reference" />
  <button tabIndex={304}>Add Payment</button>
</div>
```

## Testing Checklist
- [ ] Can navigate entire form using only keyboard
- [ ] Tab order follows visual layout (left-to-right, top-to-bottom)
- [ ] Focus indicators are visible
- [ ] Enter key works appropriately (submit in last field, next field otherwise)
- [ ] Escape key closes modals
- [ ] Shortcuts don't conflict with browser defaults
- [ ] Screen readers can navigate properly

## Accessibility Notes
1. Always provide `aria-label` for icon-only buttons
2. Use `aria-describedby` for error messages
3. Announce dynamic content changes with `aria-live`
4. Ensure color contrast meets WCAG standards
5. Test with screen readers (NVDA, JAWS, VoiceOver)