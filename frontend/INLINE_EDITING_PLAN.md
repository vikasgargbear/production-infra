# Inline Editing Implementation Plan
## Marg-Style Keyboard Navigation for Items Table

## Current Status

### ✅ Fixed: Customer Search Enter Key
**Issue**: `highlightedIndex` was being reset to -1 by a competing useEffect
**Fix**: Changed the useEffect to auto-highlight first result instead of resetting
```typescript
// BEFORE (broken)
useEffect(() => {
  setHighlightedIndex(-1); // Always resets!
}, [searchResults]);

// AFTER (working)
useEffect(() => {
  if (searchResults.length > 0) {
    setHighlightedIndex(0); // Auto-highlight first
  } else {
    setHighlightedIndex(-1);
  }
}, [searchResults]);
```

Now Enter key will work to select customers!

---

## New Feature: Inline Editing (Marg-Style)

### User Flow (Like Marg Software)
```
Product added → Focus on Quantity
             → Enter/Tab → Focus on Rate
             → Enter/Tab → Focus on Discount
             → Enter/Tab → Focus on Free Qty
             → Enter/Tab → Editable Tax %
             → Enter → Next product (focus product search)
```

### Requirements

#### 1. **Editable Fields in Table**
- ✅ Quantity (already editable)
- ✅ Rate (already editable via TaxInputCell pattern)
- ✅ Discount % (already editable)
- ✅ Free Quantity (already editable)
- ✅ Tax % (already editable with TaxInputCell)
- ❌ MRP (read-only, from batch)
- ❌ Total (calculated, read-only)

#### 2. **Keyboard Navigation**
- **Tab** → Move to next field (→)
- **Shift+Tab** → Move to previous field (←)
- **Enter** → Save & move to next field
- **Esc** → Cancel edit & restore original value
- **↓** → Move to same field in next row
- **↑** → Move to same field in previous row
- **Last field + Enter** → Focus product search (add next item)

#### 3. **Auto-Focus After Add**
When product added:
1. Item appears in table
2. Quantity field auto-focused
3. User can immediately type quantity
4. Press Enter → move to Rate

#### 4. **Tax Behavior**
- **Fetch from backend** (product default)
- **Allow override** (user can edit)
- **Persist per item** (don't change after edit)
- **Visual indicator** (show if modified from default)

---

## Implementation Plan

### Phase 1: Basic Keyboard Navigation (2-3 hours)

#### Step 1: Create Editable Cell Component
```javascript
const EditableCell = ({ 
  value, 
  type = 'text',
  onSave,
  onNavigate, // (direction: 'up'|'down'|'left'|'right'|'next') => void
  readOnly = false,
  min, max, step,
  suffix // '%', '₹', etc.
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    switch(e.key) {
      case 'Enter':
        e.preventDefault();
        onSave(localValue);
        onNavigate('right'); // Move to next field
        break;
      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault();
          onSave(localValue);
          onNavigate('right');
        } else {
          e.preventDefault();
          onSave(localValue);
          onNavigate('left');
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        onSave(localValue);
        onNavigate('down');
        break;
      case 'ArrowUp':
        e.preventDefault();
        onSave(localValue);
        onNavigate('up');
        break;
      case 'Escape':
        e.preventDefault();
        setLocalValue(value); // Restore original
        setIsEditing(false);
        break;
    }
  };

  return (
    <input
      ref={inputRef}
      type={type}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={() => setIsEditing(true)}
      onBlur={() => {
        onSave(localValue);
        setIsEditing(false);
      }}
      className={`w-full px-2 py-1 text-right ${
        isEditing ? 'ring-2 ring-blue-500' : ''
      }`}
      readOnly={readOnly}
    />
  );
};
```

#### Step 2: Update ItemsTable with Field Refs
```javascript
const ItemsTable = ({ items, onUpdateItem, ... }) => {
  const fieldRefs = useRef({}); // { '0-quantity': ref, '0-rate': ref, ... }
  
  const setFieldRef = (rowIndex, fieldName, ref) => {
    fieldRefs.current[`${rowIndex}-${fieldName}`] = ref;
  };
  
  const focusField = (rowIndex, fieldName) => {
    const key = `${rowIndex}-${fieldName}`;
    if (fieldRefs.current[key]) {
      fieldRefs.current[key].focus();
    }
  };
  
  const handleNavigate = (currentRow, currentField, direction) => {
    const fields = ['quantity', 'rate', 'discount', 'free', 'tax'];
    const currentFieldIndex = fields.indexOf(currentField);
    
    switch(direction) {
      case 'right':
      case 'next':
        if (currentFieldIndex < fields.length - 1) {
          // Next field in same row
          focusField(currentRow, fields[currentFieldIndex + 1]);
        } else if (currentRow < items.length - 1) {
          // First field in next row
          focusField(currentRow + 1, fields[0]);
        } else {
          // Last field of last row → focus product search
          productSearchRef.current?.focus();
        }
        break;
        
      case 'left':
        if (currentFieldIndex > 0) {
          focusField(currentRow, fields[currentFieldIndex - 1]);
        }
        break;
        
      case 'down':
        if (currentRow < items.length - 1) {
          focusField(currentRow + 1, currentField);
        }
        break;
        
      case 'up':
        if (currentRow > 0) {
          focusField(currentRow - 1, currentField);
        }
        break;
    }
  };
  
  return (
    <table>
      {items.map((item, rowIndex) => (
        <tr key={item.id}>
          <td>
            <EditableCell
              ref={(el) => setFieldRef(rowIndex, 'quantity', el)}
              value={item.quantity}
              onSave={(val) => onUpdateItem(rowIndex, 'quantity', val)}
              onNavigate={(dir) => handleNavigate(rowIndex, 'quantity', dir)}
            />
          </td>
          <td>
            <EditableCell
              ref={(el) => setFieldRef(rowIndex, 'rate', el)}
              value={item.rate}
              onSave={(val) => onUpdateItem(rowIndex, 'rate', val)}
              onNavigate={(dir) => handleNavigate(rowIndex, 'rate', dir)}
            />
          </td>
          {/* ... other fields ... */}
        </tr>
      ))}
    </table>
  );
};
```

#### Step 3: Auto-Focus After Product Add
```javascript
// In InvoiceFlow.js
const handleAddItem = (product) => {
  // Add item logic...
  setInvoice(prev => ({
    ...prev,
    items: [...prev.items, newItem]
  }));
  
  // Auto-focus quantity field of new item
  setTimeout(() => {
    const newRowIndex = invoice.items.length;
    itemsTableRef.current?.focusField(newRowIndex, 'quantity');
  }, 100);
};
```

### Phase 2: Tax Field Enhancement (1 hour)

#### Backend Tax Fetch
```javascript
const TaxField = ({ item, rowIndex, productId, onUpdate, onNavigate }) => {
  const [tax, setTax] = useState(item.gst_percent || 0);
  const [defaultTax, setDefaultTax] = useState(null);
  const [isModified, setIsModified] = useState(false);
  
  useEffect(() => {
    // Fetch product default tax
    fetchProductTax(productId).then(productTax => {
      setDefaultTax(productTax);
      if (!item.gst_percent) {
        setTax(productTax);
        onUpdate(rowIndex, 'gst_percent', productTax);
      }
    });
  }, [productId]);
  
  const handleSave = (value) => {
    const numValue = parseFloat(value) || 0;
    setTax(numValue);
    onUpdate(rowIndex, 'gst_percent', numValue);
    
    // Check if modified from default
    if (numValue !== defaultTax) {
      setIsModified(true);
    }
  };
  
  return (
    <div className="relative">
      <EditableCell
        value={tax}
        onSave={handleSave}
        onNavigate={onNavigate}
        suffix="%"
      />
      {isModified && (
        <span className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full"
              title={`Modified from default ${defaultTax}%`}
        />
      )}
    </div>
  );
};
```

### Phase 3: Visual Enhancements (30 mins)

#### Focus Indicators
```css
/* Focused cell */
.cell-focused {
  @apply ring-2 ring-blue-500 bg-blue-50;
}

/* Modified cell */
.cell-modified {
  @apply bg-yellow-50 border-l-2 border-yellow-400;
}

/* Error cell */
.cell-error {
  @apply ring-2 ring-red-500 bg-red-50;
}
```

#### Keyboard Hints
```jsx
<div className="text-xs text-gray-500 mt-2">
  <kbd>Tab</kbd> Next field • 
  <kbd>Enter</kbd> Save & next • 
  <kbd>↓↑</kbd> Navigate rows • 
  <kbd>Esc</kbd> Cancel
</div>
```

---

## Testing Checklist

### Keyboard Navigation
- [ ] Add product → Quantity auto-focused
- [ ] Enter on quantity → Rate focused
- [ ] Tab through all fields → Works
- [ ] Shift+Tab backwards → Works
- [ ] ↓ on quantity → Next row quantity
- [ ] ↑ on rate → Previous row rate
- [ ] Last field + Enter → Product search focused

### Tax Field
- [ ] New item → Tax fetched from backend
- [ ] Edit tax → Value saved
- [ ] Modified tax → Orange dot indicator
- [ ] Enter on tax → Next row or product search

### Edge Cases
- [ ] Empty value → Defaults to 0
- [ ] Invalid input → Shows error
- [ ] Esc key → Restores original value
- [ ] First row ↑ → Stays on first row
- [ ] Last row ↓ → Stays on last row

---

## Timeline Estimate

- **Phase 1**: Basic keyboard navigation - 2-3 hours
- **Phase 2**: Tax field enhancement - 1 hour
- **Phase 3**: Visual polish - 30 mins
- **Testing**: 1 hour
- **Total**: ~5 hours

---

## Quick Win (15 mins)

For immediate improvement, just fix the auto-focus after product add:

```javascript
// In handleAddItem or handleBatchSelect callback
const handleAddItem = (product) => {
  // existing code...
  
  // Quick fix: Focus first editable field
  setTimeout(() => {
    const quantityInputs = document.querySelectorAll('input[name^="quantity"]');
    const lastInput = quantityInputs[quantityInputs.length - 1];
    if (lastInput) {
      lastInput.focus();
      lastInput.select(); // Select all for easy override
    }
  }, 150);
};
```

This gives 80% of the benefit with 5% of the work!

---

## Status

✅ **Fixed**: Customer search Enter key (highlightedIndex reset issue)
📋 **Planned**: Inline editing with full keyboard navigation
⏱️ **Estimate**: ~5 hours for complete Marg-style experience

**Next Steps**:
1. Test customer search fix (refresh browser)
2. Decide: Quick win (15 mins) or full implementation (5 hours)
3. I can implement either approach based on your priority

Let me know which direction you want to go! 🚀
