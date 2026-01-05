# TypeScript Error Remediation Roadmap

> **Status**: ~1362 errors remaining as of 2026-01-05
> **Goal**: Zero TypeScript errors for production readiness

## Completed Work (This Session)

### 1. API Alias Cleanup ✅
- Removed 4 API method aliases (`list`, `getDetails` → `getAll`, `getById`)
- Removed 16 API export aliases (`customerAPI` → `customersApi`, etc.)
- Created `API_METHOD_NAMING_DICTIONARY.md` for canonical naming

### 2. Invoice Service Consolidation ✅
- **Deleted**: `services/invoiceApiService.ts` (597 lines)
- **Added to `invoicesApi`**: `calculateLive`, `validate`, `getDrafts`, `saveDraft`, `generateFromOrder`
- **Updated 10 caller files** to use `invoicesApi`

### 3. Response Handling Fixes ✅
Fixed Axios response pattern in:
- `useInvoiceList.ts`
- `InvoiceList.tsx`  
- `InvoiceSelector.tsx`
- `useGSTData.ts`

---

## Remaining Error Categories

### Priority 1: Response Handling (~50 errors)
**Pattern**: Code expects `response.success` but gets `AxiosResponse`

**Fix Pattern**:
```typescript
// Before
if (response.success) { ... }

// After
const responseData = response?.data || response;
if (responseData?.success || responseData?.invoices) { ... }
```

**Files to fix**:
- `src/components/gst/reports/*.tsx` (6 files)
- `src/components/returns/*.tsx`
- `src/components/payment/notes/*.tsx`

---

### Priority 2: Missing API Methods (~15 errors)
**Pattern**: API module missing methods that callers expect

| API Module | Missing Methods |
|------------|-----------------|
| `notesApi` | `getLinkedInvoices`, `getInvoiceItems`, `createCreditDebitNote`, `getCreditNoteReasons`, `getSettlementTypes` |
| `purchasesApi` | `parseInvoice` |

**Action**: Add methods to respective API modules in `services/api/modules/`

---

### Priority 3: Type Interface Mismatches (~100 errors)
**Pattern**: Object properties don't match interface definitions

**Common issues**:
- `total_amount` vs `line_total`
- `contact_person` vs `contact_person_name`
- Missing optional properties

**Action**: Audit and align type definitions in `*SharedTypes.ts` files

---

### Priority 4: Null Safety (~200 errors)
**Pattern**: `'x' is possibly null/undefined`

**Fix Pattern**:
```typescript
// Before
customer.name

// After
customer?.name || ''
```

**High-frequency files**:
- `ModularPaymentEntry.tsx`
- `EnterprisePaymentEntry.tsx`
- Various form components

---

### Priority 5: Component Prop Mismatches (~400 errors)
**Pattern**: Component receives props not in its interface

**Examples**:
- `DataTable` receiving unknown column properties
- `DatePicker` receiving unsupported props
- Modal components with inconsistent APIs

**Action**: Audit component interfaces and update callers

---

### Priority 6: Context Missing Properties (~20 errors)
**Pattern**: Context value missing expected properties

**Files**:
- `PaymentContext` missing `selectedInvoices`, `setSelectedInvoices`
- Various context providers

---

## Recommended Approach

### Phase 1: Quick Wins (1-2 hours)
1. Fix remaining response handling in GST reports
2. Add missing API methods to notesApi
3. Fix null safety in critical paths

### Phase 2: Systematic Cleanup (4-8 hours)
1. Run `npx tsc --noEmit 2>&1 | grep "TS2339" | wc -l` to count by error code
2. Fix by error type (TS2339 = property doesn't exist, TS2322 = type mismatch)
3. Update shared type definitions

### Phase 3: Component Audit (8+ hours)
1. Audit all UI components for prop consistency
2. Create strict prop interfaces
3. Update all callers

---

## Commands for Monitoring Progress

```bash
# Total error count
npx tsc --noEmit 2>&1 | wc -l

# Errors by module
npx tsc --noEmit 2>&1 | grep -oP 'src/components/\w+' | sort | uniq -c | sort -rn

# Specific error type count
npx tsc --noEmit 2>&1 | grep "TS2339" | wc -l  # Property doesn't exist
npx tsc --noEmit 2>&1 | grep "TS2322" | wc -l  # Type mismatch
npx tsc --noEmit 2>&1 | grep "TS2345" | wc -l  # Argument type mismatch
```

---

## Related Documentation
- [API_METHOD_NAMING_DICTIONARY.md](./API_METHOD_NAMING_DICTIONARY.md) - Canonical API method names
- [PRODUCTION_READINESS_PLAYBOOK.md](../backend/docs/PRODUCTION_READINESS_PLAYBOOK.md) - Backend standards
