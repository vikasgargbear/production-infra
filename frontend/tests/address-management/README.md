# Address Management System - Implementation Guide

## Overview
Complete enterprise-grade address management system for invoice module with proper segregation of billing and shipping addresses.

## Key Features Implemented

### 1. ✅ "Same as Billing" Checkbox Fix
- Properly managed with React state (`sameAsShipping`)
- Can be toggled on/off without issues
- When checked: Shows "Using billing address"
- When unchecked: Shows separate shipping address form

### 2. ✅ Multiple Address Selection
- Dropdown appears when customer has multiple addresses
- Separate dropdowns for billing and shipping
- Auto-selects default address or first available
- "Add new address" option at bottom of dropdown

### 3. ✅ Address Type Segregation
- **Billing addresses**: Only show in billing section
- **Shipping addresses**: Only show in shipping section
- No cross-contamination between types
- Proper filtering: `addr.address_type === addressType`

### 4. ✅ Auto-Save Functionality
- Addresses automatically save to backend when edited
- Uses endpoint: `/customers/{customerId}/addresses`
- Supports both create and update operations
- Refreshes address list after save

### 5. ✅ Clean Review Page
- Removed duplicate address display from review page
- Addresses now only show in PDF preview ("Bill To" / "Ship To")
- Eliminates redundant information display

## Component Structure

### AddressFormEnhanced
Location: `/src/components/global/ui/AddressFormEnhanced.js`
Export: Available globally via `import { AddressFormEnhanced } from '../global'`

**Key Methods:**
- `fetchCustomerAddresses()` - Fetches all addresses from API
- `selectAddress()` - Handles address selection from dropdown
- `handleSave()` - Saves address changes to backend
- `buildAddressString()` - Formats address for display

**Props:**
```javascript
{
  customer,           // Customer object with customer_id
  addressData,       // Current address data
  addressType,       // 'billing' or 'shipping'
  onChange,          // Callback for address changes
  onSave,           // Callback after save
  sameAsBilling,    // Boolean for shipping address
  onSameAsBillingChange // Toggle callback
}
```

## API Integration

### Fetch Addresses
```javascript
GET /customers/{customerId}/addresses
```

### Save Address
```javascript
// Create new
POST /customers/{customerId}/addresses

// Update existing
PUT /customers/{customerId}/addresses/{addressId}
```

### Address Object Structure
```javascript
{
  address_id: "ADDR001",
  customer_id: "CUST001",
  address_type: "billing", // or "shipping"
  address_line1: "123 Main Street",
  address_line2: "Near City Mall",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400001",
  country: "India",
  is_default: true
}
```

## Usage in InvoiceFlow

### Step 1: Create/Edit (currentStep === 1)
- Customer selection triggers address fetch
- Addresses stored in invoice state
- No visual address forms shown (clean UI)

### Step 2: Review (currentStep === 2)
- Addresses displayed only in PDF preview
- No duplicate AddressFormEnhanced components
- Clean, professional appearance

## Test Files

1. **test-invoice-address.html**
   - Tests basic address fetching
   - Verifies multi-field form display
   - Checks instant calculation updates

2. **test-address-enhanced.html**
   - Tests "Same as billing" checkbox
   - Demonstrates multiple address selection
   - Shows auto-save functionality

3. **test-address-segregation.html**
   - Verifies proper type filtering
   - Shows billing/shipping separation
   - Demonstrates no duplicates

## Best Practices

1. **Always filter by address type** to prevent mixing
2. **Use proper null checks** when building address strings
3. **Auto-select default** address when available
4. **Save immediately** when user makes changes
5. **Show loading states** during API calls
6. **Handle edge cases** (no addresses, API failures)

## Future Enhancements

- [ ] Add address validation (pincode format, required fields)
- [ ] Implement address autocomplete using postal API
- [ ] Add ability to set default addresses
- [ ] Support international address formats
- [ ] Add address history/audit trail
- [ ] Implement bulk address import/export

## Troubleshooting

### Issue: Addresses not loading
- Check customer has `customer_id`
- Verify API endpoint is accessible
- Check network tab for API errors

### Issue: Same as billing not working
- Ensure `sameAsShipping` state is properly managed
- Check `onSameAsBillingChange` callback is defined
- Verify billing address exists before copying

### Issue: Duplicate addresses showing
- Check filter: Must be `addr.address_type === addressType`
- Remove old filter allowing billing in shipping
- Clear cache/reload if needed

## Code References

- Main Component: `frontend/src/components/global/ui/AddressFormEnhanced.js`
- Usage: `frontend/src/components/sales/InvoiceFlow.js:450-515`
- API Service: `frontend/src/services/api/apiClient.js`
- Test Files: `frontend/tests/address-management/`