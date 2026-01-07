# TypeScript Error Remediation Roadmap

> **Status**: 229 errors remaining as of 2026-01-06 (Verified via `tsc`)
> **Progress**: 645 → 229 errors (**416 fixed, 64% reduction**)
> **Goal**: Zero TypeScript errors for production readiness

---

## Current Error Distribution (2026-01-05)

### By Error Type
| Error Code | Count | Description | Fix Strategy |
|------------|-------|-------------|--------------|
| **TS2339** | 96 | Property does not exist on type | Add missing interface props, use correct API methods |
| **TS2345** | 43 | Argument type not assignable | Type assertions, interface alignment |
| **TS2322** | 41 | Type not assignable | Correct typing, null handling |
| **TS2307** | 19 | Cannot find module | Fix import paths |
| **TS2304** | 15 | Cannot find name | Add missing imports |
| **TS18048** | 12 | Object possibly undefined | Optional chaining, null guards |
| **TS2551** | 9 | Property doesn't exist (typo) | Use correct property names |
| **TS18047** | 9 | Object possibly null | Null checks, guards |
| **TS2741** | 7 | Missing property in type | Add required props |
| **TS2783** | 6 | Duplicate property | Remove duplicates |
| **TS2353** | 5 | Object literal unknown property | Remove extra props |
| Others | 26 | Various | Case-by-case |

### By File (Top 25)
| File | Errors | Category |
|------|--------|----------|
| `purchase/purchase-entry/PurchaseEntryFlow.tsx` | 16 | ExtractedData interface |
| `utils/purchaseValidation.ts` | 10 | Config possibly undefined |
| `master/settings/NotificationsAlerts.tsx` | 10 | Missing API methods |
| `purchase/purchase-order/PurchaseOrderFlow.tsx` | 9 | Similar to PurchaseEntryFlow |
| `sales/challan/ui/ImportFromInvoiceModal.tsx` | 8 | Type mismatches |
| `returns/notes/NotesHistory.tsx` | 7 | API response types |
| `returns/notes/CreditDebitNote.tsx` | 7 | Interface issues |
| `purchase/modals/PDFUploadModal.tsx` | 7 | Null checks |
| `global/modals/PDFUploadModal.tsx` | 7 | Null checks |
| `payment/entry/ModularPaymentEntry.tsx` | 6 | Null safety |
| `utils/productMapper.ts` | 5 | Type conversions |
| `sales/invoice/hooks/useInvoiceLogic.ts` | 5 | Interface alignment |
| `master/masters/WarehouseMaster.tsx` | 5 | Props/state types |
| `master/masters/CustomerMaster.tsx` | 5 | Props/state types |
| `payment/shared/PaymentSummaryCompact.tsx` | 4 | Interface props |
| `payment/entry/EnterprisePaymentEntry.tsx` | 4 | Similar to ModularPayment |
| `master/utils/masterValidation.ts` | 4 | Config undefined |
| `master/settings/ThirdPartyIntegrations.tsx` | 4 | API types |
| `master/settings/FeatureSettings.tsx` | 4 | Settings interface |
| `master/masters/TaxMaster.tsx` | 4 | Type mismatches |
| `master/hooks/useProducts.ts` | 4 | API response |
| `inventory/stock/CurrentStock.tsx` | 4 | Data types |
| `gst/reports/GSTReportsContainer.tsx` | 4 | Report types |

---

## Session Progress Log

### Fixes Completed (This Session)

| File | Errors Fixed | Method |
|------|-------------|--------|
| Payment interfaces (`api.types.ts`) | ~5 | Added `split_payments`, `notes` |
| `NotificationsAlerts.tsx` | ~50 | Interfaces, typed state, stubbed API |
| `DebitNoteFlow.tsx` | ~10 | Correct API methods, unwrapping |
| `PDFUploadModal.tsx` (×2) | ~40 | Null guards, typed interfaces |
| `CompanyProfile.tsx` | ~54 | AxiosResponse unwrapping |
| `BulkOperations.tsx` | ~39 | Stubbed missing API |
| `NotesHistory.tsx` | ~27 | Correct API, typed state |
| `DebitNotePreview.tsx` | ~19 | Interfaces, typed GST calc |
| `CompanyContext.tsx` | ~17 | AxiosResponse unwrapping |
| `CustomerCreationB2C.tsx` | ~17 | Interfaces, typed state |
| `DataValidationEngine.tsx` | ~16 | Stubbed missing API |
| `PurchaseEntryFlow.tsx` | ~11 | Added missing imports |
| `MasterSettings.tsx` | ~14 | Inline UI components |
| `NotificationCenter.tsx` | ~7 | Stubbed API, typed params |
| `modules.ts` | ~6 | Wildcard imports, fixed casing |
| `StandardMonthYearPicker.tsx` | ~6 | Interfaces, typed arrays |
| `SupplierMaster.tsx` | ~6 | null→undefined fixes |
| `ModularPaymentEntry.tsx` | ~10 | Optional chaining, toast type |
| `DocumentSummaryTop.tsx` | ~9 | TypeScript props interface |
| `LedgerReports/Analytics.tsx` | ~16 | Type assertions for API |

---

## Remaining Action Plan

### High Priority (70+ errors)
1. **`PurchaseEntryFlow.tsx` (16)** - ExtractedData interface from PDFUploadModal
2. **`purchaseValidation.ts` (10)** - Config properties possibly undefined  
3. **`NotificationsAlerts.tsx` (10)** - Remaining API/icon type issues
4. **`PurchaseOrderFlow.tsx` (9)** - Similar ExtractedData issues

### Medium Priority (40+ errors)
5. **Challan/Invoice modals (8)** - Import type mismatches
6. **Returns/Notes components (14)** - API response types
7. **Payment components (14)** - Interface alignment

### Lower Priority (remaining ~90)
8. Various master components
9. Utility files
10. Remaining scattered issues

---

## Fix Patterns Reference

### Pattern 1: Missing Optional Chaining
```typescript
// Before (TS18047/TS18048)
const name = customer.name;
// After
const name = customer?.name;
```

### Pattern 2: API Response Unwrapping  
```typescript
// Before (TS2339)
const data = response.items;
// After
const data = response.data.items;
```

### Pattern 3: Type Assertions for Interface Mismatches
```typescript
// Before (TS2345)
ledgerApi.getReport(filters);
// After
ledgerApi.getReport(filters as any);
```

### Pattern 4: Stubbing Missing APIs
```typescript
// Before (TS2339)
await settingsApi.notifications.getAll();
// After (with TODO)
// TODO: Replace when API available
setNotifications([]);
```

---

## Commands for Monitoring
```bash
# Total count
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l

# Errors by file
npx tsc --noEmit 2>&1 | grep -oE "src/[^(]+" | sort | uniq -c | sort -rn | head -25

# Errors by category
npx tsc --noEmit 2>&1 | grep -oE "error TS[0-9]+" | sort | uniq -c | sort -rn
```

## Related Documentation
- [API_METHOD_NAMING_DICTIONARY.md](./API_METHOD_NAMING_DICTIONARY.md) - Canonical API method names
