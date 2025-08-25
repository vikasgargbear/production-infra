# Cleanup Log

## January 8, 2025

### Archived Files (Safe to delete after testing)

#### Unused Components (archived to `unused_components_2025_01/`)
- `InvoiceManagementExample.js` - Example file, not used in production
- `InvoiceFlowMinimal.tsx` - Minimal version, production uses full InvoiceFlow.js
- `InvoiceFlowBalanced.tsx` - Alternative implementation, not imported anywhere
- `InvoiceListMinimal.tsx` - Minimal list view, production uses InvoiceManagement.js

#### Debug Files (already removed)
- `TEST_CALCULATION.js` - Test calculation utilities
- `getInvoiceDisplayValues.js` - Debug display helper
- `SINGLE_CALCULATION.js` - Single calculation test
- `debugCalculation.js` - Debug utilities

### Active Components (Keep)
- `InvoiceFlow.js` - Main invoice creation flow
- `InvoiceManagement.js` - Invoice list and management
- `InvoiceSidebar.js` - Navigation sidebar
- `InvoiceContainer.js` - Container component
- `SalesHub.tsx` - Main sales hub

### Notes
- Archive folder structure allows safe rollback if needed
- Wait 2-3 days of testing before permanent deletion
- All archived files were verified to have no imports from other components