import React from 'react';
import { FileText, Calendar, Building2, Phone, Mail, Truck } from 'lucide-react';

const DebitNotePreview = ({ returnData, supplier, purchase }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `₹${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  // Get only selected items with return quantity
  const returnItems = returnData.items.filter(item => 
    item.selected && item.return_quantity > 0
  );

  // Calculate GST breakup
  const calculateGSTBreakup = () => {
    const gstBreakup = {};
    
    returnItems.forEach(item => {
      const returnAmount = item.return_quantity * item.purchase_price;
      const taxAmount = (returnAmount * item.tax_percent) / 100;
      
      if (!gstBreakup[item.tax_percent]) {
        gstBreakup[item.tax_percent] = {
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          totalTax: 0
        };
      }
      
      gstBreakup[item.tax_percent].taxableAmount += returnAmount;
      gstBreakup[item.tax_percent].cgst += taxAmount / 2;
      gstBreakup[item.tax_percent].sgst += taxAmount / 2;
      gstBreakup[item.tax_percent].totalTax += taxAmount;
    });
    
    return gstBreakup;
  };

  const gstBreakup = calculateGSTBreakup();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-section, .print-section * {
            visibility: visible;
          }
          .print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5in;
            size: A4;
          }
        }
      `}</style>

      <div className="bg-white rounded-lg shadow-lg print:shadow-none print-section">
        {/* Header */}
        <div className="p-8 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              {/* Company Logo and Details */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
                </h2>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>{localStorage.getItem('company_address') || '123 Business Street, City'}</p>
                  <p>GSTIN: {localStorage.getItem('company_gstin') || '24XXXXX1234Z5'}</p>
                  <p>DL No: {localStorage.getItem('company_drug_license') || '20B/21B-XXX'}</p>
                  <p>Phone: {localStorage.getItem('company_phone') || '+91 99999 99999'}</p>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <h1 className="text-3xl font-bold text-orange-600 mb-2">
                {supplier.gst_number ? 'GST DEBIT NOTE' : 'RETURN NOTE'}
              </h1>
              {supplier.gst_number && (
                <div className="mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    GST Registered Supplier
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-lg font-semibold text-gray-700">
                  {supplier.gst_number ? 'DN' : 'RN'} No: {returnData.debit_note_no || returnData.return_no}
                </p>
                <p className="text-gray-600">Date: {formatDate(returnData.return_date)}</p>
                <p className="text-gray-600">Original Invoice: {purchase.invoice_number}</p>
                <p className="text-gray-600">Invoice Date: {formatDate(purchase.invoice_date)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Details */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                <Building2 className="w-4 h-4 mr-1" />
                Supplier Details
              </h3>
              <div>
                <p className="font-semibold text-gray-900">{supplier.supplier_name}</p>
                <p className="text-sm text-gray-600">{supplier.address}</p>
                {supplier.gst_number && (
                  <p className="text-sm text-gray-600 mt-1">GSTIN: {supplier.gst_number}</p>
                )}
                {supplier.drug_license_number && (
                  <p className="text-sm text-gray-600">DL No: {supplier.drug_license_number}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Contact Details</h3>
              <div className="text-sm text-gray-600 space-y-1">
                {supplier.phone && (
                  <p><Phone className="w-3 h-3 inline mr-1" /> {supplier.phone}</p>
                )}
                {supplier.email && (
                  <p><Mail className="w-3 h-3 inline mr-1" /> {supplier.email}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Return Reason */}
        <div className="px-8 py-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900">Return Reason</h4>
              <p className="text-sm text-amber-700 mt-1">
                {PURCHASE_RETURN_REASONS.find(r => r.value === returnData.return_reason)?.label || returnData.return_reason}
              </p>
              {returnData.return_reason_notes && (
                <p className="text-sm text-amber-600 mt-2">{returnData.return_reason_notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* Transport Details if provided */}
        {(returnData.transport_details.transport_mode || returnData.transport_details.vehicle_no) && (
          <div className="px-8 py-4 bg-blue-50 border-b border-blue-200">
            <div className="flex items-start gap-3">
              <Truck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-blue-900">Transport Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm text-blue-700 mt-2">
                  {returnData.transport_details.transport_mode && (
                    <div>
                      <span className="font-medium">Mode:</span> {returnData.transport_details.transport_mode}
                    </div>
                  )}
                  {returnData.transport_details.vehicle_no && (
                    <div>
                      <span className="font-medium">Vehicle:</span> {returnData.transport_details.vehicle_no}
                    </div>
                  )}
                  {returnData.transport_details.transporter_name && (
                    <div>
                      <span className="font-medium">Transporter:</span> {returnData.transport_details.transporter_name}
                    </div>
                  )}
                  {returnData.transport_details.lr_no && (
                    <div>
                      <span className="font-medium">LR No:</span> {returnData.transport_details.lr_no}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Returned Items</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">#</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Product</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">HSN</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Batch</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Expiry</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Qty</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Cost</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">GST%</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, index) => {
                  const returnAmount = item.return_quantity * item.purchase_price;
                  const taxAmount = (returnAmount * item.tax_percent) / 100;
                  const totalAmount = returnAmount + taxAmount;

                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 px-2 text-sm">{index + 1}</td>
                      <td className="py-3 px-2 text-sm font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-sm">{item.hsn_code || '-'}</td>
                      <td className="py-3 px-2 text-sm">{item.batch_number || '-'}</td>
                      <td className="py-3 px-2 text-sm">
                        {item.expiry_date ? formatDate(item.expiry_date) : '-'}
                      </td>
                      <td className="py-3 px-2 text-sm text-center">{item.return_quantity}</td>
                      <td className="py-3 px-2 text-sm text-right">{formatCurrency(item.purchase_price)}</td>
                      <td className="py-3 px-2 text-sm text-center">{item.tax_percent}%</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">{formatCurrency(totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* GST Breakup and Summary */}
          <div className="mt-6 grid grid-cols-2 gap-8">
            {/* GST Details */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">GST Breakup</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2">GST%</th>
                    <th className="text-right py-2">Taxable</th>
                    <th className="text-right py-2">CGST</th>
                    <th className="text-right py-2">SGST</th>
                    <th className="text-right py-2">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(gstBreakup).map(([rate, values]) => (
                    <tr key={rate} className="border-b border-gray-100">
                      <td className="py-2">{rate}%</td>
                      <td className="text-right py-2">{formatCurrency(values.taxableAmount)}</td>
                      <td className="text-right py-2">{formatCurrency(values.cgst)}</td>
                      <td className="text-right py-2">{formatCurrency(values.sgst)}</td>
                      <td className="text-right py-2 font-medium">{formatCurrency(values.totalTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(returnData.subtotal_amount)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Tax Amount</span>
                  <span className="font-medium">{formatCurrency(returnData.tax_amount)}</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-300">
                  <span className="font-semibold text-lg">Total Debit Amount</span>
                  <span className="font-bold text-lg text-orange-600">{formatCurrency(returnData.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-gray-200 bg-gray-50 print:bg-white">
          <div className="text-sm text-gray-600 text-center">
            <p className="font-semibold mb-1">Computer Generated Debit Note</p>
            <p>Generated on {new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </>
  );
};

// Return reasons should be imported from parent
const PURCHASE_RETURN_REASONS = [
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'DAMAGED', label: 'Damaged/Defective Product' },
  { value: 'WRONG_PRODUCT', label: 'Wrong Product Received' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'EXCESS_ORDER', label: 'Excess Order' },
  { value: 'NEAR_EXPIRY', label: 'Near Expiry' },
  { value: 'RATE_DISPUTE', label: 'Rate Dispute' },
  { value: 'SCHEME_ISSUE', label: 'Scheme/Discount Issue' },
  { value: 'OTHER', label: 'Other' }
];

export default DebitNotePreview;