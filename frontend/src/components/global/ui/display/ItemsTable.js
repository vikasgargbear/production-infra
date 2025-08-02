import React from 'react';
import { Trash2, Plus } from 'lucide-react';

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
  columns = ['product', 'quantity', 'mrp', 'rate', 'discount', 'free', 'total'],
  customColumns = {},
  className = '',
  title = 'Items'
}) => {
  
  const formatCurrency = (amount) => {
    return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  const calculateItemTotal = (item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.rate || item.sale_price || item.unit_price) || 0;
    const discount = parseFloat(item.discount || item.discount_percent) || 0;
    const tax = parseFloat(item.tax || item.tax_rate || item.gst_percent) || 0;
    
    const subtotal = quantity * rate;
    const discountAmount = (subtotal * discount) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * tax) / 100;
    
    return item.final_amount || (taxableAmount + taxAmount);
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
          className="w-20 text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md text-gray-900 font-medium"
          min="1"
          max={item.available_quantity}
        />
      )
    },
    mrp: { 
      label: 'MRP', 
      align: 'center',
      render: (item) => formatCurrency(item.mrp || item.sale_price)
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
          className="w-20 text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md text-gray-900 font-medium"
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
          className="w-16 text-center border-0 bg-transparent focus:ring-2 focus:ring-blue-500 rounded-md text-gray-900 font-medium"
          min="0"
        />
      )
    },
    tax: {
      label: 'Tax %',
      align: 'center',
      render: (item) => <span>{item.tax || item.tax_rate || item.gst_percent || 0}%</span>
    },
    total: { 
      label: 'Total', 
      align: 'right',
      render: (item) => (
        <span className="font-semibold text-gray-900">
          {formatCurrency(calculateItemTotal(item))}
        </span>
      )
    },
    ...customColumns
  };

  const visibleColumns = columns.filter(col => columnConfig[col]);

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">{title}</h3>
      </div>

      {/* Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {visibleColumns.map(col => (
                <th 
                  key={col} 
                  className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-${columnConfig[col].align}`}
                >
                  {columnConfig[col].label}
                </th>
              ))}
              {showActions && !readOnly && (
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (showActions ? 1 : 0)} className="px-6 py-16 text-center">
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
                      className={`px-6 py-4 whitespace-nowrap text-sm text-${columnConfig[col].align}`}
                    >
                      {columnConfig[col].render(item, index)}
                    </td>
                  ))}
                  {showActions && !readOnly && (
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
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
        <div className="px-6 py-6 border-t border-gray-200 bg-gray-50">
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
        <div className="px-6 py-4 border-t border-gray-200">
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