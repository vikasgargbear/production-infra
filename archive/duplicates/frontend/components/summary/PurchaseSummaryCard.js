import React from 'react';
import { Calculator } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

/**
 * PurchaseSummaryCard - Shows purchase totals and calculations
 */
const PurchaseSummaryCard = ({ 
  subtotal = 0, 
  discount = 0, 
  tax = 0, 
  otherCharges = 0, 
  total = 0 
}) => {

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center space-x-2 mb-4">
        <Calculator className="w-5 h-5 text-indigo-600" />
        <h3 className="text-lg font-medium">Summary</h3>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium">{formatCurrency(subtotal)}</span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Discount</span>
            <span className="font-medium text-red-600">- {formatCurrency(discount)}</span>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Tax/GST</span>
          <span className="font-medium">{formatCurrency(tax)}</span>
        </div>

        {otherCharges > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Other Charges</span>
            <span className="font-medium">{formatCurrency(otherCharges)}</span>
          </div>
        )}

        <div className="pt-2 mt-2 border-t">
          <div className="flex justify-between">
            <span className="text-lg font-semibold">Total</span>
            <span className="text-lg font-semibold text-indigo-600">
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <div className="text-xs text-blue-700">
          <div className="font-medium mb-1">Quick Tips:</div>
          <ul className="space-y-1">
            <li>• Batches will be created automatically</li>
            <li>• Default MRP = 1.5x Cost Price</li>
            <li>• Default Selling = 90% of MRP</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PurchaseSummaryCard;