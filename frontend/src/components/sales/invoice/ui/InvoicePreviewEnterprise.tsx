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
            {/* Company Info - Cleaner layout */}
            <div>
              <div className="bg-gradient-to-br from-blue-50 to-gray-50 rounded-xl p-3 h-full border border-blue-200 print-border print-bg-blue">
                <div className="flex items-start space-x-2">
                  {companyInfo?.logo ? (
                    <img
                      src={companyInfo?.logo}
                      alt={companyInfo?.company_name || companyInfo?.name || 'Company'}
                      className="w-10 h-10 object-contain rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-white">{(companyInfo?.company_name || companyInfo?.name || 'A').charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 leading-tight">{companyInfo?.company_name || companyInfo?.name || 'Your Company Name'}</h2>
                    <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-2">{companyInfo?.address || ''}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      <span className="font-medium">GST:</span> {companyInfo?.gst || companyInfo?.gst_number || '-'}
                    </p>
                    <p className="text-[10px] text-gray-600">
                      <span className="font-medium">DL:</span> {companyInfo?.drug_license_no || companyInfo?.drugLicense || '-'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div>
              <div className="bg-gray-50 rounded-xl p-3 h-full print-border print-bg-gray">
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Bank Details</h3>
                {(() => {
                  // Get selected bank account from invoice or use default
                  // Support both camelCase and snake_case field names
                  const bankAccounts = (companyInfo as any)?.bank_accounts || companyInfo?.bankAccounts;
                  const selectedBank = invoice.bank_account_id && bankAccounts
                    ? bankAccounts.find((acc: any) => acc.id === invoice.bank_account_id)
                    : bankAccounts?.[0]; // Default to first account

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
            </div>

            {/* Invoice Info */}
            <div>
              <div className="bg-gray-100 rounded-xl p-3 h-full border border-gray-200 print-border print-bg-gray">
                <h1 className="text-sm font-bold text-gray-900 mb-2">TAX INVOICE</h1>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-700">
                    <span className="text-gray-500">No:</span>
                    <span className="ml-1 font-medium">{invoice.invoice_number || invoice.invoice_number}</span>
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

        {/* Customer, Delivery & QR Section - 3 Column Grid */}
        {showAddresses && (
          <div className="mb-4">
            <div className="grid grid-cols-3 gap-3">
              {/* Customer Details - Cleaner formatting */}
              <div>
                <div className="bg-white rounded-xl p-3 border border-gray-200 h-full">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</div>
                  <div className="font-semibold text-gray-900 text-sm">{invoice.customer_name}</div>

                  {/* Address - Split into lines */}
                  {(() => {
                    let addressLine1 = '';
                    let cityZipLine = '';

                    if (typeof invoice.billing_address === 'string' && invoice.billing_address) {
                      // Parse string address - assume format: "street, city, zip"
                      const parts = invoice.billing_address.split(',').map(p => p.trim());
                      addressLine1 = parts.slice(0, -2).join(', ') || parts[0] || '';
                      cityZipLine = parts.slice(-2).join(', ');
                    } else if (invoice.billing_address && typeof invoice.billing_address === 'object') {
                      const addr = invoice.billing_address as any;
                      addressLine1 = [addr.address_line1, addr.address_line2].filter(Boolean).join(', ');
                      cityZipLine = [addr.city, addr.pincode || addr.zip].filter(Boolean).join(' | ');
                    } else if (invoice.customer_details?.address) {
                      if (typeof invoice.customer_details.address === 'string') {
                        const parts = invoice.customer_details.address.split(',').map(p => p.trim());
                        addressLine1 = parts.slice(0, -2).join(', ') || parts[0] || '';
                        cityZipLine = parts.slice(-2).join(', ');
                      } else {
                        const addr = invoice.customer_details.address as any;
                        addressLine1 = [addr.address_line1, addr.address_line2].filter(Boolean).join(', ');
                        cityZipLine = [addr.city, addr.pincode || addr.zip].filter(Boolean).join(' | ');
                      }
                    }

                    return (
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        {addressLine1 && <div>{addressLine1}</div>}
                        {cityZipLine && <div className="text-gray-500">{cityZipLine}</div>}
                      </div>
                    );
                  })()}

                  {/* Phone, GST, DL - Clean lines */}
                  <div className="mt-1.5 space-y-0.5 text-[10px]">
                    {(invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone) && (
                      <div className="text-gray-600">📞 {invoice.customer_details?.phone || invoice.customer_details?.mobile || invoice.customer_details?.primary_phone}</div>
                    )}
                    {invoice.customer_details?.gst_number && (
                      <div><span className="text-gray-500">GST:</span> <span className="font-medium text-gray-800">{invoice.customer_details.gst_number}</span></div>
                    )}
                    {invoice.customer_details?.drug_license_number && (
                      <div><span className="text-gray-500">DL:</span> <span className="text-gray-700">{invoice.customer_details.drug_license_number}</span></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Delivery/Transport */}
              <div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 h-full">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Delivery</div>
                  <div className="space-y-0.5">
                    {invoice.delivery_type && (
                      <div className="text-xs">
                        <span className="text-gray-500">Mode:</span> <span className="font-medium text-gray-800">{invoice.delivery_type}</span>
                      </div>
                    )}
                    {invoice.transport_company && (
                      <div className="text-xs">
                        <span className="text-gray-500">Transport:</span> <span className="text-gray-700">{invoice.transport_company}</span>
                      </div>
                    )}
                    {invoice.vehicle_number && (
                      <div className="text-xs">
                        <span className="text-gray-500">Vehicle:</span> <span className="text-gray-700">{invoice.vehicle_number}</span>
                      </div>
                    )}
                    {(invoice.delivery_charges ?? 0) > 0 && (
                      <div className="text-xs">
                        <span className="text-gray-500">Charges:</span> <span className="font-medium text-gray-800">{formatCurrency(invoice.delivery_charges ?? 0)}</span>
                      </div>
                    )}
                    {!invoice.delivery_type && !invoice.transport_company && !invoice.vehicle_number && (
                      <div className="text-xs text-gray-500">Self pickup / Local</div>
                    )}
                  </div>
                </div>
              </div>

              {/* QR Code */}
              <div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 h-full">
                  <div className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1 text-center">Scan to Pay</div>
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-white rounded-lg border border-gray-300 flex items-center justify-center">
                      {companyInfo?.paymentQR ? (
                        <img src={companyInfo.paymentQR} alt="Payment QR" className="w-14 h-14 object-contain" />
                      ) : (
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium">{companyInfo?.upiId || 'aasopharma@paytm'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Items Table - Added Pack and Free columns, cleaner batch display */}
        <div className="mb-8">
          <table className="w-full border border-gray-300 text-[10px]">
            <thead className="bg-gray-100 print-colors">
              <tr className="border-b border-gray-300">
                <th className="text-left py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '3%' }}>#</th>
                <th className="text-left py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '20%' }}>Product</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '7%' }}>Pack</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '8%' }}>Batch</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>HSN</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>Exp</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '8%' }}>MRP</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '5%' }}>Qty</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '5%' }}>Free</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '8%' }}>Rate</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>Disc%</th>
                <th className="text-center py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>GST%</th>
                <th className="text-right py-1.5 px-2 font-semibold text-gray-700 uppercase" style={{ width: '10%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, index) => {
                const quantity = parseFloat(String(item.quantity || 0));
                const unit_price = parseFloat(String(item.unit_price || 0));
                const discount = parseFloat(String(item.discount_percent || 0));
                const gstPercent = parseFloat(String(item.gst_percent || item.tax_percent || 0));
                const freeQty = parseFloat(String(item.free_quantity || 0));

                const subtotal = quantity * unit_price;
                const discountAmount = (subtotal * discount) / 100;
                const taxableAmount = subtotal - discountAmount;
                const gstAmount = (taxableAmount * gstPercent) / 100;
                const lineTotal = taxableAmount + gstAmount;

                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-1.5 px-2 text-center border-r border-gray-200">{index + 1}</td>
                    <td className="py-1.5 px-2 border-r border-gray-200">
                      <div className="font-medium text-gray-900">{item.product_name}</div>
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200 text-gray-600">
                      {item.pack_size || '-'}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200 text-gray-600">
                      {item.batch_number || '-'}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200">
                      {item.hsn_code || '3004'}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200">
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', {
                        month: '2-digit',
                        year: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right border-r border-gray-200">
                      {formatCurrency(item.mrp || unit_price)}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200 font-medium">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200 text-green-600 font-medium">
                      {freeQty > 0 ? freeQty : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right border-r border-gray-200">
                      {formatCurrency(unit_price)}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200">
                      {discount > 0 ? `${discount.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-gray-200">
                      {gstPercent > 0 ? `${gstPercent}%` : '-'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold">
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