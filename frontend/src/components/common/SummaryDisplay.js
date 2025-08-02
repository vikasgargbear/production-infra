import React from 'react';

/**
 * SummaryDisplay Component
 * Consistent display of totals, GST bifurcation, and summaries
 */
const SummaryDisplay = ({
  items = [],
  showGSTBreakdown = true,
  className = ''
}) => {
  return (
    <div className={`bg-gray-50 rounded-lg p-6 space-y-3 ${className}`.trim()}>
      {items.map((item, index) => (
        <div
          key={index}
          className={`flex items-center justify-between ${
            item.isTotal ? 'border-t border-gray-200 pt-3 mt-3' : ''
          }`}
        >
          <span
            className={`${
              item.isTotal
                ? 'text-base font-semibold text-gray-900'
                : item.isSubtotal
                ? 'text-sm font-medium text-gray-700'
                : 'text-sm text-gray-600'
            }`}
          >
            {item.label}
          </span>
          <span
            className={`${
              item.isTotal
                ? 'text-lg font-bold text-blue-600'
                : item.isSubtotal
                ? 'text-sm font-semibold text-gray-900'
                : item.isNegative
                ? 'text-sm font-medium text-red-600'
                : 'text-sm font-medium text-gray-900'
            }`}
          >
            {item.isNegative && '-'}₹{Math.abs(item.value).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
};

// GST Breakdown Component
export const GSTBreakdown = ({ 
  cgst, 
  sgst, 
  igst, 
  totalGST,
  className = '' 
}) => {
  const isInterstate = igst > 0;

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`.trim()}>
      <h4 className="text-sm font-medium text-blue-900 mb-3">GST Breakdown</h4>
      <div className="space-y-2">
        {isInterstate ? (
          <div className="flex items-center justify-between text-sm">
            <span className="text-blue-700">IGST</span>
            <span className="font-medium text-blue-900">₹{igst.toFixed(2)}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700">CGST</span>
              <span className="font-medium text-blue-900">₹{cgst.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700">SGST</span>
              <span className="font-medium text-blue-900">₹{sgst.toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="flex items-center justify-between text-sm border-t border-blue-200 pt-2">
          <span className="font-medium text-blue-900">Total GST</span>
          <span className="font-semibold text-blue-900">₹{totalGST.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

// Invoice Summary Component
export const InvoiceSummary = ({
  subtotal,
  discount = 0,
  taxAmount,
  cgst = 0,
  sgst = 0,
  igst = 0,
  additionalCharges = 0,
  roundOff = 0,
  total,
  showGSTBreakdown = true,
  className = ''
}) => {
  const summaryItems = [
    { label: 'Subtotal', value: subtotal },
    discount > 0 && { label: 'Discount', value: discount, isNegative: true },
    additionalCharges > 0 && { label: 'Additional Charges', value: additionalCharges },
    { label: 'Tax Amount', value: taxAmount, isSubtotal: true },
    roundOff !== 0 && { 
      label: 'Round Off', 
      value: Math.abs(roundOff), 
      isNegative: roundOff < 0 
    },
    { label: 'Total Amount', value: total, isTotal: true }
  ].filter(Boolean);

  return (
    <div className={`space-y-4 ${className}`.trim()}>
      <SummaryDisplay items={summaryItems} />
      {showGSTBreakdown && taxAmount > 0 && (
        <GSTBreakdown
          cgst={cgst}
          sgst={sgst}
          igst={igst}
          totalGST={taxAmount}
        />
      )}
    </div>
  );
};

export default SummaryDisplay;