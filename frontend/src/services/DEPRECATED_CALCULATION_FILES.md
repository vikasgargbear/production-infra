# DEPRECATED CALCULATION FILES

## ⚠️ These files contain deprecated calculation logic

The following files have been migrated to use enterprise API-only calculations.
They are marked as deprecated but kept for backward compatibility during transition.

### Core Calculation Services:
- **`invoiceCalculator.js`** ⚠️ DEPRECATED - Use `invoiceCalculatorEnterprise.js`
- **`invoiceApiService.js`** ⚠️ DEPRECATED - Use `InvoiceCalculatorEnterprise` directly

### React Hooks:
- **`hooks/useInvoiceCalculation.js`** ⚠️ DEPRECATED - Use direct API calls

### Components with Calculation Logic:
- **`components/invoice/components/InvoicePreview.js`** ⚠️ DEPRECATED - Use `InvoicePreviewEnterprise.js`
- **`components/global/ui/display/ItemsTable.js`** ✅ MIGRATED - Now uses API values
- **`components/sales/InvoiceFlow.js`** ✅ MIGRATED - Now uses API calculations

### Files Still To Migrate:
- `components/sales/SalesOrderFlow.js`
- `services/api/utils/dataUtils.js`
- `components/returns/PurchaseReturnFlow.js`
- `components/returns/SalesReturnFlow.js`
- `components/purchase/ModularPurchaseEntry.js`
- `components/purchase/PurchaseFlow.js`
- `components/sales/index.js`
- `components/returns/components/CreditNotePreview.js`
- `components/inventory/index.js`
- `components/global/PharmaItemsTable.js`

## Migration Pattern:

### OLD (Frontend Calculation):
```javascript
import InvoiceCalculator from '../services/invoiceCalculator';
const totals = InvoiceCalculator.calculateInvoiceTotals(items, gstType);
```

### NEW (API Calculation):
```javascript
import InvoiceCalculatorEnterprise from '../services/invoiceCalculatorEnterprise';
const result = await InvoiceCalculatorEnterprise.calculateInvoice(invoiceData);
const totals = InvoiceCalculatorEnterprise.extractTotals(result);
```

## Benefits of Migration:
1. **Single source of truth** - All calculations in backend
2. **Consistency** - Same calculations across web/mobile/API
3. **Performance** - Database-optimized calculations
4. **Security** - No client-side business logic
5. **Maintainability** - One place to update calculation rules

## Status:
- ✅ Core services migrated
- ✅ Main invoice flow migrated  
- ⚠️ Other flows need migration
- 🔄 Gradual rollout in progress