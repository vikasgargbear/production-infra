import React, { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'react-toastify';

/**
 * TaxInputCell Component
 * Handles GST/Tax input with proper state management
 * Only updates on blur or Enter key to avoid premature updates
 */
const TaxInputCell = ({ item, index, onUpdateItem, gstPercent: initialGst }) => {
  const [localValue, setLocalValue] = useState(initialGst === 0 ? '' : initialGst.toString());
  const [isFocused, setIsFocused] = useState(false);
  
  const handleUpdate = (value) => {
    // Parse the value
    const numericValue = value === '' ? 0 : parseFloat(value) || 0;
    
    // Update all tax-related fields
    onUpdateItem(index, 'gst_percent', numericValue);
    onUpdateItem(index, 'tax_rate', numericValue);
    onUpdateItem(index, 'tax', numericValue);
    
    // Show toast only for valid values on blur
    if (numericValue > 0 && item.product_id) {
      toast.info(`GST ${numericValue}% set for ${item.product_name}`);
    }
  };
  
  return (
    <div className="flex items-center justify-center">
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          // Only allow numbers and decimal point
          const value = e.target.value.replace(/[^0-9.]/g, '');
          setLocalValue(value);
        }}
        onBlur={(e) => {
          handleUpdate(e.target.value);
          setIsFocused(false);
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleUpdate(localValue);
            e.target.blur();
          }
        }}
        placeholder="0"
        className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        title="Enter GST % (optional - defaults to 0%)"
      />
      <span className="ml-1 text-gray-600">%</span>
    </div>
  );
};

/**
 * Global ItemsTable Component
 * A clean, reusable table for displaying line items in invoices, challans, orders etc.
 * Based on the clean InvoiceItemsTable design
 */
const ItemsTable = ({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  totals,
  readOnly = false,
  showActions = true,
  showTotals = true,
  currencySymbol = '₹',
  columns = ['product', 'quantity', 'unit', 'mrp', 'rate', 'discount', 'free', 'tax', 'total'],
  customColumns = {},
  className = '',
  title = 'Items'
}) => {
  
  const formatCurrency = (amount) => {
    return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  // DISPLAY ONLY: Use pre-calculated values from API
  const getItemTotal = (item) => {
    // Priority: Use API-calculated values if available
    if (item.calculated_total !== undefined) return item.calculated_total; // Sales order calculation
    if (item.line_total !== undefined) return item.line_total; // Invoice calculation
    if (item.total_amount !== undefined) return item.total_amount;
    if (item.itemTotal !== undefined) return item.itemTotal;
    
    const baseQuantity = parseFloat(item.base_quantity || item.quantity) || 0;  // What customer pays for
    const rate = parseFloat(item.rate || item.sale_price || item.unit_price) || 0;
    const discount = parseFloat(item.discount || item.discount_percent) || 0;
    const tax = parseFloat(item.tax || item.tax_rate || item.gst_percent) || 0;
    
    const subtotal = baseQuantity * rate;
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * tax) / 100;
    
    return taxableAmount + taxAmount;
  };

  const columnConfig = {
    product: { 
      label: 'Product', 
      align: 'left',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">
            {item.product_name || item.productName || item.name || '-'}
          </p>
          {(item.batch || item.batch_number || item.batch_no) && (
            <p className="text-xs text-gray-500 mt-0.5">
              Batch: {item.batch || item.batch_number || item.batch_no}
            </p>
          )}
          {/* Pack info display */}
          {(item.packages_per_box || item.units_per_pack || item.category) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {item.category && <span>{item.category}</span>}
              {item.packages_per_box && item.units_per_pack && (
                <span>{item.category ? ' • ' : ''}{item.packages_per_box}×{item.units_per_pack}</span>
              )}
            </p>
          )}
        </div>
      )
    },
    quantity: { 
      label: 'Quantity', 
      align: 'center',
      render: (item, index) => readOnly ? (
        <span className="text-gray-900 font-medium">{item.quantity}</span>
      ) : (
        <input
          type="number"
          value={item.quantity || ''}
          onChange={(e) => onUpdateItem(index, 'quantity', e.target.value)}
          className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
          min="1"
          max={item.available_quantity}
        />
      )
    },
    mrp: { 
      label: 'MRP', 
      align: 'center',
      render: (item) => (
        <span 
          className="text-gray-700 bg-gray-50 px-2 py-1 rounded text-xs font-medium"
          title="MRP from product master data (read-only)"
        >
          {formatCurrency(item.mrp || item.sale_price)}
        </span>
      )
    },
    rate: { 
      label: 'Rate', 
      align: 'center',
      render: (item) => formatCurrency(item.rate || item.sale_price || item.unit_price)
    },
    discount: { 
      label: 'Discount %', 
      align: 'center',
      render: (item, index) => readOnly ? (
        <span>{item.discount || item.discount_percent || 0}%</span>
      ) : (
        <input
          type="number"
          value={item.discount_percent || item.discount || ''}
          onChange={(e) => onUpdateItem(index, 'discount_percent', e.target.value)}
          className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
          min="0"
          max="100"
          step="0.01"
        />
      )
    },
    free: { 
      label: 'Free', 
      align: 'center',
      render: (item, index) => readOnly ? (
        <span>{item.free || item.free_quantity || 0}</span>
      ) : (
        <input
          type="number"
          value={item.free_quantity || item.free || ''}
          onChange={(e) => onUpdateItem(index, 'free_quantity', e.target.value)}
          className="w-16 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
          min="0"
        />
      )
    },
    unit: {
      label: 'Unit',
      align: 'center',
      render: (item) => {
        // Get unit from backend data - no hardcoding
        const unit = item.unit || item.base_uom || item.uom_code || '';
        // Only clean obvious typos, don't force to 'Strip'
        const cleanUnit = unit.replace(/NOC/gi, 'NOS'); // Fix common typo
        return <span>{cleanUnit || 'Unit'}</span>;
      }
    },
    tax: {
      label: 'Tax %',
      align: 'center',
      render: (item, index) => {
        // Parse GST value - handle undefined, null, empty string
        const gstValue = item.gst_percent ?? item.tax_rate ?? item.tax ?? '';
        const gstPercent = gstValue === '' ? '0' : parseFloat(gstValue) || 0;
        
        // GST percentage is read-only - comes from product master data
        // Display with subtle styling to indicate it's from master data
        return (
          <span 
            className="text-gray-700 bg-gray-50 px-2 py-1 rounded text-xs font-medium"
            title="Tax percentage from product master data (read-only)"
          >
            {gstPercent}%
          </span>
        );
      }
    },
    total: { 
      label: 'Total', 
      align: 'right',
      render: (item) => (
        <span className="font-semibold text-gray-900">
          {formatCurrency(getItemTotal(item))}
        </span>
      )
    },
    ...customColumns
  };

  const visibleColumns = columns.filter(col => columnConfig[col]);

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-2 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {visibleColumns.map((col, index) => (
                <th 
                  key={col} 
                  className={`px-2 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-${columnConfig[col].align} ${
                    index !== visibleColumns.length - 1 ? 'border-r border-gray-200' : ''
                  }`}
                >
                  {columnConfig[col].label}
                </th>
              ))}
              {showActions && !readOnly && (
                <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (showActions ? 1 : 0)} className="px-2 py-16 text-center">
                  <div className="text-gray-400">
                    <p className="text-sm">No items added yet</p>
                    <p className="text-xs mt-1">Search and add products to create {title.toLowerCase()}</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={item.id || index} className="hover:bg-gray-50">
                  {visibleColumns.map(col => (
                    <td 
                      key={col} 
                      className={`px-2 py-4 whitespace-nowrap text-sm text-${columnConfig[col].align}`}
                    >
                      {columnConfig[col].render(item, index)}
                    </td>
                  ))}
                  {showActions && !readOnly && (
                    <td className="px-2 py-4 whitespace-nowrap text-center text-sm">
                      <button
                        onClick={() => onRemoveItem(index)}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50 p-1 rounded transition-colors"
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
      </div>

      {/* Totals Section */}
      {showTotals && items.length > 0 && totals && (
        <div className="px-2 py-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="uppercase tracking-wider">Total Amount</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {formatCurrency(totals.finalAmount || totals.total || totals.grandTotal)}
            </div>
          </div>
        </div>
      )}

      {/* Add Item Button */}
      {!readOnly && onAddItem && (
        <div className="px-2 py-4 border-t border-gray-200">
          <button
            onClick={onAddItem}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      )}
    </div>
  );
};

export default ItemsTable;