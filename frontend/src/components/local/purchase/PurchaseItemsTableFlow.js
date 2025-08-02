import React from 'react';
import { Trash2 } from 'lucide-react';
import { MonthYearPicker } from '../../global';

const PurchaseItemsTableFlow = ({ items, onUpdateItem, onRemoveItem }) => {
  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <p className="text-gray-500">No items added yet. Search and add products above.</p>
      </div>
    );
  }

  const handleKeyDown = (e, index, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Find next input
      const currentRow = e.target.closest('tr');
      const inputs = currentRow.querySelectorAll('input, select');
      const currentIndex = Array.from(inputs).indexOf(e.target);
      
      if (currentIndex < inputs.length - 1) {
        // Move to next field in same row
        inputs[currentIndex + 1].focus();
      } else if (index < items.length - 1) {
        // Move to first field of next row
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const firstInput = nextRow.querySelector('input, select');
          if (firstInput) firstInput.focus();
        }
      }
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Batch *</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry *</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity *</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Free</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">MRP</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Price *</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Selling Price</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Disc %</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">GST %</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.map((item, index) => {
              const quantity = parseFloat(item.quantity) || 0;
              const freeQty = parseFloat(item.free_quantity) || 0;
              const purchasePrice = parseFloat(item.purchase_price) || 0;
              const discount = parseFloat(item.discount_percent) || 0;
              const gstPercent = parseFloat(item.tax_percent) || 12;
              
              const subtotal = quantity * purchasePrice;
              const discountAmount = (subtotal * discount) / 100;
              const taxableAmount = subtotal - discountAmount;
              const taxAmount = (taxableAmount * gstPercent) / 100;
              const totalAmount = taxableAmount + taxAmount;
              
              return (
                <tr key={item.item_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {item.product_name}
                    <div className="text-xs text-gray-500">HSN: {item.hsn_code || 'N/A'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.batch_no || ''}
                      onChange={(e) => onUpdateItem(index, 'batch_no', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'batch_no')}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50"
                      placeholder="Batch"
                      required
                    />
                  </td>
                  <td className="px-4 py-3">
                    <MonthYearPicker
                      value={item.expiry_date}
                      onChange={(date) => onUpdateItem(index, 'expiry_date', date)}
                      className="w-28"
                      required
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.quantity || ''}
                      onChange={(e) => onUpdateItem(index, 'quantity', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'quantity')}
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="1"
                      required
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.free_quantity || ''}
                      onChange={(e) => onUpdateItem(index, 'free_quantity', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'free_quantity')}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.mrp || ''}
                      onChange={(e) => onUpdateItem(index, 'mrp', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'mrp')}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.purchase_price || ''}
                      onChange={(e) => onUpdateItem(index, 'purchase_price', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'purchase_price')}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      step="0.01"
                      min="0"
                      required
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.selling_price || ''}
                      onChange={(e) => onUpdateItem(index, 'selling_price', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'selling_price')}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      step="0.01"
                      min="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.discount_percent || ''}
                      onChange={(e) => onUpdateItem(index, 'discount_percent', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'discount_percent')}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.tax_percent || ''}
                      onChange={(e) => onUpdateItem(index, 'tax_percent', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'tax_percent')}
                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-gray-50 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                    ₹{totalAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="text-red-600 hover:text-red-700"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseItemsTableFlow;