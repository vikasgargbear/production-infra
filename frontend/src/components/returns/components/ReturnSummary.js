import React from 'react';
import { Calculator } from 'lucide-react';

const ReturnSummary = ({ subtotal = 0, taxAmount = 0, totalAmount = 0, showGst = true, customer }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-gray-600" />
          Return Summary
        </h3>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center py-2 border-b border-gray-100">
          <span className="text-gray-600">Subtotal</span>
          <span className="font-medium text-gray-900">₹{subtotal.toFixed(2)}</span>
        </div>
        
        {showGst && customer?.gst_number && (
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">Tax Amount (GST)</span>
            <span className="font-medium text-gray-900">₹{taxAmount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between items-center pt-3">
          <span className="text-lg font-semibold text-gray-900">
            Total Return Amount
            {!customer?.gst_number && <span className="text-xs font-normal text-gray-500 ml-1">(incl. all taxes)</span>}
          </span>
          <span className="text-xl font-bold text-red-600">₹{totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-700">
          <strong>Note:</strong> This amount will be adjusted in the customer's account as credit balance 
          or refunded as per your return policy.
        </p>
      </div>
    </div>
  );
};

export default ReturnSummary;