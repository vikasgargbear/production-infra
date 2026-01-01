# Invoice Module TODO

## Future Improvements

### 1. Stricter Type Definitions
**Location**: `frontend/src/components/sales/invoice/types/invoiceTypes.ts`

**Current State**: 
- All interfaces use `[key: string]: unknown` index signatures for flexibility
- This allows backward compatibility with existing code that may use different field names

**Future Action**:
- Remove `[key: string]: unknown` from all interfaces to enable strict type checking
- Standardize field names across the application (e.g., use only `customer_name` instead of both `customer_name` and `name`)
- Add `Pick<>` and `Omit<>` utility types for component-specific slices

**Affected Interfaces**:
- `Customer`
- `Invoice`
- `InvoiceItem`
- `InvoiceTotals`
- `Employee`
- `Payment`
- `CompanyInfo`

---

### 2. ~~Archived Legacy Components~~ ✅ DELETED (Dec 30, 2024)

All archive directories have been cleaned up:
- `components/invoice/archive/` - Deleted
- `components/notes/archive/` - Deleted
- `components/payment/archive/` - Deleted
- `components/returns/archive/` - Deleted
- `components/sales/archive/` - Deleted
- `hooks/archive/` - Deleted
- `services/archive/` - Deleted

**21 deprecated files removed (~363KB)**

---

### 3. Additional Standardization Tasks
- [x] ~~BillSummary duplication~~ → Archived sales version, use global
- [x] ~~ConvertToInvoiceButton~~ → Fixed to use toast instead of alert
- [x] ~~InvoicePreviewEnterprise.js~~ → Converted to TSX with types
- [x] ~~InvoiceSelector naming~~ → Payment version renamed to `PaymentInvoiceAllocator`
- [x] ~~Import modals duplication~~ → Archived both unused modals (ImportDocumentModal, ImportFromDocumentModal)
- [ ] Convert remaining JS files to TSX (see `invoice_audit.md`)
- [ ] Move `invoiceStyles.js` to config or global styles

---

### 4. Standardized Document Feedback Utility
**Problem**: Each module (Invoice, Purchase, Challan, Payment) has its own inline toast messages with inconsistent wording.

**Current State**:
- Invoice: `toast.success("Invoice created successfully!")`
- Purchase: `toast.success("Done")`
- Others: Custom modal success flows

**Proposed Solution**: Create a shared `useDocumentFeedback` hook:
```typescript
// hooks/useDocumentFeedback.ts
const { showSuccess, showError } = useDocumentFeedback();

// Usage - consistent messaging across all modules
showSuccess('invoice', 'INV-001');  // "Invoice #INV-001 created successfully"
showSuccess('grn', 'GRN-001');      // "GRN #GRN-001 completed"
showError('invoice', error);         // Standardized error handling
```

**Benefits**:
- Consistent UX across all document flows
- Centralized message templates
- Easy to add new document types
- Single place to change messaging

---

### 5. Centralized Invoice Validation Service
**Priority**: Medium  
**Scope**: Invoice module first

**Problem**:
- Old `invoiceValidator.js` unused (archived to `services/archive/`)
- Validation scattered across components

**Proposed Solution**: Zod-based validation schemas:
```typescript
// services/validation/invoiceSchema.ts
export const InvoiceSchema = z.object({
  customer_id: z.number({ required_error: "Select a customer" }),
  items: z.array(InvoiceItemSchema).min(1, "Add at least one item"),
  invoice_date: z.string()
});
```

**Files to create**:
- [ ] `services/validation/invoiceSchema.ts`
- [ ] `services/validation/index.ts`
