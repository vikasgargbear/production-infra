import React from 'react';
import { Trash2 } from 'lucide-react';

const ChallanItemsTable = ({ items, onUpdateItem, onRemoveItem }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleQuantityChange = (itemId, value) => {
    const quantity = parseInt(value) || 0;
    onUpdateItem(itemId, { quantity });
  };

  const handleRateChange = (itemId, value) => {
    const rate = parseFloat(value) || 0;
    onUpdateItem(itemId, { rate });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase">#</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase">Product</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase">Batch</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase">Qty</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">MRP</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">Price</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">Amount</th>
            <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="py-3 px-3 text-sm">{index + 1}</td>
              <td className="py-3 px-3 text-sm">{item.product_name}</td>
              <td className="py-3 px-3 text-sm text-center">{item.batch_number}</td>
              <td className="py-3 px-3 text-center">
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                  className="w-16 text-center text-sm border-b border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent"
                  min="1"
                />
              </td>
              <td className="py-3 px-3 text-sm text-right">{formatCurrency(item.mrp)}</td>
              <td className="py-3 px-3 text-right">
                <input
                  type="number"
                  value={item.rate}
                  onChange={(e) => handleRateChange(item.id, e.target.value)}
                  className="w-20 text-right text-sm border-b border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent"
                  min="0"
                  step="0.01"
                />
              </td>
              <td className="py-3 px-3 text-sm text-right font-medium">{formatCurrency(item.amount)}</td>
              <td className="py-3 px-3 text-center">
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ChallanItemsTable;