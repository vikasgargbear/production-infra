import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Trash2 } from 'lucide-react';
import EditableCell from './EditableCell';

/**
 * ItemsTableKeyboard - Enhanced ItemsTable with full keyboard navigation
 * Supports Tab, Enter, Arrow keys for Excel-like navigation
 * Similar to Marg/Tally billing software experience
 */
const ItemsTableKeyboard = forwardRef(({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  currencySymbol = '₹',
  readOnly = false,
  productSearchRef, // Ref to product search for auto-focus after last field
  className = ''
}, ref) => {
  
  // Store refs for all editable fields: { '0-quantity': ref, '0-rate': ref, ... }
  const fieldRefs = useRef({});
  
  // Editable fields in order
  const EDITABLE_FIELDS = ['quantity', 'rate', 'discount', 'free', 'tax'];
  
  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focusField: (rowIndex, fieldName) => {
      focusField(rowIndex, fieldName);
    },
    focusFirstField: () => {
      if (items.length > 0) {
        focusField(items.length - 1, 'quantity'); // Focus quantity of last added item
      }
    }
  }));

  const setFieldRef = (rowIndex, fieldName, element) => {
    const key = `${rowIndex}-${fieldName}`;
    fieldRefs.current[key] = element;
  };

  const focusField = (rowIndex, fieldName) => {
    const key = `${rowIndex}-${fieldName}`;
    const fieldRef = fieldRefs.current[key];
    
    if (fieldRef && fieldRef.focus) {
      setTimeout(() => {
        fieldRef.focus();
      }, 0);
    }
  };

  const handleNavigate = (currentRow, currentField, direction) => {
    const currentFieldIndex = EDITABLE_FIELDS.indexOf(currentField);
    
    switch(direction) {
      case 'right':
      case 'next':
        // Move to next field in same row
        if (currentFieldIndex < EDITABLE_FIELDS.length - 1) {
          focusField(currentRow, EDITABLE_FIELDS[currentFieldIndex + 1]);
        } 
        // Or first field of next row
        else if (currentRow < items.length - 1) {
          focusField(currentRow + 1, EDITABLE_FIELDS[0]);
        } 
        // Or back to product search (add next product)
        else {
          if (productSearchRef?.current) {
            setTimeout(() => {
              productSearchRef.current.focus();
            }, 0);
          }
        }
        break;
        
      case 'left':
        // Move to previous field in same row
        if (currentFieldIndex > 0) {
          focusField(currentRow, EDITABLE_FIELDS[currentFieldIndex - 1]);
        }
        // Or last field of previous row
        else if (currentRow > 0) {
          focusField(currentRow - 1, EDITABLE_FIELDS[EDITABLE_FIELDS.length - 1]);
        }
        break;
        
      case 'down':
        // Move to same field in next row
        if (currentRow < items.length - 1) {
          focusField(currentRow + 1, currentField);
        }
        break;
        
      case 'up':
        // Move to same field in previous row
        if (currentRow > 0) {
          focusField(currentRow - 1, currentField);
        }
        break;
        
      default:
        break;
    }
  };

  const formatCurrency = (amount) => {
    return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  const calculateItemTotal = (item) => {
    // Use pre-calculated total if available
    if (item.line_total !== undefined) return item.line_total;
    if (item.total_amount !== undefined) return item.total_amount;
    
    const baseQuantity = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate || item.sale_price) || 0;
    const discount = parseFloat(item.discount || item.discount_percent || 0) || 0;
    const gstPercent = parseFloat(item.gst_percent || item.tax_rate || 0) || 0;
    
    const subtotal = baseQuantity * rate;
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const total = taxableAmount + gstAmount;
    
    return total;
  };

  // Auto-focus quantity field when items change (new item added)
  useEffect(() => {
    if (items.length > 0 && !readOnly) {
      // Check if a new item was just added (last item has default quantity)
      const lastItem = items[items.length - 1];
      if (lastItem.quantity === 1 || lastItem.quantity === 0) {
        // This might be a newly added item, try to focus it
        const key = `${items.length - 1}-quantity`;
        if (fieldRefs.current[key]) {
          setTimeout(() => {
            fieldRefs.current[key]?.focus();
          }, 100);
        }
      }
    }
  }, [items.length, readOnly]);

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              #
            </th>
            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Product
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Batch
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Qty
              <div className="text-[10px] font-normal text-gray-500">Enter/Tab →</div>
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              MRP
              <div className="text-[10px] font-normal text-gray-500">(Read-only)</div>
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Rate
              <div className="text-[10px] font-normal text-gray-500">Editable</div>
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Disc %
              <div className="text-[10px] font-normal text-gray-500">Optional</div>
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Free
              <div className="text-[10px] font-normal text-gray-500">Bonus Qty</div>
            </th>
            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Tax %
              <div className="text-[10px] font-normal text-gray-500">Editable</div>
            </th>
            <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Total
            </th>
            {!readOnly && (
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={readOnly ? 10 : 11} className="px-3 py-8 text-center text-gray-500">
                <div className="flex flex-col items-center">
                  <p className="text-sm">No items added yet</p>
                  <p className="text-xs text-gray-400 mt-1">Search and select products to add</p>
                </div>
              </td>
            </tr>
          ) : (
            items.map((item, index) => (
              <tr 
                key={item.id || index} 
                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
              >
                {/* Serial Number */}
                <td className="px-3 py-2 text-sm text-gray-600">
                  {index + 1}
                </td>
                
                {/* Product Name */}
                <td className="px-3 py-2">
                  <div className="text-sm font-medium text-gray-900">
                    {item.product_name || item.name}
                  </div>
                  {item.product_code && (
                    <div className="text-xs text-gray-500">
                      Code: {item.product_code}
                    </div>
                  )}
                </td>
                
                {/* Batch Number */}
                <td className="px-3 py-2 text-center">
                  <div className="text-xs text-gray-600">
                    {item.batch_number || item.batch_no || 'N/A'}
                  </div>
                  {item.expiry_date && (
                    <div className="text-[10px] text-gray-400">
                      Exp: {new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                    </div>
                  )}
                </td>
                
                {/* Quantity - Editable */}
                <td className="px-3 py-2">
                  <EditableCell
                    ref={(el) => setFieldRef(index, 'quantity', el)}
                    value={item.quantity || 0}
                    type="number"
                    min={0}
                    step={1}
                    decimalPlaces={0}
                    onSave={(val) => onUpdateItem(index, 'quantity', val)}
                    onNavigate={(dir) => handleNavigate(index, 'quantity', dir)}
                    readOnly={readOnly}
                    selectOnFocus={true}
                    className="w-20"
                  />
                </td>
                
                {/* MRP - Read Only */}
                <td className="px-3 py-2 text-center">
                  <div className="text-sm text-gray-700 font-medium bg-gray-50 px-2 py-1.5 rounded border border-gray-200">
                    {formatCurrency(item.mrp || 0)}
                  </div>
                </td>
                
                {/* Rate - Editable */}
                <td className="px-3 py-2">
                  <EditableCell
                    ref={(el) => setFieldRef(index, 'rate', el)}
                    value={item.rate || item.sale_price || 0}
                    type="number"
                    min={0}
                    decimalPlaces={2}
                    prefix={currencySymbol}
                    onSave={(val) => onUpdateItem(index, 'rate', val)}
                    onNavigate={(dir) => handleNavigate(index, 'rate', dir)}
                    readOnly={readOnly}
                    selectOnFocus={true}
                    className="w-24"
                  />
                </td>
                
                {/* Discount % - Editable */}
                <td className="px-3 py-2">
                  <EditableCell
                    ref={(el) => setFieldRef(index, 'discount', el)}
                    value={item.discount || 0}
                    type="number"
                    min={0}
                    max={100}
                    decimalPlaces={2}
                    suffix="%"
                    onSave={(val) => onUpdateItem(index, 'discount', val)}
                    onNavigate={(dir) => handleNavigate(index, 'discount', dir)}
                    readOnly={readOnly}
                    selectOnFocus={true}
                    className="w-20"
                  />
                </td>
                
                {/* Free Quantity - Editable */}
                <td className="px-3 py-2">
                  <EditableCell
                    ref={(el) => setFieldRef(index, 'free', el)}
                    value={item.free_quantity || item.free || 0}
                    type="number"
                    min={0}
                    decimalPlaces={0}
                    onSave={(val) => onUpdateItem(index, 'free_quantity', val)}
                    onNavigate={(dir) => handleNavigate(index, 'free', dir)}
                    readOnly={readOnly}
                    selectOnFocus={true}
                    className="w-16"
                  />
                </td>
                
                {/* Tax % - Editable */}
                <td className="px-3 py-2">
                  <EditableCell
                    ref={(el) => setFieldRef(index, 'tax', el)}
                    value={item.gst_percent || item.tax_rate || 0}
                    type="number"
                    min={0}
                    max={28}
                    decimalPlaces={2}
                    suffix="%"
                    onSave={(val) => {
                      onUpdateItem(index, 'gst_percent', val);
                      onUpdateItem(index, 'tax_rate', val);
                    }}
                    onNavigate={(dir) => handleNavigate(index, 'tax', dir)}
                    readOnly={readOnly}
                    selectOnFocus={true}
                    className="w-20"
                  />
                </td>
                
                {/* Total - Calculated */}
                <td className="px-3 py-2 text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatCurrency(calculateItemTotal(item))}
                  </div>
                </td>
                
                {/* Actions */}
                {!readOnly && (
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      
      {/* Keyboard Navigation Guide */}
      {!readOnly && items.length > 0 && (
        <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-gray-600">
          <strong className="text-blue-700">Keyboard Navigation:</strong> 
          <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Tab</kbd> Next field • 
          <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Enter</kbd> Save & next • 
          <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">↓↑</kbd> Navigate rows • 
          <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Esc</kbd> Cancel • 
          <span className="text-blue-600 font-medium">Last field → Product search</span>
        </div>
      )}
    </div>
  );
});

ItemsTableKeyboard.displayName = 'ItemsTableKeyboard';

export default ItemsTableKeyboard;
