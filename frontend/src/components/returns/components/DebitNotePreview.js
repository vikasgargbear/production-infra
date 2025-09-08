import React from 'react';
import { FileText, Calendar, Building2, Phone, Mail, Truck } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

const DebitNotePreview = ({ returnData, supplier = {}, purchase = {} }) => {
  // Add safety checks for required data
  if (!supplier || !purchase || !returnData) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Loading return information...</p>
      </div>
    );
  }
  
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };


  // Get only selected items with return quantity
  const returnItems = returnData.items.filter(item => 
    item.selected && item.return_quantity > 0
  );

  // Calculate GST breakup
  const calculateGSTBreakup = () => {
    const gstBreakup = {};
    
    returnItems.forEach(item => {
      const price = parseFloat(item.purchase_price || item.rate || item.unit_price || 0);
      const discountPercent = parseFloat(item.discount_percent || 0);
      const returnAmount = item.return_quantity * price;
      const discountAmount = (returnAmount * discountPercent) / 100;
      const afterDiscount = returnAmount - discountAmount;
      const taxAmount = (afterDiscount * (item.tax_percent || 0)) / 100;
      
      if (!gstBreakup[item.tax_percent]) {
        gstBreakup[item.tax_percent] = {
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          totalTax: 0
        };
      }
      
      gstBreakup[item.tax_percent].taxableAmount += afterDiscount;
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
        {/* Header - Compact */}
        <div className="px-8 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              {/* Company Details - Compact */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
                </h2>
                <div className="text-xs text-gray-600 space-y-0.5">
                  <p>{localStorage.getItem('company_address') || '123 Business Street, City'}</p>
                  <div className="flex gap-4">
                    <span>GSTIN: {localStorage.getItem('company_gstin') || ''}</span>
                    <span>DL: {localStorage.getItem('company_drug_license') || '20B/21B-XXX'}</span>
                    <span>Ph: {localStorage.getItem('company_phone') || '+91 99999 99999'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <h1 className="text-2xl font-bold text-orange-600 mb-1">
                {supplier?.gst_number ? 'DEBIT NOTE' : 'RETURN NOTE'}
              </h1>
              <div className="text-sm space-y-0.5">
                <p className="font-semibold text-gray-700">
                  No: {returnData.debit_note_no || returnData.return_no || 'DRAFT'}
                </p>
                <p className="text-gray-600">Date: {formatDate(returnData.return_date)}</p>
                <p className="text-gray-600">Invoice: {purchase?.invoice_number || 'N/A'}</p>
                {purchase?.invoice_date && (
                  <p className="text-gray-600">Inv Date: {formatDate(purchase.invoice_date)}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Details and Return Reason - Combined Row */}
        <div className="px-8 py-3 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-3 gap-x-6">
            {/* Supplier Details */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-1 flex items-center uppercase">
                <Building2 className="w-3 h-3 mr-1" />
                Supplier
              </h3>
              <div className="text-sm">
                <p className="font-semibold text-gray-900">{supplier?.supplier_name || 'Supplier'}</p>
                {supplier?.gst_number && (
                  <p className="text-gray-600">GSTIN: {supplier.gst_number}</p>
                )}
                {supplier?.drug_license_number && (
                  <p className="text-gray-600">DL: {supplier.drug_license_number}</p>
                )}
              </div>
            </div>
            
            {/* Contact Details */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-1 uppercase">Contact</h3>
              <div className="text-sm text-gray-600">
                {supplier.phone && (
                  <p className="flex items-center"><Phone className="w-3 h-3 mr-1" /> {supplier.phone}</p>
                )}
                {supplier.email && (
                  <p className="flex items-center"><Mail className="w-3 h-3 mr-1" /> {supplier.email}</p>
                )}
                {!supplier.phone && !supplier.email && (
                  <p className="text-gray-400">No contact info</p>
                )}
              </div>
            </div>
            
            {/* Return Reason */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-1 flex items-center uppercase">
                <FileText className="w-3 h-3 mr-1" />
                Return Reason
              </h3>
              <div className="text-sm">
                <p className="font-medium text-amber-700">
                  {PURCHASE_RETURN_REASONS.find(r => r.value === returnData.return_reason)?.label || returnData.return_reason}
                </p>
                {returnData.return_reason_notes && (
                  <p className="text-xs text-gray-600 mt-1 italic">{returnData.return_reason_notes}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Transport Details if provided - Compact */}
        {(returnData.transport_details.transport_mode || returnData.transport_details.vehicle_no) && (
          <div className="px-8 py-2 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center">
                <Truck className="w-4 h-4 text-blue-600 mr-2" />
                <span className="font-semibold text-blue-900">Transport:</span>
              </div>
              {returnData.transport_details.transport_mode && (
                <span className="text-blue-700">
                  <span className="font-medium">Mode:</span> {returnData.transport_details.transport_mode}
                </span>
              )}
              {returnData.transport_details.vehicle_no && (
                <span className="text-blue-700">
                  <span className="font-medium">Vehicle:</span> {returnData.transport_details.vehicle_no}
                </span>
              )}
              {returnData.transport_details.transporter_name && (
                <span className="text-blue-700">
                  <span className="font-medium">Transporter:</span> {returnData.transport_details.transporter_name}
                </span>
              )}
              {returnData.transport_details.lr_no && (
                <span className="text-blue-700">
                  <span className="font-medium">LR:</span> {returnData.transport_details.lr_no}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="px-8 py-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase">Returned Items</h3>
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
                  const price = item.purchase_price || item.rate || item.unit_price || 0;
                  const returnAmount = item.return_quantity * price;
                  const discountAmount = (returnAmount * (item.discount_percent || 0)) / 100;
                  const afterDiscount = returnAmount - discountAmount;
                  const taxAmount = (afterDiscount * (item.tax_percent || 0)) / 100;
                  const totalAmount = afterDiscount + taxAmount;

                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 px-2 text-sm">{index + 1}</td>
                      <td className="py-3 px-2 text-sm font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-sm">{item.hsn_code || '-'}</td>
                      <td className="py-3 px-2 text-sm">{item.batch_number || '-'}</td>
                      <td className="py-3 px-2 text-sm">
                        {item.expiry_date || item.expiry ? formatDate(item.expiry_date || item.expiry) : '-'}
                      </td>
                      <td className="py-3 px-2 text-sm text-center">{item.return_quantity}</td>
                      <td className="py-3 px-2 text-sm text-right">{formatCurrency(price)}</td>
                      <td className="py-3 px-2 text-sm text-center">{item.tax_percent}%</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">{formatCurrency(totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* GST Breakup and Summary - Compact */}
          <div className="mt-4 grid grid-cols-2 gap-6">
            {/* GST Details */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase">GST Breakup</h4>
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
              <h4 className="text-sm font-semibold text-gray-900 mb-2 uppercase">Summary</h4>
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
        <div className="px-8 py-3 border-t border-gray-200 bg-gray-50 print:bg-white">
          <div className="text-xs text-gray-500 text-center">
            <p className="font-semibold">Computer Generated Debit Note</p>
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