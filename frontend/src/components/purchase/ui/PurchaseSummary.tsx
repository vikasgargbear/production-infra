/**
 * PurchaseSummary - Refactored to Props Pattern
 * 
 * Receives totals and items from parent (via usePurchaseTransaction)
 */

import React from 'react';
import { Calculator, FileText, DollarSign } from 'lucide-react';
import { formatCurrency } from '../../../config/purchase.config';
import type { BasePurchaseItem } from '../types';

interface PurchaseTotals {
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  itemCount: number;
  totalQuantity: number;
  taxBreakdown: { cgst: number; sgst: number; igst: number };
}

interface PurchaseSummaryProps {
  /** Items in the purchase */
  items: BasePurchaseItem[];
  /** Calculated totals */
  totals: PurchaseTotals;
  /** Discount amount */
  discountAmount?: number;
  /** Handler for discount change */
  onDiscountChange?: (value: number) => void;
  /** Final amount */
  finalAmount?: number;
}

const PurchaseSummary: React.FC<PurchaseSummaryProps> = ({
  items,
  totals,
  discountAmount = 0,
  onDiscountChange,
  finalAmount
}) => {

  const handleDiscountChange = (value: string): void => {
    const discount = parseFloat(value) || 0;
    onDiscountChange?.(discount);
  };

  const displayFinalAmount = finalAmount ?? (totals.grandTotal - discountAmount);

  const summaryRows = [
    {
      label: 'Subtotal',
      value: totals.subtotal,
      icon: <FileText className="w-4 h-4" />,
      className: 'text-gray-700'
    },
    {
      label: 'Tax Amount',
      value: totals.totalTax,
      icon: <Calculator className="w-4 h-4" />,
      className: 'text-gray-700'
    },
    {
      label: 'Discount',
      value: discountAmount,
      isEditable: !!onDiscountChange,
      icon: <DollarSign className="w-4 h-4" />,
      className: 'text-red-600'
    },
    {
      label: 'Total Amount',
      value: displayFinalAmount,
      icon: <DollarSign className="w-4 h-4" />,
      className: 'text-lg font-bold text-gray-900',
      isDivider: true
    }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Purchase Summary</h3>

      <div className="space-y-2">
        {summaryRows.map((row) => (
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
                    type="text"
                    inputMode="decimal"
                    value={row.value}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-24 text-right px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
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
            <span className="ml-2 font-medium">{totals.itemCount}</span>
          </div>
          <div>
            <span className="text-gray-600">Total Quantity:</span>
            <span className="ml-2 font-medium">
              {totals.totalQuantity.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Breakdown */}
      {totals.totalTax > 0 && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Tax Breakdown</h4>
          <div className="space-y-1 text-sm">
            {totals.taxBreakdown.cgst > 0 && (
              <div className="flex justify-between text-blue-800">
                <span>CGST</span>
                <span>{formatCurrency(totals.taxBreakdown.cgst)}</span>
              </div>
            )}
            {totals.taxBreakdown.sgst > 0 && (
              <div className="flex justify-between text-blue-800">
                <span>SGST</span>
                <span>{formatCurrency(totals.taxBreakdown.sgst)}</span>
              </div>
            )}
            {totals.taxBreakdown.igst > 0 && (
              <div className="flex justify-between text-blue-800">
                <span>IGST</span>
                <span>{formatCurrency(totals.taxBreakdown.igst)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseSummary;