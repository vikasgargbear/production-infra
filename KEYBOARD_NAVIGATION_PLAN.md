# Keyboard Navigation Enhancement Plan

## Goal
Implement consistent keyboard shortcuts across ALL workflows matching the InvoiceFlow style.

## Standard Keyboard Shortcuts

### Universal Shortcuts (All Workflows)
- `Ctrl+S` / `Cmd+S` - Save/Proceed to next step
- `Ctrl+P` / `Cmd+P` - Print/Preview (when applicable)
- `Esc` - Go back/Close modal
- `Ctrl+N` / `Cmd+N` - Add Party (Customer/Supplier)
- `Ctrl+F` / `Cmd+F` - Focus on Product Search
- `Ctrl+G` / `Cmd+G` - Open GST Calculator (where applicable)

### Context-Specific Shortcuts
- `Ctrl+I` / `Cmd+I` - Import from Invoice/Document
- `Ctrl+U` / `Cmd+U` - Upload PDF (Purchase workflows)
- `Ctrl+R` / `Cmd+R` - Search Party/Returns
- `Ctrl+H` / `Cmd+H` - View History

## Workflows to Enhance

### 1. ✅ InvoiceFlow.js (Already Done)
**Location**: `frontend/src/components/sales/InvoiceFlow.js`
**Status**: Complete
**Shortcuts**: Ctrl+S, Ctrl+P, Ctrl+N, Ctrl+F, Ctrl+G, Esc

### 2. ⏳ ModularChallanCreatorV5.js (Partially Done)
**Location**: `frontend/src/components/challan/ModularChallanCreatorV5.js`
**Status**: Has basic shortcuts, needs enhancement
**Add**:
- Import KeyboardShortcuts component
- Display shortcut hints
- Enhance existing handlers

### 3. 🔴 EnhancedPurchaseEntry.js
**Location**: `frontend/src/components/purchase/EnhancedPurchaseEntry.js`
**Status**: No keyboard shortcuts
**Add**:
- Ctrl+N - Add Supplier
- Ctrl+F - Search Products
- Ctrl+U - Upload PDF
- Ctrl+G - GST Calculator
- Ctrl+S - Save
- Ctrl+P - Print
- Esc - Close

### 4. 🔴 SalesReturnFlow.js
**Location**: `frontend/src/components/returns/SalesReturnFlow.js`
**Status**: No keyboard shortcuts
**Add**:
- Ctrl+R - Search Customer
- Ctrl+I - Search Invoice
- Ctrl+F - Search Products
- Ctrl+S - Proceed/Save
- Esc - Close

### 5. 🔴 PurchaseReturnFlowV2.js
**Location**: `frontend/src/components/returns/PurchaseReturnFlowV2.js`
**Status**: No keyboard shortcuts
**Add**:
- Ctrl+R - Search Supplier
- Ctrl+I - Search Invoice
- Ctrl+F - Search Products
- Ctrl+S - Proceed/Save
- Esc - Close

### 6. 🔴 EnhancedStockAdjustmentFlow.js
**Location**: `frontend/src/components/stock/EnhancedStockAdjustmentFlow.js`
**Status**: To be checked
**Add**:
- Ctrl+F - Search Products
- Ctrl+S - Save Adjustment
- Esc - Close

### 7. 🔴 StockTransfer.js
**Location**: `frontend/src/components/stock/StockTransfer.js`
**Status**: To be checked
**Add**:
- Ctrl+F - Search Products
- Ctrl+S - Process Transfer
- Esc - Close

### 8. 🔴 SalesOrderFlow.js (if exists)
**Status**: To be checked

## Implementation Steps

### Phase 1: Add Keyboard Support
1. Import KeyboardShortcuts component
2. Add useEffect for keyboard event listeners
3. Implement handleKeyDown function
4. Add ref management for focusable elements

### Phase 2: Display Shortcuts
1. Add KeyboardShortcuts component with appropriate SHORTCUT_SETS
2. Position at top or bottom of form
3. Use appropriate variant (CREATE, REVIEW, PURCHASE, RETURNS)

### Phase 3: Testing
1. Test all shortcuts in each workflow
2. Ensure no conflicts
3. Verify focus management
4. Test on Mac (Cmd) and Windows (Ctrl)

## Code Template

```javascript
// Import
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';

// Refs
const partySearchRef = useRef(null);
const productSearchRef = useRef(null);

// Keyboard handler
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          if (currentStep === 2) {
            handleSave();
          } else {
            handleProceed();
          }
          break;
        case 'p':
          e.preventDefault();
          if (currentStep === 2) {
            handlePrint();
          }
          break;
        case 'n':
          e.preventDefault();
          // Add party modal
          setShowPartyModal(true);
          break;
        case 'f':
          e.preventDefault();
          if (productSearchRef.current) {
            productSearchRef.current.focus();
          }
          break;
        case 'g':
          e.preventDefault();
          setShowGSTCalculator(true);
          break;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (currentStep === 2) {
        setCurrentStep(1);
      } else {
        onClose?.();
      }
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [currentStep, dependency1, dependency2]);

// In JSX
<KeyboardShortcuts shortcuts={SHORTCUT_SETS.CREATE} />
// or for step 2
<KeyboardShortcuts shortcuts={SHORTCUT_SETS.REVIEW} />
```

## Priority Order

1. **High Priority** (Most Used):
   - EnhancedPurchaseEntry.js
   - SalesReturnFlow.js
   - PurchaseReturnFlowV2.js
   - ModularChallanCreatorV5.js (enhance)

2. **Medium Priority**:
   - EnhancedStockAdjustmentFlow.js
   - StockTransfer.js
   - SalesOrderFlow.js

3. **Low Priority** (Less frequent):
   - Other stock management flows
   - Report workflows

## Success Criteria

- ✅ All major workflows have consistent keyboard navigation
- ✅ Shortcuts are displayed prominently
- ✅ Keyboard navigation is intuitive and matches invoice flow
- ✅ Cross-platform compatibility (Mac/Windows)
- ✅ No conflicts between shortcuts
- ✅ Focus management works properly
- ✅ Documentation updated

## Timeline

- Phase 1 (High Priority): 1-2 hours
- Phase 2 (Medium Priority): 1 hour
- Phase 3 (Testing): 30 mins
- **Total**: ~4 hours of development time
