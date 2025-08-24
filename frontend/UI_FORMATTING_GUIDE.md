# UI Formatting Guide for Invoice & Document Components

## Core Principles

### 1. Section Headers
- **Position**: ALWAYS place section headers OUTSIDE tiles/cards
- **Style**: Use uppercase, small font with tracking-wider
- **Format**: `text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1`
- **Examples**: PAYMENT METHOD, DELIVERY DETAILS, BILLING ADDRESS, etc.

### 2. Tile/Card Structure
```jsx
<div className="mb-4">
  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1">SECTION TITLE</h3>
  <div className="bg-white rounded-lg border border-gray-200 p-3">
    {/* Content goes here */}
  </div>
</div>
```

### 3. Space Optimization

#### Horizontal Space Usage
- Use `flex items-center justify-between` for elements that can share a line
- Place status badges, remaining amounts, and action buttons on the same row when possible
- Example: "Split Payment" button and "Remaining: ₹22.00" on same line

#### Vertical Space Minimization
- Reduce spacing between elements: use `space-y-2` instead of `space-y-3` or `space-y-4`
- Combine related information on single lines
- Use compact padding: `p-2` or `p-3` instead of `p-4`

### 4. Address Display Consistency

#### Required Information for All Addresses
- Customer/Contact Name
- Full Address (street, city, state, pincode)
- Phone Number (ALWAYS include if available)
- GST Number (for billing address if available)

#### Address Data Priority
```javascript
// Phone number fallback chain
const phone = address.phone || 
              address.mobile || 
              customer.phone || 
              customer.mobile || 
              customer.primary_phone || 
              customer.contact_number;
```

### 5. Status Indicators

#### Position
- Place status badges in top-right corner of tiles
- Use inline status for amounts (e.g., "₹22 pending" next to payment status)

#### Color Coding
```javascript
const statusColors = {
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-700',
  overpaid: 'bg-red-100 text-red-700'
};
```

### 6. Form Layout

#### Two-Column Grid for Related Fields
```jsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="block text-xs text-gray-600 mb-1">Method</label>
    <select className="w-full px-2 py-1.5 text-sm border...">
  </div>
  <div>
    <label className="block text-xs text-gray-600 mb-1">Amount</label>
    <input className="w-full px-2 py-1.5 text-sm border...">
  </div>
</div>
```

### 7. Button Placement

#### Action Buttons
- Primary actions: Bottom right of forms
- Secondary actions (like "Split Payment"): Inline with related content
- Destructive actions: Require confirmation, use red color

### 8. Print/PDF Consistency

#### Preview Must Match Output
- Use same layout in preview and PDF generation
- Include all data shown in edit mode in the preview
- Ensure colors and backgrounds are preserved in PDF

#### Required Elements in Invoice Preview
1. Company information with logo
2. Invoice number and date
3. Payment status (synced with actual payment data)
4. Complete billing and shipping addresses with phone numbers
5. Item details with all columns
6. Tax breakup
7. Payment information

### 9. Data Synchronization

#### Address Data Flow
- Edit Form → Preview → PDF should all show identical information
- Phone numbers must appear in all address displays
- Same formatting for addresses across all views

#### Payment Status
- Must reflect actual payment amount entered
- Automatic calculation: Paid/Partial/Pending based on amount vs total

### 10. Global Component Reusability

#### Components That Should Be Global
- SplitPayment
- AddressForm
- ItemsTable
- CustomerSearch
- DocumentFooter
- StatusBadge

#### Component Interface Standards
- Accept className prop for custom styling
- Provide onChange callbacks for data updates
- Support readOnly mode for preview states
- Include proper TypeScript/PropTypes definitions

## Implementation Examples

### Correct: Header Outside Tile
```jsx
<div className="mb-4">
  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 px-1">
    PAYMENT METHOD
  </h3>
  <div className="bg-white rounded-lg border border-gray-200 p-3">
    <SplitPayment />
  </div>
</div>
```

### Incorrect: Header Inside Tile
```jsx
// ❌ WRONG
<div className="bg-white rounded-lg border border-gray-200 p-3">
  <h3 className="text-sm font-medium text-gray-700">Payment Method</h3>
  <SplitPayment />
</div>
```

### Correct: Space-Optimized Layout
```jsx
<div className="flex items-center justify-between">
  <button className="text-sm text-blue-600">Split Payment</button>
  <span className="text-xs text-orange-600">Remaining: ₹22.00</span>
</div>
```

### Correct: Address with Phone
```jsx
<div className="bg-gray-50 rounded-xl p-3">
  <h3 className="text-xs font-semibold text-gray-500 uppercase">Bill To</h3>
  <p className="font-semibold text-sm">{customer.name}</p>
  <p className="text-xs text-gray-600">{address}</p>
  <p className="text-xs text-gray-600">Ph: {phone}</p>
  {gstin && <p className="text-xs text-gray-600">GST: {gstin}</p>}
</div>
```

## Checklist for New Components

- [ ] Section headers placed outside tiles
- [ ] Consistent spacing (p-3 for tiles, mb-4 for sections)
- [ ] Phone numbers included in all address displays
- [ ] Status badges in top-right corner
- [ ] Space optimization (horizontal grouping where possible)
- [ ] Data consistency between edit/preview/PDF
- [ ] Proper color coding for status indicators
- [ ] Responsive grid layouts for form fields
- [ ] Global component reusability considered
- [ ] Print/PDF output matches preview exactly

## Notes

This guide should be referenced when:
1. Creating new document/invoice components
2. Modifying existing tiles or sections
3. Adding new form fields or displays
4. Implementing print/PDF functionality
5. Reviewing UI consistency across the application