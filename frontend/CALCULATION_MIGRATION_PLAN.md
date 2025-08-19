# Invoice Calculation Migration Plan
## Eliminating Frontend Calculation Redundancy

## Current State: ❌ REDUNDANT CALCULATIONS

### Frontend Calculation Files (TO BE REPLACED):
1. **`services/invoiceCalculator.js`** - Original calculation service
2. **`components/invoice/components/InvoicePreview.js`** - Manual calculations
3. **`hooks/useInvoiceCalculation.js`** - React hook calculations
4. **`components/sales/InvoiceFlow.js`** - Sales flow calculations
5. **`components/sales/SalesOrderFlow.js`** - Order calculations
6. **`components/global/ui/display/ItemsTable.js`** - Table calculations
7. **`services/invoiceApiService.js`** - Mixed API/calculation service
8. **`components/global/PharmaItemsTable.js`** - Pharma table calculations
9. **Multiple other components** with embedded calculation logic

### Backend Calculation (AUTHORITATIVE):
- **`backend/app/api/routes/invoice_calculation.py`** - Enterprise API
- **Database triggers** - Data integrity

## Target State: ✅ SINGLE SOURCE OF TRUTH

### API-Only Architecture:
- **Frontend**: Display only, no calculations
- **Backend**: All calculations via `/api/invoices/calculate`
- **Components**: Use `InvoiceCalculatorEnterprise` service only

## Migration Steps:

### Phase 1: Replace Core Services
1. **Replace `invoiceCalculator.js`** with `invoiceCalculatorEnterprise.js`
2. **Update import statements** across all components
3. **Replace calculation hooks** with API calls

### Phase 2: Update Components
1. **Replace `InvoicePreview.js`** with `InvoicePreviewEnterprise.js`
2. **Update `InvoiceFlow.js`** to use API calculations
3. **Update `SalesOrderFlow.js`** to use API calculations
4. **Update `ItemsTable.js`** to display-only mode

### Phase 3: Remove Redundant Files
1. **Delete old calculation services**
2. **Remove calculation hooks**
3. **Clean up embedded calculations**

### Phase 4: Testing & Validation
1. **Test all invoice flows** with API calculations
2. **Verify performance** (should be faster)
3. **Confirm accuracy** (single source of truth)

## Benefits After Migration:

### Performance:
- **Faster calculations** (database-optimized)
- **Reduced client-side processing**
- **Fewer re-renders** (debounced API calls)

### Accuracy:
- **No frontend/backend mismatches**
- **Consistent calculations** across all flows
- **Single point of truth** for business logic

### Maintainability:
- **One place to update** calculation logic
- **Easier testing** (backend only)
- **Platform consistency** (web/mobile/API)

## Risk Mitigation:

### Backward Compatibility:
- **Keep old files temporarily** during migration
- **Feature flags** for gradual rollout
- **Fallback mechanisms** in case of API failure

### Error Handling:
- **API timeout fallbacks**
- **Offline calculation cache**
- **User-friendly error messages**

## Success Metrics:

### Technical:
- **Zero calculation logic** in frontend
- **All calculations** via API
- **< 500ms** API response time

### Business:
- **100% calculation accuracy**
- **No billing discrepancies**
- **Faster invoice creation**

---

**Status**: Ready to execute migration
**Priority**: High - eliminate calculation redundancy
**Timeline**: 1-2 hours for core migration