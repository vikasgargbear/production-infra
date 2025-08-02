import React from 'react';
import { Trash2 } from 'lucide-react';

/**
 * Global PharmaItemsTable Component
 * Reusable table for pharmaceutical items in purchase orders, GRN, etc.
 * Includes pharma-specific fields like pack size, manufacturer, schedule, etc.
 */
const PharmaItemsTable = ({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  readOnly = false,
  showActions = true,
  currencySymbol = '₹',
  showFreeQuantity = true,
  showScheme = false,
  showSchedule = true,
  showManufacturer = true,
  className = '',
  isPurchaseOrder = false
}) => {
  
  const formatCurrency = (amount) => {
    return `${currencySymbol}${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  const calculateItemTotal = (item) => {
    const quantity = parseFloat(item.quantity) || 0;
    // Use purchase_price if available (for purchase orders), otherwise use rate
    const rate = parseFloat(item.purchase_price || item.rate) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const itemTotal = quantity * rate;
    const discountAmount = (itemTotal * discountPercent) / 100;
    const taxableAmount = itemTotal - discountAmount;
    const taxAmount = (taxableAmount * (parseFloat(item.tax_percent) || 0)) / 100;
    return taxableAmount + taxAmount;
  };

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <div className="w-12 h-12 text-gray-400 mx-auto mb-3">📦</div>
        <p className="text-gray-600">No items added yet</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead className="bg-gray-50">
          <tr>
            <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
            <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
            <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">HSN</th>
            <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pack</th>
            {showManufacturer && (
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Mfr</th>
            )}
            <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Qty</th>
            {showFreeQuantity && (
              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Free</th>
            )}
            <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{isPurchaseOrder ? 'Cost' : 'Rate'}</th>
            <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">MRP</th>
            <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Disc%</th>
            {showScheme && (
              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scheme</th>
            )}
            <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">GST%</th>
            {showSchedule && (
              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Sch</th>
            )}
            <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            {showActions && !readOnly && (
              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const totalAmount = calculateItemTotal(item);

            return (
              <tr key={item.id || index} className="hover:bg-gray-50">
                <td className="border border-gray-200 px-3 py-2 text-sm">{index + 1}</td>
                <td className="border border-gray-200 px-3 py-2 text-sm font-medium">{item.product_name}</td>
                <td className="border border-gray-200 px-3 py-2 text-sm">{item.hsn_code || '-'}</td>
                <td className="border border-gray-200 px-3 py-2 text-sm">
                  {readOnly ? (
                    <span>{item.pack_size || '-'}</span>
                  ) : (
                    <input
                      type="text"
                      value={item.pack_size || ''}
                      onChange={(e) => onUpdateItem(item.id, 'pack_size', e.target.value)}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="1x10"
                    />
                  )}
                </td>
                {showManufacturer && (
                  <td className="border border-gray-200 px-3 py-2 text-sm">
                    {readOnly ? (
                      <span>{item.manufacturer || '-'}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.manufacturer || ''}
                        onChange={(e) => onUpdateItem(item.id, 'manufacturer', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="Manufacturer"
                      />
                    )}
                  </td>
                )}
                <td className="border border-gray-200 px-3 py-2 text-center">
                  {readOnly ? (
                    <span className="font-medium">{item.quantity}</span>
                  ) : (
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => onUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-16 text-center px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="1"
                    />
                  )}
                </td>
                {showFreeQuantity && (
                  <td className="border border-gray-200 px-3 py-2 text-center">
                    {readOnly ? (
                      <span>{item.free_quantity || 0}</span>
                    ) : (
                      <input
                        type="number"
                        value={item.free_quantity || 0}
                        onChange={(e) => onUpdateItem(item.id, 'free_quantity', parseInt(e.target.value) || 0)}
                        className="w-16 text-center px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        min="0"
                      />
                    )}
                  </td>
                )}
                <td className="border border-gray-200 px-3 py-2 text-right">
                  {readOnly ? (
                    <span>{formatCurrency(item.purchase_price || item.rate)}</span>
                  ) : (
                    <input
                      type="number"
                      value={item.purchase_price || item.rate || ''}
                      onChange={(e) => onUpdateItem(item.id, 'purchase_price', parseFloat(e.target.value) || 0)}
                      className="w-20 text-right px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="0.01"
                      step="0.01"
                    />
                  )}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-right">
                  {readOnly ? (
                    <span>{formatCurrency(item.mrp)}</span>
                  ) : (
                    <input
                      type="number"
                      value={item.mrp || ''}
                      onChange={(e) => onUpdateItem(item.id, 'mrp', parseFloat(e.target.value) || 0)}
                      className="w-20 text-right px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="0.01"
                      step="0.01"
                    />
                  )}
                </td>
                <td className="border border-gray-200 px-3 py-2 text-center">
                  {readOnly ? (
                    <span>{item.discount_percent || 0}%</span>
                  ) : (
                    <input
                      type="number"
                      value={item.discount_percent || 0}
                      onChange={(e) => onUpdateItem(item.id, 'discount_percent', parseFloat(e.target.value) || 0)}
                      className="w-16 text-center px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  )}
                </td>
                {showScheme && (
                  <td className="border border-gray-200 px-3 py-2 text-sm">
                    {readOnly ? (
                      <span>{item.scheme || '-'}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.scheme || ''}
                        onChange={(e) => onUpdateItem(item.id, 'scheme', e.target.value)}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="Scheme"
                      />
                    )}
                  </td>
                )}
                <td className="border border-gray-200 px-3 py-2 text-center">
                  {readOnly ? (
                    <span>{item.tax_percent || 0}%</span>
                  ) : (
                    <select
                      value={item.tax_percent || 12}
                      onChange={(e) => onUpdateItem(item.id, 'tax_percent', parseFloat(e.target.value))}
                      className="w-16 text-center px-1 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  )}
                </td>
                {showSchedule && (
                  <td className="border border-gray-200 px-3 py-2 text-center">
                    {readOnly ? (
                      <span>{item.schedule || 'H'}</span>
                    ) : (
                      <input
                        type="text"
                        value={item.schedule || 'H'}
                        onChange={(e) => onUpdateItem(item.id, 'schedule', e.target.value)}
                        className="w-12 text-center px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="H"
                      />
                    )}
                  </td>
                )}
                <td className="border border-gray-200 px-3 py-2 text-right font-medium">
                  {formatCurrency(totalAmount)}
                </td>
                {showActions && !readOnly && (
                  <td className="border border-gray-200 px-3 py-2 text-center">
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="text-red-600 hover:text-red-900 hover:bg-red-50 p-1 rounded transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PharmaItemsTable;