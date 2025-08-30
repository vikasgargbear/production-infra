import React from 'react';
import { Trash2 } from 'lucide-react';

const ReturnItemsTable = ({ 
  items = [], 
  onUpdateItem,
  onRemoveItem,
  includeGst = true,
  showManualEntry = false,
  availableBatches = {},
  returnReason = ''
}) => {
  // Calculate item amounts - ONLY for paid quantities, not free
  const calculateItemAmount = (item) => {
    // Get quantities ensuring no negative values
    const totalQty = parseFloat(item.quantity || 0);
    const freeQty = parseFloat(item.free_quantity || 0);
    
    // Use paid_quantity from backend if available, otherwise calculate
    let paidQty;
    if (item.paid_quantity !== undefined && item.paid_quantity !== null) {
      paidQty = Math.max(0, parseFloat(item.paid_quantity));
    } else {
      // Ensure paid qty is never negative
      paidQty = Math.max(0, totalQty - freeQty);
    }
    
    const returnQty = parseFloat(item.return_quantity) || 0;
    
    // User can return all items (paid + free), but only paid items have value
    // Calculate how many paid items are being returned
    const paidReturnQty = Math.min(returnQty, paidQty);
    const freeReturnQty = Math.max(0, returnQty - paidQty);
    
    const rate = parseFloat(item.rate) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    
    // Calculate amount only for paid quantities being returned
    const baseAmount = paidReturnQty * rate;
    const discountAmount = (baseAmount * discountPercent) / 100;
    const afterDiscount = baseAmount - discountAmount;
    
    const taxPercent = includeGst ? (parseFloat(item.tax_percent) || 0) : 0;
    const taxAmount = (afterDiscount * taxPercent) / 100;
    
    return {
      baseAmount,
      discountAmount,
      taxAmount,
      totalAmount: afterDiscount + taxAmount,
      paidQty,
      totalQty,
      freeQty,
      returnQty,
      paidReturnQty,
      freeReturnQty
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
              Invoice Qty<br/>
              <span className="text-xs font-normal">(Paid + Free)</span>
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
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Restock
            </th>
            {showManualEntry && (
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Batch
              </th>
            )}
            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Disposition
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
            
            // Use the same logic as calculateItemAmount for consistency
            const totalQty = parseFloat(item.quantity || 0);
            const freeQty = parseFloat(item.free_quantity || 0);
            
            // Use paid_quantity from backend if available, otherwise calculate
            let paidQty;
            if (item.paid_quantity !== undefined && item.paid_quantity !== null) {
              paidQty = Math.max(0, parseFloat(item.paid_quantity));
            } else {
              paidQty = Math.max(0, totalQty - freeQty);
            }
            
            // Auto-set disposition based on return reason
            const shouldRestock = returnReason !== 'EXPIRED' && returnReason !== 'DAMAGED';
            if (item.restock === undefined && item.selected) {
              // Set default restock value based on reason
              setTimeout(() => {
                onUpdateItem(item.id || index, 'restock', shouldRestock);
                onUpdateItem(item.id || index, 'disposition', shouldRestock ? 'RESTOCK' : 'DESTROY');
              }, 0);
            }
            
            return (
              <tr key={item.id || index} className={!item.selected ? 'opacity-50' : ''}>
                <td className="px-3 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={item.selected || false}
                    onChange={(e) => onUpdateItem(item.id || index, 'selected', e.target.checked)}
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
                  <div className="flex flex-col items-center">
                    <div className="text-sm font-medium text-gray-900">
                      {totalQty || 0}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {paidQty > 0 && (
                        <span className="text-blue-600">Paid: {paidQty}</span>
                      )}
                      {paidQty > 0 && freeQty > 0 && <span className="mx-1">|</span>}
                      {freeQty > 0 && (
                        <span className="text-green-600">Free: {freeQty}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <div className="flex flex-col items-center">
                    <input
                      type="number"
                      value={item.return_quantity || ''}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        const maxQty = paidQty + freeQty;
                        if (value <= maxQty || isManual) {
                          onUpdateItem(item.id || index, 'return_quantity', e.target.value);
                        }
                      }}
                      className="w-20 px-2 py-1 text-center border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-medium"
                      min="0"
                      max={isManual ? undefined : (paidQty + freeQty)}
                      disabled={!item.selected}
                    />
                    {!isManual && item.return_quantity > 0 && (
                      <div className="text-xs mt-1 text-center">
                        {item.return_quantity <= paidQty ? (
                          <span className="text-blue-600">
                            Paid: {item.return_quantity}
                          </span>
                        ) : (
                          <span className="text-amber-600">
                            P: {paidQty} + F: {Math.min(item.return_quantity - paidQty, freeQty)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-900">
                      ₹{item.rate || 0}
                    </div>
                    {isManual && (
                      <input
                        type="number"
                        value={item.rate || ''}
                        onChange={(e) => onUpdateItem(item.id || index, 'rate', e.target.value)}
                        className="w-20 px-2 py-1 mt-1 text-center text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        step="0.01"
                        disabled={!item.selected}
                      />
                    )}
                  </div>
                </td>
                <td className="px-3 py-4 whitespace-nowrap">
                  <div className="text-center">
                    <div className="text-sm font-medium text-gray-900">
                      {item.discount_percent || 0}%
                    </div>
                    {isManual && (
                      <input
                        type="number"
                        value={item.discount_percent || ''}
                        onChange={(e) => onUpdateItem(item.id || index, 'discount_percent', e.target.value)}
                        className="w-16 px-2 py-1 mt-1 text-center text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        max="100"
                        disabled={!item.selected}
                      />
                    )}
                  </div>
                </td>
                {includeGst && (
                  <td className="px-3 py-4 whitespace-nowrap">
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-900">
                        {item.tax_percent || 0}%
                      </div>
                      {isManual && (
                        <input
                          type="number"
                          value={item.tax_percent || ''}
                          onChange={(e) => onUpdateItem(item.id || index, 'tax_percent', e.target.value)}
                          className="w-16 px-2 py-1 mt-1 text-center text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="0"
                          max="28"
                          disabled={!item.selected}
                        />
                      )}
                    </div>
                  </td>
                )}
                <td className="px-3 py-4 whitespace-nowrap text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    ₹{amounts.totalAmount.toFixed(2)}
                  </div>
                  {amounts.totalAmount > 0 && item.selected && (
                    <div className="text-xs text-gray-500 space-y-0.5 mt-1">
                      <div>Base: ₹{amounts.baseAmount.toFixed(2)}</div>
                      {amounts.discountAmount > 0 && (
                        <div className="text-red-600">-Disc: ₹{amounts.discountAmount.toFixed(2)}</div>
                      )}
                      {amounts.taxAmount > 0 && (
                        <div className="text-blue-600">+Tax: ₹{amounts.taxAmount.toFixed(2)}</div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-4 whitespace-nowrap text-center">
                  <input
                    type="checkbox"
                    checked={item.restock !== false}
                    onChange={(e) => {
                      onUpdateItem(item.id || index, 'restock', e.target.checked);
                      // Update disposition based on restock
                      onUpdateItem(item.id || index, 'disposition', e.target.checked ? 'RESTOCK' : 'QUARANTINE');
                    }}
                    disabled={!item.selected || returnReason === 'EXPIRED' || returnReason === 'DAMAGED'}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    title={returnReason === 'EXPIRED' || returnReason === 'DAMAGED' ? 'Cannot restock expired/damaged items' : 'Check to restock this item'}
                  />
                  {(returnReason === 'EXPIRED' || returnReason === 'DAMAGED') && (
                    <div className="text-xs text-red-600 mt-1">No Restock</div>
                  )}
                </td>
                {showManualEntry && (
                  <td className="px-3 py-4 whitespace-nowrap text-center">
                    {availableBatches[item.product_id]?.length > 0 ? (
                      <select
                        value={item.batch_id || ''}
                        onChange={(e) => {
                          const batchId = e.target.value;
                          onUpdateItem(item.id || index, 'batch_id', batchId);
                          // Update batch_no when batch is selected
                          const selectedBatch = availableBatches[item.product_id].find(b => b.id === batchId);
                          if (selectedBatch) {
                            onUpdateItem(item.id || index, 'batch_no', selectedBatch.batch_no);
                          }
                        }}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
                        disabled={!item.selected}
                      >
                        <option value="">Select Batch</option>
                        {availableBatches[item.product_id].map(batch => (
                          <option key={batch.id} value={batch.id}>
                            {batch.batch_no} (Qty: {batch.quantity_available})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={item.batch_no || ''}
                        onChange={(e) => onUpdateItem(item.id || index, 'batch_no', e.target.value)}
                        placeholder="Enter batch"
                        className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
                        disabled={!item.selected}
                      />
                    )}
                    {!item.batch_id && !item.batch_no && item.selected && item.restock !== false && (
                      <div className="text-xs text-amber-600 mt-1">Will go to quarantine</div>
                    )}
                  </td>
                )}
                <td className="px-3 py-4 whitespace-nowrap text-center">
                  <select
                    value={item.disposition || 'RESTOCK'}
                    onChange={(e) => onUpdateItem(item.id || index, 'disposition', e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500"
                    disabled={!item.selected}
                  >
                    <option value="RESTOCK">Restock</option>
                    <option value="QUARANTINE">Quarantine</option>
                    <option value="DESTROY">Destroy</option>
                    <option value="RETURN_TO_VENDOR">Return to Vendor</option>
                  </select>
                  {item.disposition === 'QUARANTINE' && (
                    <div className="text-xs text-amber-600 mt-1">Requires Inspection</div>
                  )}
                  {item.disposition === 'DESTROY' && (
                    <div className="text-xs text-red-600 mt-1">Will be Destroyed</div>
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
              <td colSpan={includeGst ? (showManualEntry ? 11 : 10) : (showManualEntry ? 10 : 9)} className="px-3 py-8 text-center text-gray-500">
                No items to display
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ReturnItemsTable;