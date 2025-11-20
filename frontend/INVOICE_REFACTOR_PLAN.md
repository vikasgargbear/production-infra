# Invoice Flow Refactoring Plan

## Current Problem
- InvoiceFlow.js is 2800+ lines
- Contains 3 different steps/pages in one file
- Hard to maintain and debug
- Code duplication and complexity

## Recommended Structure

```
components/sales/invoice/
├── InvoiceFlow.js                 (Main container - 200-300 lines)
├── steps/
│   ├── InvoiceItemsStep.js       (Step 1: Items selection)
│   ├── InvoiceDetailsStep.js     (Step 2: Customer/discount details)  
│   └── InvoicePreviewStep.js     (Step 3: Preview and payment)
├── hooks/
│   ├── useInvoiceCalculation.js  (Calculation logic)
│   ├── useInvoiceValidation.js   (Validation logic)
│   └── useInvoiceActions.js      (Save/print actions)
└── components/
    ├── PaymentDetails.js         (Payment section)
    ├── CustomerSelection.js      (Customer picker)
    └── DiscountSection.js        (Discount UI)
```

## Benefits
1. **Maintainability**: Each file <500 lines
2. **Separation of Concerns**: Each step has specific responsibility
3. **Reusability**: Components can be reused in other flows
4. **Testing**: Easier to test individual components
5. **Team Development**: Multiple developers can work simultaneously
6. **Performance**: Code splitting and lazy loading possible

## Implementation Approach
1. **Phase 1**: Extract Step 3 (Preview) - least dependencies
2. **Phase 2**: Extract Step 1 (Items) - reusable for other flows
3. **Phase 3**: Extract Step 2 (Details) and shared hooks
4. **Phase 4**: Optimize main container

## Next Steps
- Start with InvoicePreviewStep.js extraction
- Move calculation logic to custom hooks
- Extract payment details to separate component