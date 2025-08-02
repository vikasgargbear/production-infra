import React from 'react';
import { Calendar, MapPin, Phone, Mail, Truck, CreditCard, FileText } from 'lucide-react';

const InvoicePreview = ({ 
  invoice, 
  onInvoiceUpdate,
  companyInfo 
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Calculate totals properly to avoid NaN
  const calculateTotals = () => {
    const items = invoice.items || [];
    
    let subtotal = 0;
    let totalTax = 0;
    
    items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || parseFloat(item.sale_price) || 0;
      const discount = parseFloat(item.discount_percent) || 0;
      
      const discountAmount = (quantity * rate * discount) / 100;
      const itemAmount = (quantity * rate) - discountAmount;
      const gstPercent = parseFloat(item.gst_percent) || parseFloat(item.tax_rate) || 12;
      const taxAmount = (itemAmount * gstPercent) / 100;
      
      subtotal += itemAmount;
      totalTax += taxAmount;
    });
    
    const deliveryCharges = parseFloat(invoice.delivery_charges) || 0;
    const discount = parseFloat(invoice.discount_amount) || 0;
    
    const taxableAmount = subtotal - discount;
    const totalAmount = taxableAmount + totalTax + deliveryCharges;
    
    return {
      subtotal: subtotal,
      taxableAmount: taxableAmount,
      totalTax: totalTax,
      cgstAmount: invoice.gst_type !== 'IGST' ? totalTax / 2 : 0,
      sgstAmount: invoice.gst_type !== 'IGST' ? totalTax / 2 : 0,
      igstAmount: invoice.gst_type === 'IGST' ? totalTax : 0,
      totalAmount: totalAmount,
      deliveryCharges: deliveryCharges
    };
  };

  const totals = calculateTotals();

  return (
    <div className="bg-white">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #invoice-preview, #invoice-preview * {
            visibility: visible;
          }
          #invoice-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          /* Ensure colors and backgrounds print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          /* Force border and background printing */
          .print-border {
            border: 1px solid #e5e7eb !important;
          }
          .print-bg-gray {
            background-color: #f9fafb !important;
          }
          .print-bg-blue {
            background-color: #eff6ff !important;
          }
        }
      `}</style>
      <div id="invoice-preview" className="px-6 py-4">
        {/* Header Section - Company Branding Row - 3 tiles to match below */}
        <div className="mb-3">
          <div className="grid grid-cols-3 gap-3 items-stretch">
            {/* Company Info - Bigger for branding */}
            <div>
              <div className="bg-gradient-to-br from-blue-50 to-gray-50 rounded-xl p-4 h-full border border-blue-200 print-border print-bg-blue">
                <div className="flex items-start space-x-3">
                  {companyInfo.logo ? (
                    <img 
                      src={companyInfo.logo} 
                      alt={companyInfo.name} 
                      className="w-20 h-20 object-contain rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl font-bold text-white">A</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900">{companyInfo.name}</h2>
                    <p className="text-sm text-gray-600 mt-1">{companyInfo.address}</p>
                    <p className="text-sm text-gray-600">GSTIN: {companyInfo.gstin}</p>
                    <p className="text-sm text-gray-600">DL No: {companyInfo.drugLicense}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank & Payment Details - Merged into one tile */}
            <div>
              <div className="bg-gray-50 rounded-xl p-3 h-full print-border print-bg-gray">
                <div className="flex justify-between items-start">
                  {/* Bank Details on left */}
                  <div className="flex-1">
                    <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Bank Details</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p className="font-semibold text-gray-900">{companyInfo.bankName || 'SBI'}</p>
                      <p>A/C: {companyInfo.accountNumber || '1234567890'}</p>
                      <p>IFSC: {companyInfo.ifsc || 'SBIN0001234'}</p>
                    </div>
                  </div>
                  {/* QR Code on right */}
                  <div className="text-center ml-3">
                    <h3 className="text-[10px] font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      {invoice.payment_mode === 'UPI' ? 'UPI' : 'Pay QR'}
                    </h3>
                    {invoice.payment_mode === 'UPI' || invoice.payment_mode === 'BANK_TRANSFER' ? (
                      <>
                        <div className="w-16 h-16 bg-white rounded border border-gray-300 flex items-center justify-center">
                          <div className="text-xs text-gray-400">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-600 mt-1">{companyInfo.upiId || 'aasopharma@paytm'}</p>
                      </>
                    ) : (
                      <div className="h-16 flex items-center justify-center">
                        <p className="text-[10px] text-gray-400">N/A</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Info */}
            <div>
              <div className="bg-gray-100 rounded-xl p-3 h-full border border-gray-200 print-border print-bg-gray">
                <h1 className="text-sm font-bold text-gray-900 mb-2">TAX INVOICE</h1>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-700">
                    <span className="text-gray-500">No:</span>
                    <span className="ml-1 font-medium">{invoice.invoice_no}</span>
                  </p>
                  <p className="text-xs text-gray-700">
                    <span className="text-gray-500">Date:</span>
                    <span className="ml-1 font-medium">{formatDate(invoice.invoice_date)}</span>
                  </p>
                  <p className="text-xs text-gray-700">
                    <span className="text-gray-500">Pay:</span>
                    <span className="ml-1 font-medium">{invoice.payment_mode || 'CASH'}</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer & Transport Section - Below header */}
        <div className="mb-4">
          <div className="grid grid-cols-3 gap-3">
            {/* Bill To */}
            <div className="bg-gray-50 rounded-xl p-3 print-border print-bg-gray">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bill To</h3>
              <p className="font-semibold text-gray-900 text-sm">{invoice.customer_name}</p>
              {invoice.customer_details && (
                <>
                  <p className="text-xs text-gray-600 mt-1">{invoice.customer_details.address}</p>
                  <p className="text-xs text-gray-600">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                  <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customer_details.phone}</p>
                  {invoice.customer_details.gst_number && (
                    <p className="text-xs text-gray-600">GST: {invoice.customer_details.gst_number}</p>
                  )}
                </>
              )}
            </div>

            {/* Ship To */}
            <div className="bg-gray-50 rounded-xl p-3 print-border print-bg-gray">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ship To</h3>
              {invoice.is_same_address !== false ? (
                <>
                  <p className="text-xs text-gray-600 mb-1">✓ Same as billing</p>
                  <p className="font-semibold text-gray-900 text-sm">{invoice.customer_name}</p>
                  {invoice.customer_details && (
                    <>
                      <p className="text-xs text-gray-600 mt-1">{invoice.customer_details.address}</p>
                      <p className="text-xs text-gray-600">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                      <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customer_details.phone}</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 text-sm">{invoice.shipping_contact_name || invoice.customer_name}</p>
                  <p className="text-xs text-gray-600 mt-1">{invoice.shipping_address}</p>
                  {invoice.shipping_phone && (
                    <p className="text-xs text-gray-600 mt-1">Ph: {invoice.shipping_phone}</p>
                  )}
                </>
              )}
            </div>

            {/* Transport Details */}
            <div className="bg-gray-50 rounded-xl p-3 print-border print-bg-gray">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Transport</h3>
              {invoice.delivery_type && (
                <p className="text-xs text-gray-600">Type: <span className="font-medium text-gray-900">{invoice.delivery_type}</span></p>
              )}
              {invoice.transport_company && (
                <p className="text-xs text-gray-600 mt-1">Company: <span className="font-medium text-gray-900">{invoice.transport_company}</span></p>
              )}
              {invoice.vehicle_number && (
                <p className="text-xs text-gray-600 mt-1">Vehicle: <span className="font-medium text-gray-900">{invoice.vehicle_number}</span></p>
              )}
              {invoice.lr_number && (
                <p className="text-xs text-gray-600 mt-1">LR No: <span className="font-medium text-gray-900">{invoice.lr_number}</span></p>
              )}
              {!invoice.delivery_type && !invoice.transport_company && !invoice.vehicle_number && !invoice.lr_number && (
                <p className="text-xs text-gray-400 text-center py-4">No transport details</p>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8 rounded-lg overflow-hidden border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">#</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">HSN</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Batch</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Exp</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Disc%</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Free</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">GST%</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">CGST</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">SGST</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {invoice.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 text-sm text-gray-600">{index + 1}</td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">{item.hsn_code || '3004'}</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">{item.batch_number}</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">
                    {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { 
                      month: '2-digit',
                      year: '2-digit' 
                    }) : '-'}
                  </td>
                  <td className="px-3 py-3 text-sm text-center font-medium text-gray-900">
                    {item.quantity}
                    {item.free_quantity > 0 && (
                      <span className="text-green-600 text-xs"> (+{item.free_quantity})</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">{formatCurrency(item.mrp)}</td>
                  <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(item.sale_price || item.rate || 0)}</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">{item.discount_percent || 0}%</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">{item.free_quantity || 0}</td>
                  <td className="px-3 py-3 text-sm text-center text-gray-600">{item.gst_percent || 12}%</td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">
                    {(() => {
                      // Calculate GST on the fly to avoid state issues
                      const subtotal = (item.sale_price || item.rate || 0) * (item.quantity || 0);
                      const discount = (subtotal * (item.discount_percent || 0)) / 100;
                      const taxable = subtotal - discount;
                      const gst = (taxable * (item.gst_percent || 12)) / 100;
                      return invoice.gst_type !== 'IGST' ? formatCurrency(gst / 2) : '-';
                    })()}
                  </td>
                  <td className="px-3 py-3 text-sm text-right text-gray-600">
                    {(() => {
                      // Calculate GST on the fly to avoid state issues
                      const subtotal = (item.sale_price || item.rate || 0) * (item.quantity || 0);
                      const discount = (subtotal * (item.discount_percent || 0)) / 100;
                      const taxable = subtotal - discount;
                      const gst = (taxable * (item.gst_percent || 12)) / 100;
                      return invoice.gst_type !== 'IGST' ? formatCurrency(gst / 2) : '-';
                    })()}
                  </td>
                  <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                    {(() => {
                      const quantity = parseFloat(item.quantity) || 0;
                      const rate = parseFloat(item.rate) || parseFloat(item.sale_price) || 0;
                      const discount = parseFloat(item.discount_percent) || 0;
                      const gstPercent = parseFloat(item.gst_percent) || parseFloat(item.tax_rate) || 12;
                      
                      const discountAmount = (quantity * rate * discount) / 100;
                      const baseAmount = (quantity * rate) - discountAmount;
                      const taxAmount = (baseAmount * gstPercent) / 100;
                      const totalAmount = baseAmount + taxAmount;
                      
                      return formatCurrency(totalAmount);
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Side - Tax Breakup & Signature */}
          <div className="flex flex-col h-full">
            {/* Tax Breakup */}
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Tax Breakup</h3>
              <div className="bg-gray-50 rounded-lg p-2.5">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left pb-1 text-gray-600 font-medium">Rate</th>
                      <th className="text-right pb-1 text-gray-600 font-medium">Taxable</th>
                      <th className="text-right pb-1 text-gray-600 font-medium">CGST</th>
                      <th className="text-right pb-1 text-gray-600 font-medium">SGST</th>
                      <th className="text-right pb-1 text-gray-600 font-medium">IGST</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="pt-1 text-gray-700">12%</td>
                      <td className="pt-1 text-right text-gray-700">{formatCurrency(totals.taxableAmount)}</td>
                      <td className="pt-1 text-right text-gray-700">
                        {formatCurrency(totals.cgstAmount)}
                      </td>
                      <td className="pt-1 text-right text-gray-700">
                        {formatCurrency(totals.sgstAmount)}
                      </td>
                      <td className="pt-1 text-right text-gray-700">
                        {invoice.gst_type === 'IGST' ? formatCurrency(totals.igstAmount) : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Authorized Signatory - Aligned with Net Amount */}
            <div className="mt-auto">
              <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Authorized Signatory</h3>
              <div className="h-[52px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                <span className="text-[11px] text-gray-400">Digital Signature</span>
              </div>
            </div>
          </div>

          {/* Right Side - Summary */}
          <div>
            <div className="space-y-3">
              {/* Main Summary */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">{formatCurrency(invoice.gross_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-gray-900">-{formatCurrency(invoice.discount_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxable Amount</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totals.taxableAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">GST (12%)</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totals.totalTax)}</span>
                  </div>
                  {invoice.delivery_charges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Charges</span>
                      <span className="font-medium text-gray-900">{formatCurrency(invoice.delivery_charges)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Round Off</span>
                    <span className="font-medium text-gray-900">
                      {invoice.round_off >= 0 ? '+' : '-'}{formatCurrency(Math.abs(invoice.round_off || 0))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Amount - Blue highlight */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-3 shadow-lg">
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold text-sm">Net Amount</span>
                  <span className="text-xl font-bold text-white">{formatCurrency(totals.totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;