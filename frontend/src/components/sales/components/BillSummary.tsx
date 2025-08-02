import React from 'react';
import { Calculator, Percent, Plus, Minus, IndianRupee } from 'lucide-react';
import { useSales } from '../../../contexts/SalesContext';

interface SalesItem {
  tax_rate?: number;
  tax_amount?: number;
}

const BillSummary: React.FC = () => {
  const { 
    salesData, 
    setSalesField,
    calculateTotals 
  } = useSales();

  const handleFieldChange = (field: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSalesField(field, numValue);
    setTimeout(() => calculateTotals(), 100);
  };

  const formatCurrency = (amount: number): string => {
    return `₹${(amount || 0).toFixed(2)}`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Calculator className="w-4 h-4 text-gray-600" />
        <h3 className="text-sm font-medium text-gray-900">Bill Summary</h3>
      </div>

      <div className="space-y-3">
        {/* Subtotal */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Subtotal</span>
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(salesData.total_amount)}
          </span>
        </div>

        {/* Discount */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Percent className="w-3 h-3 mr-1" />
            Discount
          </span>
          <input
            type="number"
            value={salesData.discount_amount || ''}
            onChange={(e) => handleFieldChange('discount_amount', e.target.value)}
            placeholder="0.00"
            className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Tax Amount */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Tax Amount</span>
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(salesData.tax_amount)}
          </span>
        </div>

        {/* Other Charges */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Plus className="w-3 h-3 mr-1" />
            Other Charges
          </span>
          <input
            type="number"
            value={salesData.other_charges || ''}
            onChange={(e) => handleFieldChange('other_charges', e.target.value)}
            placeholder="0.00"
            className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Round Off */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Minus className="w-3 h-3 mr-1" />
            Round Off
          </span>
          <input
            type="number"
            value={salesData.round_off || ''}
            onChange={(e) => handleFieldChange('round_off', e.target.value)}
            placeholder="0.00"
            className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 pt-3">
          {/* Net Amount */}
          <div className="flex justify-between items-center">
            <span className="text-base font-medium text-gray-900 flex items-center">
              <IndianRupee className="w-4 h-4 mr-1" />
              Net Amount
            </span>
            <span className="text-lg font-bold text-blue-600">
              {formatCurrency(salesData.net_amount)}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Breakdown (if any) */}
      {salesData.items.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Tax Breakdown</h4>
          <div className="space-y-1">
            {Array.from(new Set(salesData.items.map((item: SalesItem) => item.tax_rate || 0)))
              .filter(rate => rate > 0)
              .map(rate => {
                const taxAmount = salesData.items
                  .filter((item: SalesItem) => (item.tax_rate || 0) === rate)
                  .reduce((sum: number, item: SalesItem) => sum + (item.tax_amount || 0), 0);
                
                return (
                  <div key={rate} className="flex justify-between text-xs text-gray-600">
                    <span>GST @ {rate}%</span>
                    <span>{formatCurrency(taxAmount)}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BillSummary;