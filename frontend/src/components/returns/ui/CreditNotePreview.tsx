import React from 'react';
import { FileText, Calendar, User, Building2, Phone, Mail, MapPin, CreditCard } from 'lucide-react';
import useCompanyDetails from '../../../hooks/useCompanyDetails';
import { formatCurrency } from '../../../utils/formatters';

// Return reasons for display
const RETURN_REASONS = [
  { value: 'DAMAGED', label: 'Damaged Product' },
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'WRONG_ITEM', label: 'Wrong Item Delivered' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'NOT_REQUIRED', label: 'Not Required' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged in Transit' },
  { value: 'SHORT_EXPIRY', label: 'Short Expiry' },
  { value: 'BATCH_RECALL', label: 'Batch Recall' },
  { value: 'OTHER', label: 'Other' }
];

const CreditNotePreview = ({ returnData, customer, invoice, includeGst = true, customerDues = 0, returnMethod = 'credit_note' }) => {
  const { companyDetails } = useCompanyDetails();
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
  interface GSTBreakup {
    taxableAmount: number;
    cgst: number;
    sgst: number;
    totalTax: number;
  }

  const calculateGSTBreakup = () => {
    const gstBreakup: Record<string, GSTBreakup> = {};

    // Calculate GST for all customers (they all paid it)
    // Only skip if GST customer explicitly excludes it
    if (customer.gst_number && !includeGst) return gstBreakup;

    returnItems.forEach(item => {
      // Only calculate for paid quantities
      const totalQty = parseFloat(item.quantity || 0);
      const freeQty = parseFloat(item.free_quantity || 0);
      const paidQty = parseFloat(item.paid_quantity || totalQty - freeQty);
      const returnQty = parseFloat(item.return_quantity || 0);
      const paidReturnQty = Math.min(returnQty, paidQty);

      // Apply discount to base amount - handle both percent and amount
      const baseAmount = paidReturnQty * item.unit_price;
      const discountPercent = parseFloat(item.discount_percent || item.discount || 0);
      const discountAmt = parseFloat(item.discount_amount || 0);
      // Use discount amount if available, otherwise calculate from percent
      const discountAmount = discountAmt > 0 ? (discountAmt * paidReturnQty) : (baseAmount * discountPercent) / 100;
      const returnAmount = baseAmount - discountAmount;

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
                  {companyDetails.company_name}
                </h2>
                <div className="text-sm text-gray-600 space-y-1">
                  {companyDetails.company_address && <p>{companyDetails.company_address}</p>}
                  {companyDetails.company_gst_number && <p>GSTIN: {companyDetails.company_gst_number}</p>}
                  {companyDetails.company_drug_license && <p>DL No: {companyDetails.company_drug_license}</p>}
                  {companyDetails.company_phone && <p>Phone: {companyDetails.company_phone}</p>}
                  {companyDetails.company_email && <p>Email: {companyDetails.company_email}</p>}
                </div>
              </div>
            </div>

            <div className="text-right">
              <h1 className="text-3xl font-bold text-red-600 mb-2">
                {customer.gst_number ? 'GST CREDIT NOTE' : 'RETURN NOTE'}
              </h1>
              {customer.gst_number && (
                <div className="mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    GST Registered Customer
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-lg font-semibold text-gray-700">
                  {returnMethod === 'credit_note' ? 'Credit Note' : returnMethod === 'replacement' ? 'Replacement Note' : 'Refund Note'} No: {returnData.credit_note_no || returnData.return_no}
                </p>
                <p className="text-gray-600">Date: {formatDate(returnData.return_date)}</p>
                {invoice && <p className="text-gray-600">Original Invoice: {invoice.invoice_no || invoice.invoice_number}</p>}
                {!invoice && <p className="text-gray-600">Manual Return - No Invoice Reference</p>}
                {invoice && <p className="text-gray-600">Invoice Date: {formatDate(invoice.invoice_date)}</p>}
                <p className="text-gray-600">
                  Return Method: <span className="font-semibold">
                    {returnMethod === 'credit_note' ? 'Store Credit' :
                      returnMethod === 'replacement' ? 'Product Replacement' :
                        'Refund to Original Payment'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Details */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                <User className="w-4 h-4 mr-1" />
                Customer Details
              </h3>
              <div>
                <p className="font-semibold text-gray-900">{customer.customer_name || customer.name}</p>
                {customer.address && (
                  <div className="text-sm text-gray-600 mt-1">
                    <p>{customer.address}</p>
                    {(customer.city || customer.state || customer.pincode) && (
                      <p>
                        {customer.city && `${customer.city}, `}
                        {customer.state && `${customer.state} `}
                        {customer.pincode}
                      </p>
                    )}
                  </div>
                )}
                {customer.gst_number && (
                  <p className="text-sm text-gray-600 mt-1">
                    <CreditCard className="w-3 h-3 inline mr-1" />
                    GSTIN: {customer.gst_number}
                  </p>
                )}
                {customer.drug_license_number && (
                  <p className="text-sm text-gray-600">
                    <FileText className="w-3 h-3 inline mr-1" />
                    DL No: {customer.drug_license_number}
                  </p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Contact Details</h3>
              <div className="text-sm text-gray-600 space-y-1">
                {customer.phone && (
                  <p><Phone className="w-3 h-3 inline mr-1" /> {customer.phone}</p>
                )}
                {customer.mobile && customer.mobile !== customer.phone && (
                  <p><Phone className="w-3 h-3 inline mr-1" /> {customer.mobile} (Mobile)</p>
                )}
                {customer.email && (
                  <p><Mail className="w-3 h-3 inline mr-1" /> {customer.email}</p>
                )}
                {customer.contact_person && (
                  <p><User className="w-3 h-3 inline mr-1" /> {customer.contact_person}</p>
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
                {RETURN_REASONS.find(r => r.value === returnData.return_reason)?.label || returnData.return_reason}
              </p>
              {returnData.return_reason_notes && (
                <p className="text-sm text-amber-600 mt-2">{returnData.return_reason_notes}</p>
              )}
            </div>
          </div>
        </div>

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
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Rate</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Disc</th>
                  {customer.gst_number && (
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">GST%</th>
                  )}
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, index) => {
                  // Calculate amounts only for paid quantities
                  const totalQty = parseFloat(item.quantity || 0);
                  const freeQty = parseFloat(item.free_quantity || 0);
                  const paidQty = parseFloat(item.paid_quantity || totalQty - freeQty);
                  const returnQty = parseFloat(item.return_quantity || 0);
                  const paidReturnQty = Math.min(returnQty, paidQty);
                  const freeReturnQty = returnQty > paidQty ? returnQty - paidQty : 0;

                  // Apply discount to base amount - handle both percent and amount
                  const baseAmount = paidReturnQty * item.unit_price;
                  const discountPercent = parseFloat(item.discount_percent || item.discount || 0);
                  const discountAmt = parseFloat(item.discount_amount || 0);
                  // Use discount amount if available, otherwise calculate from percent
                  const discountAmount = discountAmt > 0 ? (discountAmt * paidReturnQty) : (baseAmount * discountPercent) / 100;
                  const returnAmount = baseAmount - discountAmount;

                  // Calculate tax for all customers (they all paid it)
                  const taxAmount = (!customer.gst_number || includeGst) ? (returnAmount * item.tax_percent) / 100 : 0;
                  const totalAmount = returnAmount + taxAmount;

                  return (
                    <tr key={item.id || item.product_id || index} className="border-b border-gray-200">
                      <td className="py-3 px-2 text-sm">{index + 1}</td>
                      <td className="py-3 px-2 text-sm font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-sm">{item.hsn_code || '-'}</td>
                      <td className="py-3 px-2 text-sm">{item.batch_number || '-'}</td>
                      <td className="py-3 px-2 text-sm">
                        {item.expiry_date ? formatDate(item.expiry_date) : '-'}
                      </td>
                      <td className="py-3 px-2 text-sm text-center">
                        <div>
                          {item.return_quantity}
                          {freeReturnQty > 0 && (
                            <div className="text-xs text-amber-600">({paidReturnQty} paid + {freeReturnQty} free)</div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-right">{formatCurrency(item.unit_price)}</td>
                      <td className="py-3 px-2 text-sm text-right">
                        {discountAmount > 0 && (
                          <span className="text-green-600">
                            -{formatCurrency(discountAmount)}
                            {discountPercent > 0 && ` (${discountPercent}%)`}
                          </span>
                        )}
                        {discountAmount === 0 && '-'}
                      </td>
                      {customer.gst_number && (
                        <td className="py-3 px-2 text-sm text-center">{item.tax_percent}%</td>
                      )}
                      <td className="py-3 px-2 text-sm text-right font-medium">{formatCurrency(totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* GST Breakup and Summary */}
          <div className="mt-6 grid grid-cols-2 gap-8">
            {/* GST Details - Only for GST customers */}
            {customer.gst_number ? (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">GST Details</h4>
                {includeGst ? (
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
                      {Object.entries(gstBreakup).map(([taxRate, values]) => (
                        <tr key={taxRate} className="border-b border-gray-100">
                          <td className="py-2">{taxRate}%</td>
                          <td className="text-right py-2">{formatCurrency(values.taxableAmount)}</td>
                          <td className="text-right py-2">{formatCurrency(values.cgst)}</td>
                          <td className="text-right py-2">{formatCurrency(values.sgst)}</td>
                          <td className="text-right py-2 font-medium">{formatCurrency(values.totalTax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600">
                      GST excluded at customer's request
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Return Information</h4>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    This return note is for the total amount paid including all taxes.
                  </p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Summary</h4>
              <div className="space-y-2">
                {customer.gst_number && (
                  <>
                    <div className="flex justify-between py-2 border-b border-gray-200">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium">{formatCurrency(returnData.subtotal_amount)}</span>
                    </div>
                    {includeGst && (
                      <div className="flex justify-between py-2">
                        <span className="text-gray-600">Tax Amount (GST)</span>
                        <span className="font-medium">{formatCurrency(returnData.tax_amount)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between py-3 border-t-2 border-gray-300">
                  <span className="font-semibold text-lg">
                    Total Return Amount
                    {!customer.gst_number && <span className="text-xs font-normal text-gray-500 ml-1">(incl. all taxes)</span>}
                  </span>
                  <span className="font-bold text-lg text-red-600">
                    {formatCurrency(returnData.total_amount)}
                  </span>
                </div>
              </div>

              {/* Credit Adjustment Information */}
              {customerDues > 0 && returnData.credit_adjustment_type && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Credit Adjustment:</strong>
                    {returnData.credit_adjustment_type === 'existing_dues' ? (
                      <> This amount will be adjusted against existing dues of ₹{customerDues.toFixed(2)}</>
                    ) : (
                      <> This amount will be kept as credit for future invoices</>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-gray-200 bg-gray-50 print:bg-white">
          <div className="text-sm text-gray-600 text-center">
            <p className="font-semibold mb-1">
              Computer Generated {customer.gst_number ? 'Credit Note' : 'Return Note'}
            </p>
            <p>Generated on {new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreditNotePreview;