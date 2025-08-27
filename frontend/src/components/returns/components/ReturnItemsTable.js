import React from 'react';
import { Trash2 } from 'lucide-react';

const ReturnItemsTable = ({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  includeGst = true,
  showManualEntry = false
}) => {
  // Calculate item amounts
  const calculateItemAmount = (item) => {
    const returnQty = parseFloat(item.return_quantity) || 0;
    const rate = parseFloat(item.rate) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    
    const baseAmount = returnQty * rate;
    const discountAmount = (baseAmount * discountPercent) / 100;
    const afterDiscount = baseAmount - discountAmount;
    
    const taxPercent = includeGst ? (parseFloat(item.tax_percent) || 0) : 0;
    const taxAmount = (afterDiscount * taxPercent) / 100;
    
    return {
      baseAmount,
      discountAmount,
      taxAmount,
      totalAmount: afterDiscount + taxAmount
    };
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Select
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Product
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Original Qty
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Return Qty
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rate
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Discount %
            </th>
            {includeGst && (
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                GST %
              </th>
            )}
            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
            {onRemoveItem && (
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item, index) => {
            const amounts = calculateItemAmount(item);
            const isManual = item.is_manual || showManualEntry;
            
            return (
              <tr key={item.id || index} className={!item.selected ? 'opacity-50' : ''}>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={item.selected || false}
                    onChange={(e) => onUpdateItem(index, 'selected', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-3 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {item.product_name}
                  </div>
                  {item.hsn_code && (
                    <div className="text-xs text-gray-500">HSN: {item.hsn_code}</div>
                  )}
                  {item.batch_no && (
                    <div className="text-xs text-gray-500">Batch: {item.batch_no}</div>
                  )}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-center">
                  <div className="text-sm text-gray-900">
                    {item.quantity || '-'}
                  </div>
                  {!isManual && item.max_returnable_qty < item.quantity && (
                    <div className="text-xs text-orange-600">
                      Max: {item.max_returnable_qty}
                    </div>
                  )}
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.return_quantity || ''}
                    onChange={(e) => onUpdateItem(index, 'return_quantity', e.target.value)}
                    className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                    min="0"
                    max={isManual ? undefined : item.max_returnable_qty}
                    disabled={!item.selected}
                  />
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.rate || ''}
                    onChange={(e) => onUpdateItem(index, 'rate', e.target.value)}
                    className="w-24 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                    min="0"
                    step="0.01"
                    disabled={!isManual || !item.selected}
                    readOnly={!isManual}
                  />
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="number"
                    value={item.discount_percent || ''}
                    onChange={(e) => onUpdateItem(index, 'discount_percent', e.target.value)}
                    className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                    min="0"
                    max="100"
                    disabled={!item.selected}
                  />
                </td>
                {includeGst && (
                  <td className="px-3 py-4 whitespace-nowrap">
                    <input
                      type="number"
                      value={item.tax_percent || ''}
                      onChange={(e) => onUpdateItem(index, 'tax_percent', e.target.value)}
                      className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                      min="0"
                      max="28"
                      disabled={!isManual || !item.selected}
                      readOnly={!isManual}
                    />
                  </td>
                )}
                <td className="px-3 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-medium text-gray-900">
                    ₹{amounts.totalAmount.toFixed(2)}
                  </div>
                  {amounts.discountAmount > 0 && (
                    <div className="text-xs text-gray-500">
                      Disc: ₹{amounts.discountAmount.toFixed(2)}
                    </div>
                  )}
                </td>
                {onRemoveItem && (
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => onRemoveItem(item.id || index)}
                      className="text-red-600 hover:text-red-900"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={includeGst ? 9 : 8} className="px-3 py-8 text-center text-gray-500">
                No items to display
              </td>
            </tr>
          )}
        </tbody>
        <tfoot className="bg-gray-50">
          <tr>
            <td colSpan={includeGst ? 7 : 6} className="px-3 py-3 text-right font-medium text-gray-700">
              Total:
            </td>
            <td className="px-3 py-3 text-right">
              <div className="text-lg font-bold text-gray-900">
                ₹{items.reduce((sum, item) => {
                  if (!item.selected) return sum;
                  return sum + calculateItemAmount(item).totalAmount;
                }, 0).toFixed(2)}
              </div>
            </td>
            {onRemoveItem && <td></td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default ReturnItemsTable;