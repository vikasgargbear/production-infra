import React from 'react';
import { Calculator, FileText, DollarSign } from 'lucide-react';
import { usePurchase } from '../../../contexts/PurchaseContext';
import { formatCurrency } from '../../../config/purchase.config';

const PurchaseSummary = () => {
  const { purchase, setPurchaseField } = usePurchase();
  
  const handleDiscountChange = (value) => {
    const discount = parseFloat(value) || 0;
    setPurchaseField('discount_amount', discount);
    // Recalculate final amount
    const final = purchase.subtotal_amount + purchase.tax_amount - discount;
    setPurchaseField('final_amount', final);
  };
  
  const summaryRows = [
    {
      label: 'Subtotal',
      value: purchase.subtotal_amount,
      icon: <FileText className="w-4 h-4" />,
      className: 'text-gray-700'
    },
    {
      label: 'Tax Amount',
      value: purchase.tax_amount,
      icon: <Calculator className="w-4 h-4" />,
      className: 'text-gray-700'
    },
    {
      label: 'Discount',
      value: purchase.discount_amount,
      isEditable: true,
      icon: <DollarSign className="w-4 h-4" />,
      className: 'text-red-600'
    },
    {
      label: 'Total Amount',
      value: purchase.final_amount,
      icon: <DollarSign className="w-4 h-4" />,
      className: 'text-lg font-bold text-gray-900',
      isDivider: true
    }
  ];
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Purchase Summary</h3>
      
      <div className="space-y-2">
        {summaryRows.map((row, index) => (
          <div key={row.label}>
            {row.isDivider && (
              <div className="border-t border-gray-200 my-2"></div>
            )}
            
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center space-x-2">
                {row.icon}
                <span className={row.className || 'text-gray-700'}>{row.label}</span>
              </div>
              
              {row.isEditable ? (
                <div className="flex items-center">
                  <span className="text-gray-500 mr-1">₹</span>
                  <input
                    type="number"
                    value={row.value}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-24 text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                  />
                </div>
              ) : (
                <span className={row.className || 'text-gray-900'}>
                  {formatCurrency(row.value)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Additional Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Total Items:</span>
            <span className="ml-2 font-medium">{purchase.items.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Total Quantity:</span>
            <span className="ml-2 font-medium">
              {purchase.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Tax Breakdown */}
      {purchase.tax_amount > 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Tax Breakdown</h4>
          <div className="space-y-1 text-sm">
            {(() => {
              const taxBreakdown = purchase.items.reduce((acc, item) => {
                const rate = item.tax_percent || 0;
                const quantity = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.purchase_price) || 0;
                const tax = (quantity * price * rate) / 100;
                
                if (!acc[rate]) {
                  acc[rate] = 0;
                }
                acc[rate] += tax;
                
                return acc;
              }, {});
              
              return Object.entries(taxBreakdown).map(([rate, amount]) => (
                <div key={rate} className="flex justify-between text-blue-800">
                  <span>GST @ {rate}%</span>
                  <span>{formatCurrency(amount)}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseSummary;