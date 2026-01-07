import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Card } from '../../global';

interface CreditNoteReviewPageProps {
  selectedCustomer: any;
  noteData: any;
  noteItems: any[];
  reasonOptions: any[];
  settlementOptions: any[];
  totals: any;
  handleFieldChange: (field: string, value: any) => void;
}

const CreditNoteReviewPage: React.FC<CreditNoteReviewPageProps> = ({
  selectedCustomer,
  noteData,
  noteItems,
  reasonOptions,
  settlementOptions,
  totals,
  handleFieldChange
}) => {
  return (
    <div className="space-y-6">
      {/* Final Review Summary */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-6">
          <CheckCircle className="w-5 h-5 inline mr-2 text-green-600" />
          Review Credit Note
        </h3>
        
        {/* Customer & Note Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Customer Details</h4>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <div><span className="font-medium">Name:</span> {selectedCustomer?.customer_name}</div>
                <div><span className="font-medium">Phone:</span> {selectedCustomer?.phone}</div>
                {selectedCustomer?.gst_number && (
                  <div><span className="font-medium">GST:</span> {selectedCustomer.gst_number}</div>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Note Details</h4>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="space-y-2">
                <div><span className="font-medium">Note Number:</span> {noteData.note_number}</div>
                <div><span className="font-medium">Date:</span> {new Date(noteData.note_date).toLocaleDateString()}</div>
                <div><span className="font-medium">Reason:</span> {reasonOptions.find(r => r.value === noteData.reason)?.label}</div>
                <div><span className="font-medium">Settlement:</span> {settlementOptions.find(s => s.value === noteData.settlement_type)?.label}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Invoice Summary */}
        {noteData.selected_invoice && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">Selected Invoice</h4>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="font-medium text-blue-900">{noteData.selected_invoice.invoice_number}</h5>
                  <p className="text-sm text-blue-700">Date: {new Date(noteData.selected_invoice.invoice_date).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-blue-900">₹{noteData.selected_invoice.total_amount.toLocaleString()}</p>
                  <p className="text-sm text-blue-700">Outstanding: ₹{noteData.selected_invoice.outstanding_amount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Items Summary */}
        <div className="mb-6">
          <h4 className="font-medium text-gray-900 mb-3">Items ({noteItems.length})</h4>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">Product/Service</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-900">Qty</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Rate</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {noteItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-center">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{item.unit_price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">₹{item.total_amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">
              Total Credit Amount
            </span>
            <span className="text-xl font-bold text-green-600">
              ₹{totals.grandTotal.toFixed(2)}
            </span>
          </div>
        </div>
      </Card>

      {/* Additional Information - Moved below review */}
      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Internal Notes</label>
            <textarea
              value={noteData.internal_notes}
              onChange={(e) => handleFieldChange('internal_notes', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
              placeholder="Internal notes (not visible to customer)..."
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Customer Remarks</label>
            <textarea
              value={noteData.customer_remarks}
              onChange={(e) => handleFieldChange('customer_remarks', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
              placeholder="Remarks to be shown on the note..."
              rows={2}
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CreditNoteReviewPage;