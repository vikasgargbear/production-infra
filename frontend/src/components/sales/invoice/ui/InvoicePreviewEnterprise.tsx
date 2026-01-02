import React from 'react';
import EnterpriseCalculator from '../../../../services/enterpriseCalculator';

// Import centralized types - single source of truth
import type {
  Customer,
  Invoice,
  InvoiceItem,
  InvoiceTotals,
  CompanyInfo,
  BankAccount
} from '../types/invoiceTypes';

// ==================== COMPONENT PROPS ====================

interface InvoicePreviewEnterpriseProps {
  invoice: Invoice;
  onInvoiceUpdate?: (invoice: Invoice) => void;
  companyInfo?: CompanyInfo;
  showAddresses?: boolean;
  isPrintMode?: boolean;
}

// ==================== COMPONENT ====================

const InvoicePreviewEnterprise: React.FC<InvoicePreviewEnterpriseProps> = ({
  invoice,
  onInvoiceUpdate,
  companyInfo = {}, // Default to empty object to prevent undefined errors
  showAddresses = true, // Control whether to show Bill To/Ship To sections
  isPrintMode = false // New prop to determine if we're in print/PDF mode
}) => {
  // CRITICAL FIX: DO NOT CALCULATE HERE!
  // Totals are calculated BEFORE navigation in InvoiceFlow handleContinueFromStep2
  // This component is DISPLAY ONLY - no calculation logic!

  // Remove all calculation state - not needed
  // const [calculatedTotals, setCalculatedTotals] = useState(null);
  // const [isCalculating, setIsCalculating] = useState(false);

  // REMOVED: useEffect that calculated - caused race condition
  // Now we ONLY use pre-calculated invoice.totals

  // REMOVED: calculateTotalsViaAPI() - caused race condition with forced calculation
  // Totals are now calculated ONCE in InvoiceFlow before navigation

  const formatCurrency = (amount: number | string | undefined): string => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return EnterpriseCalculator.formatCurrency(value);
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // CRITICAL FIX: Use ONLY pre-calculated totals from invoice.totals
  // These are calculated in InvoiceFlow.handleContinueFromStep2 BEFORE navigation
  // NO fallbacks, NO independent calculations - SINGLE SOURCE OF TRUTH!

  const totals = invoice.totals || {
    // Emergency fallback (should never be used in practice)
    subtotal_amount: 0,
    discount_amount: 0,
    scheme_discount: 0,
    taxable_amount: 0,
    total_tax_amount: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    freight_charges: 0,
    round_off_amount: 0,
    final_amount: 0
  };

  console.log('💰 [PREVIEW DISPLAY] Using invoice.totals:', totals);
  console.log('💰 [PREVIEW DISPLAY] Has totals?:', !!invoice.totals);

  if (!invoice.totals) {
    console.error('🚨 [PREVIEW] invoice.totals is missing! This should never happen!');
  }

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
            size: A4 portrait;
            margin: 15mm;
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
          .print-colors {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      <div id="invoice-preview" className="px-6 py-4">
        {/* Removed: Calculation status indicator - preview no longer calculates */}

        {/* Header Section - Company Branding Row - 3 tiles to match below */}
        <div className="mb-3">
          <div className="grid grid-cols-3 gap-3 items-stretch">
            {/* Company Info - Bigger for branding */}
            <div>
              <div className="bg-gradient-to-br from-blue-50 to-gray-50 rounded-xl p-4 h-full border border-blue-200 print-border print-bg-blue">
                <div className="flex items-start space-x-3">
                  {companyInfo?.logo ? (
                    <img
                      src={companyInfo?.logo}
                      alt={companyInfo?.name || 'Company'}
                      className="w-20 h-20 object-contain rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                      <span className="text-3xl font-bold text-white">A</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900">{companyInfo?.name || 'Your Company Name'}</h2>
                    <p className="text-sm text-gray-600 mt-1">{companyInfo?.address || 'Company Address'}</p>
                    <p className="text-sm text-gray-600">GSTIN: {companyInfo?.gstin || ''}</p>
                    <p className="text-sm text-gray-600">DL No: {companyInfo?.drugLicense || ''}</p>
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
                    {(() => {
                      // Get selected bank account from invoice or use default
                      const selectedBank = invoice.bank_account_id && companyInfo?.bankAccounts
                        ? companyInfo.bankAccounts.find(acc => acc.id === invoice.bank_account_id)
                        : companyInfo?.bankAccounts?.[0]; // Default to first account

                      if (selectedBank) {
                        return (
                          <div className="text-sm text-gray-600 space-y-1">
                            <p className="font-semibold text-gray-900">{selectedBank.bank_name}</p>
                            <p>A/C: {selectedBank.account_number}</p>
                            <p>IFSC: {selectedBank.ifsc_code}</p>
                            {selectedBank.branch_name && (
                              <p className="text-xs">Branch: {selectedBank.branch_name}</p>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-sm text-gray-500 italic">
                            <p>No bank account configured</p>
                            <p className="text-xs mt-1">Please add bank details in company settings</p>
                          </div>
                        );
                      }
                    })()}
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
                        <p className="text-[9px] text-gray-600 mt-1">{companyInfo?.upiId || 'aasopharma@paytm'}</p>
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
                    <span className="ml-1 font-medium">{invoice.invoice_number || invoice.invoice_no}</span>
                  </p>
                  <p className="text-xs text-gray-700">
                    <span className="text-gray-500">Date:</span>
                    <span className="ml-1 font-medium">{formatDate(invoice.invoice_date || '')}</span>
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

        {/* Customer & Transport Section - Professional Compact Design */}
        {showAddresses && (
          <div className="mb-4">
            {/* Combined Customer & Transport Table - All in One Professional Block */}
            <div className="border border-gray-800 print-border">
              <table className="w-full">
                <tbody>
                  <tr className="border-b border-gray-800">
                    {/* Bill To */}
                    <td className="border-r border-gray-800 p-3 align-top w-1/3">
                      <div className="text-xs font-bold text-gray-900 mb-2 uppercase">Bill To</div>
                      <div className="font-semibold text-gray-900 text-xs mb-1">{invoice.customer_name}</div>
                      {typeof invoice.billing_address === 'string' ? (
                        <div className="text-xs text-gray-700 leading-relaxed">{invoice.billing_address}</div>
                      ) : invoice.billing_address && typeof invoice.billing_address === 'object' ? (
                        <div className="text-xs text-gray-700 leading-relaxed">
                          {[
                            (invoice.billing_address as any).address_line1,
                            (invoice.billing_address as any).address_line2,
                            (invoice.billing_address as any).street,
                            (invoice.billing_address as any).city,
                            (invoice.billing_address as any).state,
                            (invoice.billing_address as any).pincode
                          ].filter(Boolean).join(', ')}
                        </div>
                      ) : invoice.customer_details ? (
                        <>
                          <div className="text-xs text-gray-700 leading-relaxed">
                            {typeof invoice.customer_details.address === 'string'
                              ? invoice.customer_details.address
                              : invoice.customer_details.address && typeof invoice.customer_details.address === 'object'
                                ? [
                                  (invoice.customer_details.address as any).address_line1,
                                  (invoice.customer_details.address as any).address_line2,
                                  (invoice.customer_details.address as any).street,
                                  (invoice.customer_details.address as any).city,
                                  (invoice.customer_details.address as any).state
                                ].filter(Boolean).join(', ')
                                : ''}
                          </div>
                          {invoice.customer_details.city && invoice.customer_details.state && (
                            <div className="text-xs text-gray-700">{invoice.customer_details.city}, {invoice.customer_details.state}</div>
                          )}
                        </>
                      ) : null}
                      {(invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                        <div className="text-xs text-gray-700 mt-1">Ph: {invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</div>
                      )}
                      {invoice.customer_details?.gstin && (
                        <div className="text-xs text-gray-700 font-medium">GST: {invoice.customer_details.gstin}</div>
                      )}
                    </td>

                    {/* Ship To */}
                    <td className="border-r border-gray-800 p-3 align-top w-1/3">
                      <div className="text-xs font-bold text-gray-900 mb-2 uppercase">Ship To</div>
                      {invoice.is_same_address !== false || invoice.billing_address === invoice.shipping_address ? (
                        <>
                          <div className="text-xs text-gray-600 mb-1 italic">Same as billing address</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold text-gray-900 text-xs mb-1">{invoice.shipping_contact_name || invoice.customer_name}</div>
                          {invoice.shipping_address && (
                            <div className="text-xs text-gray-700 leading-relaxed">{invoice.shipping_address}</div>
                          )}
                          {(invoice.shipping_phone || invoice.customer_details?.phone) && (
                            <div className="text-xs text-gray-700 mt-1">Ph: {invoice.shipping_phone || invoice.customer_details?.phone}</div>
                          )}
                        </>
                      )}
                    </td>

                    {/* Transport Details */}
                    <td className="p-3 align-top w-1/3">
                      <div className="text-xs font-bold text-gray-900 mb-2 uppercase">Transport</div>
                      <div className="space-y-1">
                        {invoice.delivery_type && (
                          <div className="text-xs text-gray-700">
                            <span className="text-gray-600">Type:</span> <span className="font-medium">{invoice.delivery_type}</span>
                          </div>
                        )}
                        {invoice.transport_company && (
                          <div className="text-xs text-gray-700">
                            <span className="text-gray-600">Company:</span> {invoice.transport_company}
                          </div>
                        )}
                        {invoice.vehicle_number && (
                          <div className="text-xs text-gray-700">
                            <span className="text-gray-600">Vehicle:</span> {invoice.vehicle_number}
                          </div>
                        )}
                        {(invoice.delivery_charges ?? 0) > 0 && (
                          <div className="text-xs text-gray-700">
                            <span className="text-gray-600">Charges:</span> <span className="font-medium">{formatCurrency(invoice.delivery_charges ?? 0)}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>


          </div>
        )}

        {/* Items Table - Less Cramped, Bigger Font */}
        <div className="mb-10">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100 print-colors">
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">#</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Product</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">HSN</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Expiry</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">MRP</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Qty</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Rate</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Disc%</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">GST%</th>
                <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, index) => {
                // Calculate per-item amounts (display only - no business logic)
                // CRITICAL: ALWAYS use item.quantity (not base_quantity)
                const quantity = parseFloat(String(item.quantity || 0)); // Source of truth
                const rate = parseFloat(String(item.sale_price || item.rate || item.unit_price || 0));
                const discount = parseFloat(String(item.discount_percent || item.discount || 0));
                const gstPercent = parseFloat(String(item.gst_percent || item.tax_percent || 0));

                const subtotal = quantity * rate;
                const discountAmount = (subtotal * discount) / 100;
                const taxableAmount = subtotal - discountAmount;
                const gstAmount = (taxableAmount * gstPercent) / 100;
                const lineTotal = taxableAmount + gstAmount;

                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2 px-3 text-sm border-r border-gray-200">{index + 1}</td>
                    <td className="py-2 px-3 border-r border-gray-200">
                      <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                      <div className="text-[10px] text-gray-500">Batch: {item.batch_number || 'N/A'}</div>
                    </td>
                    <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                      {item.hsn_code || '3004'}
                    </td>
                    <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', {
                        month: '2-digit',
                        year: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="py-2 px-3 text-xs text-right border-r border-gray-200">
                      {formatCurrency(item.mrp || rate)}
                    </td>
                    <td className="py-2 px-3 text-sm text-center border-r border-gray-200 font-medium">
                      {item.quantity}
                      {(item.free_quantity ?? 0) > 0 && (
                        <div className="text-green-600 text-xs">+{item.free_quantity} free</div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-sm text-right border-r border-gray-200">
                      {formatCurrency(rate)}
                    </td>
                    <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                      {discount > 0 ? `${discount.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                      {gstPercent > 0 ? `${gstPercent}%` : '-'}
                    </td>
                    <td className="py-2 px-3 text-sm text-right font-semibold">
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Section - More Space Above */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Side - Notes & Compact Signature */}
          <div className="space-y-4">
            {/* Notes Section - Challan Style */}
            {invoice.notes && (
              <div className="border border-gray-300 rounded-lg overflow-hidden">
                <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
                  <h3 className="text-xs font-bold text-gray-800 uppercase">Notes</h3>
                </div>
                <div className="p-3">
                  <p className="text-xs text-gray-700 leading-relaxed">{invoice.notes}</p>
                </div>
              </div>
            )}

            {/* Tax Breakup */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-2">Tax Breakup</h3>
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
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

            {/* Compact Authorization - Smaller */}
            <div className="border border-gray-200 rounded p-2">
              <p className="text-xs text-gray-600">For {invoice.company_name || companyInfo?.name || 'Your Company'}</p>
              <p className="text-xs text-gray-400 mt-1">Digitally Authorized</p>
              <p className="text-xs text-gray-400">ERP System Generated</p>
            </div>
          </div>

          {/* Right Side - Summary (API-calculated totals) */}
          <div className="flex justify-end">
            <div className="border border-gray-300 rounded-lg overflow-hidden w-80">
              <div className="bg-gray-100 px-3 py-2">
                <h3 className="text-xs font-bold text-gray-800 uppercase">Invoice Summary</h3>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal_amount)}</span>
                </div>
                {(totals.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Item Discounts:</span>
                    <span className="font-medium text-green-600">-{formatCurrency(totals.discount_amount)}</span>
                  </div>
                )}
                {(totals.scheme_discount ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Scheme Discount:</span>
                    <span className="font-medium text-green-600">-{formatCurrency(totals.scheme_discount ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Taxable Amount:</span>
                  <span className="font-medium">{formatCurrency(totals.taxable_amount)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Total GST:</span>
                  <span className="font-medium">{formatCurrency(totals.total_tax_amount || 0)}</span>
                </div>
                {(totals.freight_charges ?? 0) > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Delivery Charges:</span>
                    <span className="font-medium">{formatCurrency(totals.freight_charges)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Round Off:</span>
                  <span className="font-medium">
                    {(totals.round_off_amount ?? 0) >= 0 ? '+' : ''}{formatCurrency(totals.round_off_amount ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-300">
                  <span className="text-sm font-bold text-gray-900">Net Amount:</span>
                  <span className="text-sm font-bold text-blue-600">
                    {formatCurrency(
                      // Use final_amount from calculator (includes all discounts, delivery, etc.)
                      totals.final_amount || totals.net_amount || 0
                    )}
                  </span>
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