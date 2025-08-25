import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Phone, Mail, Truck, CreditCard, FileText } from 'lucide-react';
import InvoiceCalculatorEnterprise from '../../../services/invoiceCalculatorEnterprise';

const InvoicePreviewEnterprise = ({ 
  invoice, 
  onInvoiceUpdate,
  companyInfo,
  showAddresses = true, // Control whether to show Bill To/Ship To sections
  isPrintMode = false // New prop to determine if we're in print/PDF mode
}) => {
  const [calculatedTotals, setCalculatedTotals] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Calculate totals via API when invoice changes
  useEffect(() => {
    if (invoice && invoice.items && invoice.items.length > 0) {
      calculateTotalsViaAPI();
    }
  }, [invoice.items, invoice.gst_type, invoice.delivery_charges, invoice.discount_amount]);
  
  const calculateTotalsViaAPI = async () => {
    try {
      setIsCalculating(true);
      
      const invoiceData = {
        items: invoice.items.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity,
          base_quantity: item.base_quantity || (item.quantity - (item.free_quantity || 0)),
          free_quantity: item.free_quantity || 0,
          unit_price: item.sale_price || item.rate || item.unit_price,
          discount_percent: item.discount_percent || 0,
          gst_percent: item.gst_percent || 12
        })),
        gst_type: invoice.gst_type || 'CGST/SGST',
        delivery_charges: invoice.delivery_charges || 0,
        discount_amount: invoice.discount_amount || 0
      };
      
      const result = await InvoiceCalculatorEnterprise.calculateInvoice(invoiceData);
      setCalculatedTotals(result.totals);
      
    } catch (error) {
      console.error('Failed to calculate totals:', error);
      // Keep existing totals on error
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCurrency = (amount) => {
    return InvoiceCalculatorEnterprise.formatCurrency(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Use calculated totals from API, fallback to invoice values
  const totals = calculatedTotals || {
    gross_amount: invoice.gross_amount || 0,
    total_discount: invoice.discount_amount || 0,
    taxable_amount: invoice.taxable_amount || invoice.subtotal_amount || 0,
    total_tax: invoice.total_tax_amount || invoice.tax_amount || 0,
    cgst_amount: invoice.cgst_amount || 0,
    sgst_amount: invoice.sgst_amount || 0,
    igst_amount: invoice.igst_amount || 0,
    delivery_charges: invoice.delivery_charges || 0,
    round_off: invoice.round_off || 0,
    net_amount: invoice.net_amount || 0,  // Net amount (before rounding)
    final_amount: invoice.final_amount || invoice.net_amount || 0  // Final amount (after rounding)
  };

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
          /* Hide animations in print */
          .animate-spin,
          [class*="animate"] {
            display: none !important;
          }
          /* Show hidden elements during print */
          .print\\:block {
            display: block !important;
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
          /* Pack column specific styling for print */
          .pack-column {
            max-width: 60px !important;
            font-size: 9px !important;
          }
        }
      `}</style>
      <div id="invoice-preview" className="px-6 py-4">
        {/* Calculation Status Indicator - Hidden in print/PDF */}
        {isCalculating && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 no-print">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-sm text-blue-700">Calculating totals via enterprise API...</span>
            </div>
          </div>
        )}
        
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
                    <h2 className="text-xl font-bold text-gray-900">{companyInfo.name || 'Your Company Name'}</h2>
                    <p className="text-sm text-gray-600 mt-1">{companyInfo.address || 'Company Address'}</p>
                    <p className="text-sm text-gray-600">GSTIN: {companyInfo.gstin || ''}</p>
                    <p className="text-sm text-gray-600">DL No: {companyInfo.drugLicense || ''}</p>
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
                    <span className="ml-1 font-medium">
                      {invoice.payment_status === 'Paid' ? 
                        `${invoice.payment_mode || 'CASH'}` : 
                        `${invoice.payment_status || 'Pending'}`
                      }
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer & Transport Section - Below header */}
        {/* Hide in preview mode but show in print/PDF - use CSS class for print visibility */}
        {showAddresses && (
          <div className={`mb-4 ${isPrintMode ? '' : 'hidden print:block'}`}>
            <div className="grid grid-cols-3 gap-3">
              {/* Bill To */}
              <div className="bg-gray-50 rounded-xl p-3 print-border print-bg-gray">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bill To</h3>
                <p className="font-semibold text-gray-900 text-sm">{invoice.customer_name}</p>
                {invoice.billing_address ? (
                  <p className="text-xs text-gray-600 mt-1">{invoice.billing_address}</p>
                ) : invoice.customer_details ? (
                  <>
                    <p className="text-xs text-gray-600 mt-1">{invoice.customer_details.address}</p>
                    {invoice.customer_details.city && invoice.customer_details.state && (
                      <p className="text-xs text-gray-600">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                    )}
                  </>
                ) : null}
                {(invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                  <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</p>
                )}
                {invoice.customer_details?.gstin && (
                  <p className="text-xs text-gray-600">GST: {invoice.customer_details.gstin}</p>
                )}
              </div>

            {/* Ship To */}
            <div className="bg-gray-50 rounded-xl p-3 print-border print-bg-gray">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ship To</h3>
              {invoice.is_same_address !== false || invoice.billing_address === invoice.shipping_address ? (
                <>
                  <p className="text-xs text-gray-600 mb-1">✓ Same as billing</p>
                  <p className="font-semibold text-gray-900 text-sm">{invoice.customer_name}</p>
                  {/* Use exact same format as Bill To */}
                  {invoice.billing_address ? (
                    <>
                      <p className="text-xs text-gray-600 mt-1">{invoice.billing_address}</p>
                      {/* Always show phone for shipping */}
                      {(invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                        <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</p>
                      )}
                    </>
                  ) : invoice.customer_details ? (
                    <>
                      <p className="text-xs text-gray-600 mt-1">{invoice.customer_details.address}</p>
                      {invoice.customer_details.city && invoice.customer_details.state && (
                        <p className="text-xs text-gray-600">{invoice.customer_details.city}, {invoice.customer_details.state}</p>
                      )}
                      {(invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                        <p className="text-xs text-gray-600 mt-1">Ph: {invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</p>
                      )}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 text-sm">{invoice.shipping_contact_name || invoice.customer_name}</p>
                  {invoice.shipping_address && (
                    <p className="text-xs text-gray-600 mt-1">{invoice.shipping_address}</p>
                  )}
                  {/* Always show phone for different shipping address */}
                  {(invoice.shipping_phone || invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                    <p className="text-xs text-gray-600 mt-1">Ph: {invoice.shipping_phone || invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</p>
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
        )}

        {/* Items Table */}
        <div className="mb-8 rounded-lg overflow-hidden border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">#</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">HSN</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider pack-column">Pack</th>
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
              {invoice.items.map((item, index) => {
                // Calculate per-item amounts (display only - no business logic)
                const baseQuantity = parseFloat(item.base_quantity || (item.quantity - (item.free_quantity || 0)));
                const rate = parseFloat(item.sale_price || item.rate || 0);
                const discount = parseFloat(item.discount_percent || 0);
                const gstPercent = parseFloat(item.gst_percent || 12);
                
                const subtotal = baseQuantity * rate;
                const discountAmount = (subtotal * discount) / 100;
                const taxableAmount = subtotal - discountAmount;
                const gstAmount = (taxableAmount * gstPercent) / 100;
                const lineTotal = taxableAmount + gstAmount;
                
                return (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3 text-sm text-gray-600">{index + 1}</td>
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{item.product_name}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">{item.hsn_code || '3004'}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600 pack-column">
                      <span className="text-xs">
                        {(() => {
                          // Display pack configuration
                          if (item.packages_per_box && item.units_per_pack) {
                            return `${item.packages_per_box}×${item.units_per_pack}`;
                          } else if (item.pack_type && item.units_per_pack) {
                            return `${item.units_per_pack} ${item.pack_type}`;
                          } else if (item.pack_size) {
                            return `1×${item.pack_size}`;
                          } else {
                            return '-';
                          }
                        })()}
                      </span>
                    </td>
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
                    <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(rate)}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">{discount}%</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">{item.free_quantity || 0}</td>
                    <td className="px-3 py-3 text-sm text-center text-gray-600">{gstPercent}%</td>
                    <td className="px-3 py-3 text-sm text-right text-gray-600">
                      {invoice.gst_type !== 'IGST' ? formatCurrency(gstAmount / 2) : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-right text-gray-600">
                      {invoice.gst_type !== 'IGST' ? formatCurrency(gstAmount / 2) : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })}
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
                      <td className="pt-1 text-right text-gray-700">{formatCurrency(totals.taxable_amount)}</td>
                      <td className="pt-1 text-right text-gray-700">
                        {formatCurrency(totals.cgst_amount)}
                      </td>
                      <td className="pt-1 text-right text-gray-700">
                        {formatCurrency(totals.sgst_amount)}
                      </td>
                      <td className="pt-1 text-right text-gray-700">
                        {invoice.gst_type === 'IGST' ? formatCurrency(totals.igst_amount) : '-'}
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

          {/* Right Side - Summary (API-calculated totals) */}
          <div>
            <div className="space-y-3">
              {/* Main Summary */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totals.gross_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-gray-900">-{formatCurrency(totals.total_discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxable Amount</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totals.taxable_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">GST (12%)</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totals.total_tax)}</span>
                  </div>
                  {totals.delivery_charges > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Delivery Charges</span>
                      <span className="font-medium text-gray-900">{formatCurrency(totals.delivery_charges)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Round Off</span>
                    <span className="font-medium text-gray-900">
                      {totals.round_off >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totals.round_off))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Amount - Blue highlight */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-3 shadow-lg">
                <div className="flex justify-between items-center">
                  <span className="text-white font-semibold text-sm">Net Amount</span>
                  <span className="text-xl font-bold text-white">
                    {formatCurrency(
                      (totals.taxable_amount || 0) + 
                      (totals.total_tax || totals.tax_amount || 0) + 
                      (totals.round_off || 0) + 
                      (totals.delivery_charges || 0) -
                      (totals.invoice_discount || 0)
                    )}
                  </span>
                  {isCalculating && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white ml-2"></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreviewEnterprise;