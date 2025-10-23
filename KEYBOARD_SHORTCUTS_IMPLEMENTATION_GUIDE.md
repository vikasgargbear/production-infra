# Keyboard Shortcuts - Implementation Guide

## ✅ Completed Workflows

### 1. InvoiceFlow.js
**Status**: ✅ Complete  
**Shortcuts**: Ctrl+S, Ctrl+P, Ctrl+N, Ctrl+F, Ctrl+G, Esc
**Features**: Full keyboard navigation with shortcuts display

### 2. ModularChallanCreatorV5.js
**Status**: ✅ Enhanced (just deployed)  
**Shortcuts**: Ctrl+N, Ctrl+F, Ctrl+I, Ctrl+S, Ctrl+P, Esc
**Features**: 
- KeyboardShortcuts component integrated
- Step-specific shortcut hints
- Enhanced keyboard handler with refs

## 🔄 Next Workflows to Implement

### Priority 1: Purchase Workflows

#### EnhancedPurchaseEntry.js
**File**: `frontend/src/components/purchase/EnhancedPurchaseEntry.js`

**Implementation Steps**:
```javascript
// 1. Import at top
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';

// 2. Add refs after state declarations
const supplierSearchRef = useRef(null);
const productSearchRef = useRef(null);

// 3. Add keyboard handler useEffect
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          if (currentStep === 2) {
            handleSave();
          } else {
            handleProceedToReview();
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
          setShowSupplierModal(true);
          break;
        case 'f':
          e.preventDefault();
          if (productSearchRef.current) {
            productSearchRef.current.focus();
          }
          break;
        case 'u':
          e.preventDefault();
          setShowPDFUpload(true);
          break;
        case 'g':
          e.preventDefault();
          // Open GST calculator if available
          break;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (showSupplierModal) setShowSupplierModal(false);
      else if (showPDFUpload) setShowPDFUpload(false);
      else if (currentStep === 2) setCurrentStep(1);
      else onClose?.();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [currentStep, showSupplierModal, showPDFUpload]);

// 4. Add KeyboardShortcuts component in JSX
// For Step 1:
<KeyboardShortcuts shortcuts={SHORTCUT_SETS.PURCHASE} />

// For Step 2:
<KeyboardShortcuts shortcuts={SHORTCUT_SETS.REVIEW} />
```

### Priority 2: Return Workflows

#### SalesReturnFlow.js
**File**: `frontend/src/components/returns/SalesReturnFlow.js`

**Implementation Steps**:
```javascript
// 1. Import
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';

// 2. Add refs
const customerSearchRef = useRef(null);
const invoiceSearchRef = useRef(null);
const productSearchRef = useRef(null);

// 3. Add keyboard handler
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 's':
          e.preventDefault();
          if (currentStep === 2) {
            handleSaveReturn();
          } else {
            handleProceed();
          }
          break;
        case 'r':
          e.preventDefault();
          if (customerSearchRef.current) {
            customerSearchRef.current.focus();
          }
          break;
        case 'i':
          e.preventDefault();
          if (invoiceSearchRef.current) {
            invoiceSearchRef.current.focus();
          }
          break;
        case 'f':
          e.preventDefault();
          if (productSearchRef.current) {
            productSearchRef.current.focus();
          }
          break;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (currentStep === 2) setCurrentStep(1);
      else onClose?.();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [currentStep]);

// 4. Add to JSX
<KeyboardShortcuts shortcuts={SHORTCUT_SETS.RETURNS} />
```

#### PurchaseReturnFlowV2.js
**File**: `frontend/src/components/returns/PurchaseReturnFlowV2.js`
**Similar implementation** to SalesReturnFlow but with supplier instead of customer

### Priority 3: Stock Workflows

#### EnhancedStockAdjustmentFlow.js
**File**: `frontend/src/components/stock/EnhancedStockAdjustmentFlow.js`

**Shortcuts to Add**:
- Ctrl+F - Search Products
- Ctrl+S - Save Adjustment
- Esc - Close

#### StockTransfer.js
**File**: `frontend/src/components/stock/StockTransfer.js`

**Shortcuts to Add**:
- Ctrl+F - Search Products
- Ctrl+S - Process Transfer
- Esc - Close

## 📝 Standard Template

For any new workflow, use this template:

```javascript
// === IMPORTS ===
import React, { useState, useEffect, useRef } from 'react';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../global/ui/KeyboardShortcuts';

// === COMPONENT ===
const YourWorkflowComponent = ({ onClose }) => {
  // === STATE ===
  const [currentStep, setCurrentStep] = useState(1);
  
  // === REFS FOR KEYBOARD NAVIGATION ===
  const partySearchRef = useRef(null);
  const productSearchRef = useRef(null);
  
  // === KEYBOARD SHORTCUTS ===
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault();
            // Save or proceed logic
            break;
          case 'p':
            e.preventDefault();
            // Print logic
            break;
          case 'n':
            e.preventDefault();
            // Add party logic
            break;
          case 'f':
            e.preventDefault();
            // Focus product search
            if (productSearchRef.current) {
              productSearchRef.current.focus();
            }
            break;
        }
      }
      
      // Escape key
      else if (e.key === 'Escape') {
        e.preventDefault();
        // Back or close logic
        if (currentStep > 1) {
          setCurrentStep(currentStep - 1);
        } else {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep /* add other dependencies */]);
  
  // === JSX ===
  return (
    <div>
      {/* Header */}
      <ModuleHeader {...props} />
      
      {/* Keyboard Shortcuts Display */}
      <KeyboardShortcuts shortcuts={
        currentStep === 1 ? SHORTCUT_SETS.CREATE : SHORTCUT_SETS.REVIEW
      } />
      
      {/* Rest of your component */}
    </div>
  );
};
```

## 🎯 Available SHORTCUT_SETS

From `frontend/src/components/global/ui/KeyboardShortcuts.js`:

- `SHORTCUT_SETS.CREATE` - For document creation (step 1)
- `SHORTCUT_SETS.REVIEW` - For review/save (step 2)
- `SHORTCUT_SETS.LIST` - For list/management views
- `SHORTCUT_SETS.PURCHASE` - Purchase-specific shortcuts
- `SHORTCUT_SETS.RETURNS` - Returns-specific shortcuts

## ✨ Benefits

1. **Faster Data Entry** - Users can navigate without touching mouse
2. **Professional Experience** - Desktop software feel
3. **Consistency** - Same shortcuts across all workflows
4. **Discoverability** - Visual shortcut hints at top of form
5. **Accessibility** - Better for power users and accessibility needs

## 🧪 Testing Checklist

After implementing keyboard shortcuts:

- [ ] Ctrl+S works for save/proceed
- [ ] Ctrl+P works for print (where applicable)
- [ ] Ctrl+N opens party modal
- [ ] Ctrl+F focuses product search
- [ ] Esc closes modals/goes back
- [ ] Shortcuts work on both Mac (Cmd) and Windows (Ctrl)
- [ ] KeyboardShortcuts component displays correctly
- [ ] No conflicts with browser shortcuts
- [ ] Focus management works properly

## 📦 Deployment Plan

### Phase 1 (Completed - Just Deployed)
- ✅ InvoiceFlow
- ✅ ModularChallanCreatorV5

### Phase 2 (Next)
- [ ] EnhancedPurchaseEntry
- [ ] SalesReturnFlow
- [ ] PurchaseReturnFlowV2

### Phase 3 (Later)
- [ ] EnhancedStockAdjustmentFlow
- [ ] StockTransfer
- [ ] Other stock workflows

## 🚀 Quick Start

To add keyboard shortcuts to a new workflow:

1. Copy the template above
2. Customize shortcuts for your workflow needs
3. Add KeyboardShortcuts component display
4. Test all shortcuts
5. Deploy!

## 📞 Support

If you need help implementing keyboard shortcuts in a specific workflow, refer to:
- InvoiceFlow.js - Most complete reference implementation
- ModularChallanCreatorV5.js - Recently enhanced example
- This guide - Standard patterns and templates
