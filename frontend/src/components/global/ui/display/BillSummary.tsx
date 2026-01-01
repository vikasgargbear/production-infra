import React from 'react';
import { Calculator, Percent, Plus, Minus, IndianRupee } from 'lucide-react';

interface BillSummaryProps {
  data: {
    total_amount: number;
    discount_amount?: number;
    tax_amount: number;
    other_charges?: number;
    round_off?: number;
    net_amount: number;
    items: Array<{
      tax_rate?: number;
      tax_amount?: number;
    }>;
  };
  onFieldChange?: (field: string, value: number) => void;
  editable?: boolean;
}

const BillSummary: React.FC<BillSummaryProps> = ({ 
  data, 
  onFieldChange,
  editable = true 
}) => {
  const handleFieldChange = (field: string, value: string) => {
    if (onFieldChange) {
      const numValue = parseFloat(value) || 0;
      onFieldChange(field, numValue);
    }
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
            {formatCurrency(data.total_amount)}
          </span>
        </div>

        {/* Discount */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Percent className="w-3 h-3 mr-1" />
            Discount
          </span>
          {editable && onFieldChange ? (
            <input
              type="number"
              value={data.discount_amount || ''}
              onChange={(e) => handleFieldChange('discount_amount', e.target.value)}
              placeholder="0.00"
              className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span className="text-sm font-medium text-gray-900">
              {formatCurrency(data.discount_amount || 0)}
            </span>
          )}
        </div>

        {/* Tax Amount */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Tax Amount</span>
          <span className="text-sm font-medium text-gray-900">
            {formatCurrency(data.tax_amount)}
          </span>
        </div>

        {/* Other Charges */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Plus className="w-3 h-3 mr-1" />
            Other Charges
          </span>
          {editable && onFieldChange ? (
            <input
              type="number"
              value={data.other_charges || ''}
              onChange={(e) => handleFieldChange('other_charges', e.target.value)}
              placeholder="0.00"
              className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span className="text-sm font-medium text-gray-900">
              {formatCurrency(data.other_charges || 0)}
            </span>
          )}
        </div>

        {/* Round Off */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600 flex items-center">
            <Minus className="w-3 h-3 mr-1" />
            Round Off
          </span>
          {editable && onFieldChange ? (
            <input
              type="number"
              value={data.round_off || ''}
              onChange={(e) => handleFieldChange('round_off', e.target.value)}
              placeholder="0.00"
              className="w-24 px-2 py-1 text-sm text-right border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span className="text-sm font-medium text-gray-900">
              {formatCurrency(data.round_off || 0)}
            </span>
          )}
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
              {formatCurrency(data.net_amount)}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Breakdown (if any) */}
      {data.items && data.items.length > 0 && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Tax Breakdown</h4>
          <div className="space-y-1">
            {Array.from(new Set(data.items.map(item => item.tax_rate || 0)))
              .filter((rate): rate is number => typeof rate === 'number' && rate > 0)
              .map((rate: number) => {
                const taxAmount = data.items
                  .filter(item => (item.tax_rate || 0) === rate)
                  .reduce((sum: number, item) => sum + (item.tax_amount || 0), 0);
                
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