import React from 'react';
import { Package, AlertTriangle, CheckSquare } from 'lucide-react';

const ReturnItemsTable = ({ items = [], onUpdateItem, customer, includeGst = true }) => {
  const handleToggleItem = (itemId) => {
    onUpdateItem(itemId, 'selected', !items.find(i => i.id === itemId).selected);
  };

  const handleQuantityChange = (itemId, value) => {
    const item = items.find(i => i.id === itemId);
    
    if (!item) {
      return;
    }
    
    if (value <= item.max_returnable_qty) {
      // Auto-select if quantity > 0
      if (value > 0 && !item.selected) {
        onUpdateItem(itemId, 'selected', true);
      }
      // Auto-deselect if quantity is 0
      if (value === 0 && item.selected) {
        onUpdateItem(itemId, 'selected', false);
      }
      onUpdateItem(itemId, 'return_quantity', value);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <CheckSquare className="w-4 h-4" />
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Product
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Batch
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Expiry
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Sold Qty
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Already Returned
            </th>
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Return Qty
            </th>
            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rate
            </th>
            {customer?.gst_number && (
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                GST%
              </th>
            )}
            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item) => {
            const returnAmount = item.return_quantity * item.rate;
            // Show GST for all customers (they all paid it), only hide if GST customer chooses to exclude
            const showGst = !customer?.gst_number || includeGst;
            const taxAmount = showGst ? (returnAmount * item.tax_percent) / 100 : 0;
            const totalAmount = returnAmount + taxAmount;
            const isExpiringSoon = item.expiry_date && 
              new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

            return (
              <tr key={item.id} className={item.selected ? 'bg-red-50' : 'hover:bg-gray-50'}>
                <td className="px-3 py-4">
                  <input
                    type="checkbox"
                    checked={item.selected || false}
                    onChange={() => handleToggleItem(item.id)}
                    className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                  />
                </td>
                <td className="px-3 py-4">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                      <div className="text-xs text-gray-500">HSN: {item.hsn_code || '-'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-gray-600">
                  {item.batch_number || '-'}
                </td>
                <td className="px-3 py-4">
                  <div className="flex items-center gap-1">
                    {isExpiringSoon && (
                      <AlertTriangle className="w-3 h-3 text-orange-500" />
                    )}
                    <span className={`text-sm ${isExpiringSoon ? 'text-orange-600 font-medium' : 'text-gray-600'}`}>
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '-'}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-4 text-center text-sm text-gray-900">
                  {item.quantity}
                </td>
                <td className="px-3 py-4 text-center text-sm text-gray-600">
                  {item.returned_quantity || 0}
                </td>
                <td className="px-3 py-4">
                  <input
                    type="number"
                    value={item.return_quantity !== undefined ? item.return_quantity : 0}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      console.log('Input onChange:', { 
                        itemId: item.id, 
                        inputValue, 
                        currentValue: item.return_quantity,
                        selected: item.selected
                      });
                      
                      // Allow empty input while typing
                      if (inputValue === '') {
                        handleQuantityChange(item.id, 0);
                        return;
                      }
                      
                      const value = parseInt(inputValue, 10);
                      if (!isNaN(value) && value >= 0) {
                        handleQuantityChange(item.id, value);
                      }
                    }}
                    min={0}
                    max={item.max_returnable_qty}
                    className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0"
                    key={`qty-${item.id}-${item.return_quantity}`}
                  />
                  {item.return_quantity > 0 && (
                    <div className="text-xs text-gray-500 mt-1">
                      Max: {item.max_returnable_qty}
                    </div>
                  )}
                </td>
                <td className="px-3 py-4 text-right text-sm text-gray-900">
                  ₹{item.rate.toFixed(2)}
                </td>
                {customer?.gst_number && (
                  <td className="px-3 py-4 text-center text-sm text-gray-600">
                    {item.tax_percent}%
                  </td>
                )}
                <td className="px-3 py-4 text-right text-sm font-medium text-gray-900">
                  {item.selected && item.return_quantity > 0 ? (
                    <>
                      ₹{totalAmount.toFixed(2)}
                      {customer?.gst_number && showGst && taxAmount > 0 && (
                        <div className="text-xs text-gray-500">
                          (incl. GST ₹{taxAmount.toFixed(2)})
                        </div>
                      )}
                      {!customer?.gst_number && (
                        <div className="text-xs text-gray-500">
                          (incl. taxes)
                        </div>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50">
          <tr>
            <td colSpan={customer?.gst_number ? 8 : 7} className="px-3 py-3 text-right text-sm font-medium text-gray-700">
              Total Return Items:
            </td>
            <td className="px-3 py-3 text-right text-sm font-bold text-gray-900" colSpan={customer?.gst_number ? 2 : 2}>
              {items.filter(item => item.selected && item.return_quantity > 0).length}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default ReturnItemsTable;