import React from 'react';

// Import centralized types - single source of truth
import type { Invoice, InvoiceItem, CompanyInfo } from '../types/invoiceTypes';
import { addExactDecimals, compareExactDecimals, formatExactCurrency, formatExactDecimal, normalizeExactDecimal } from '../../../../utils/exactDecimal';
import { canonicalInvoicePreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';

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

  const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;
  const quantityOptions = { scale: 6, maximumWholeDigits: 20, allowNegative: false } as const;
  const formatCurrency = (amount: unknown): string => formatExactCurrency(amount, 'Invoice preview money');

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

  const previewUnavailableReason = canonicalInvoicePreviewUnavailableReason(invoice);
  const companyName = String(companyInfo?.name ?? '').trim();
  const customerName = String(invoice.customer_name ?? '').trim();
  const contextUnavailableReason = !companyName
    ? 'The canonical company name is unavailable.'
    : !customerName
      ? 'The canonical customer name is unavailable.'
      : null;
  if (previewUnavailableReason || contextUnavailableReason) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900" role="alert">
        <p className="font-semibold">Authoritative invoice preview unavailable</p>
        <p className="mt-1">{previewUnavailableReason ?? contextUnavailableReason}</p>
      </div>
    );
  }
  const totals = invoice.totals!;

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
      {/* Screen: fill more width | Print: constrain to A4 */}
      <div
        id="invoice-preview"
        className={`bg-white mx-auto p-6 font-[system-ui] ${isPrintMode
          ? 'max-w-[210mm] min-h-[297mm]'  // A4 size for print
          : 'w-full'  // Full width, seamless with container
          }`}
      >
        {/* Removed: Calculation status indicator - preview no longer calculates */}

        {/* Header Section - Centered Logo + Title Bar + Company/Customer */}
        <div className="mb-5">
          {/* Logo Left | Title + Meta Right */}
          <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3 mb-4">
            {/* Logo */}
            <div className="flex items-center">
              {companyInfo?.logo ? (
                <img src={companyInfo.logo} alt="Company Logo" className="h-20 w-auto object-contain" />
              ) : (
                <div className="w-16 h-16 bg-gray-800 rounded flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{companyName.charAt(0).toUpperCase()}</span>
                </div>
              )}
            </div>

            {/* Title + Invoice Details - Right aligned, stacked */}
            <div className="text-right">
              <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">TAX INVOICE</h1>
              <div className="text-xs mt-1.5 space-y-0.5">
                <div>
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Invoice No: </span>
                  <span className="font-bold text-gray-900">
                    {invoice.invoice_number?.replace(/^DRAFT-/, '') || 'Assigned after posting'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Date: </span>
                  <span className="font-bold text-gray-900">{formatDate(invoice.invoice_date)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Company & Customer Info - 2 Column Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Company Info Tile */}
            <div className="bg-gray-50 rounded p-3 border border-gray-200">
              <h2 className="text-sm font-bold text-gray-900 leading-tight">{companyName}</h2>
              {/* Full address with city, state, pincode */}
              <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">
                {[
                  companyInfo?.address,
                  [companyInfo?.city, companyInfo?.state, companyInfo?.pincode].filter(Boolean).join(', ')
                ].filter(Boolean).join(' | ')}
              </p>
              {/* Contact info */}
              {(companyInfo?.phone || companyInfo?.email) && (
                <p className="text-[11px] text-gray-600 mt-1">
                  {companyInfo?.phone && <span>Ph: {companyInfo.phone}</span>}
                  {companyInfo?.phone && companyInfo?.email && <span> | </span>}
                  {companyInfo?.email && <span>{companyInfo.email}</span>}
                </p>
              )}
              {/* GST, DL Row */}
              <div className="text-[11px] text-gray-600 mt-2 flex flex-wrap gap-x-4">
                <span><span className="font-semibold text-gray-700">GST:</span> {companyInfo?.gst_number || 'Not configured'}</span>
                <span><span className="font-semibold text-gray-700">DL:</span> {companyInfo?.drug_license_number || 'Not configured'}</span>
              </div>
              {/* FSSAI and MSME Row */}
              {(companyInfo?.fssai_number || companyInfo?.msme_number) && (
                <div className="text-[11px] text-gray-600 mt-1 flex flex-wrap gap-x-4">
                  {companyInfo?.fssai_number && (
                    <span><span className="font-semibold text-gray-700">FSSAI:</span> {companyInfo.fssai_number}</span>
                  )}
                  {companyInfo?.msme_number && (
                    <span><span className="font-semibold text-gray-700">MSME:</span> {companyInfo.msme_number}</span>
                  )}
                </div>
              )}
            </div>

            {/* Customer Info Tile */}
            <div className="bg-gray-50 rounded p-3 border border-gray-200">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Customer Details</div>
              <div className="font-bold text-gray-900 text-sm leading-tight">
                {customerName}
              </div>
              {/* Compact address */}
              {(() => {
                // Build address line — prefer structured data (has state) over plain string
                const addrData = invoice.billing_address_data;
                let addressLine = '';
                if (addrData && (addrData.address_line1 || addrData.city)) {
                  addressLine = [addrData.address_line1, addrData.address_line2, addrData.city, addrData.state, addrData.pincode].filter(Boolean).join(', ');
                } else if (typeof invoice.billing_address === 'string' && invoice.billing_address) {
                  addressLine = invoice.billing_address;
                } else if (invoice.billing_address && typeof invoice.billing_address === 'object') {
                  const addr = invoice.billing_address as any;
                  addressLine = [addr.address_line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
                }
                return addressLine ? <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{addressLine}</p> : null;
              })()}
              <div className="text-[11px] text-gray-600 mt-2 flex flex-wrap gap-x-4">
                {invoice.customer_details?.primary_phone && (
                  <span>Ph. {invoice.customer_details.primary_phone}</span>
                )}
                {invoice.customer_details?.gst_number && (
                  <span><span className="font-semibold text-gray-700">GST:</span> {invoice.customer_details.gst_number}</span>
                )}
              </div>
              {/* Place of Supply — GST compliance requirement */}
              {(() => {
                const posState = invoice.shipping_address_data?.state;
                if (!posState) return null;
                return (
                  <div className="text-[11px] text-gray-600 mt-1">
                    <span className="font-semibold text-gray-700">Place of Supply:</span> {posState}
                    <span className="ml-2 text-[10px] text-gray-500">
                      ({invoice.gst_type === 'IGST'
                        ? 'Inter-State'
                        : invoice.gst_type === 'CGST/SGST'
                          ? 'Intra-State'
                          : 'Tax treatment unavailable'})
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Row 2: Bank+QR | Payment Details | Delivery (optional) */}
        {showAddresses && (() => {
          const hasTransportDetails = invoice.delivery_type && invoice.delivery_type.toUpperCase() !== 'PICKUP' && (invoice.transport_company || invoice.vehicle_number);
          return (
            <div className="mb-4">
              <div className={`grid gap-4 ${hasTransportDetails ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {/* Bank Details + QR - Combined tile */}
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <div className="flex items-start gap-3">
                    {/* Bank Info */}
                    <div className="flex-1">
                      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Bank Details</div>
                      {(() => {
                        const bankAccounts = companyInfo?.bankAccounts;
                        const selectedBank = invoice.bank_account_id && bankAccounts
                          ? bankAccounts.find((acc: any) => acc.id === invoice.bank_account_id)
                          : bankAccounts?.[0];

                        if (selectedBank) {
                          return (
                            <div className="text-[10px] text-gray-600 space-y-0.5">
                              <p className="font-semibold text-gray-900">{selectedBank.bank_name}</p>
                              {selectedBank.account_number && <p>A/C: {selectedBank.account_number}</p>}
                              <p>IFSC: {selectedBank.ifsc_code}</p>
                            </div>
                          );
                        } else {
                          return <p className="text-[10px] text-gray-500 italic">Optional: add a bank account in Settings</p>;
                        }
                      })()}
                    </div>
                    {/* QR Code - scannable size */}
                    <div className="flex flex-col items-center flex-shrink-0 justify-center">
                      {companyInfo?.paymentQR ? (
                        <img src={companyInfo.paymentQR} alt="Payment QR" className="w-[100px] h-auto object-contain" />
                      ) : <p className="text-[8px] text-gray-500 text-center">Payment QR<br />not configured</p>}
                      {companyInfo?.paymentQR && <p className="text-[8px] text-gray-500 mt-0.5">Scan to Pay</p>}
                      {companyInfo?.upiId && (
                        <p className="text-[8px] text-gray-600 font-medium">{companyInfo.upiId}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Payment Details</div>
                  <p className="text-[10px] text-gray-600">
                    Payment status and allocation are available only after posting through the canonical Payments flow.
                  </p>
                </div>

                {/* Delivery/Transport - Only when non-pickup with transport details */}
                {hasTransportDetails && (
                  <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Delivery</div>
                    <div className="space-y-0.5 text-[10px]">
                      {invoice.delivery_type && (
                        <div>
                          <span className="text-gray-500">Mode:</span> <span className="font-medium text-gray-800">{invoice.delivery_type}</span>
                        </div>
                      )}
                      {invoice.transport_company && (
                        <div>
                          <span className="text-gray-500">Transport:</span> <span className="text-gray-700">{invoice.transport_company}</span>
                        </div>
                      )}
                      {invoice.vehicle_number && (
                        <div>
                          <span className="text-gray-500">Vehicle:</span> <span className="text-gray-700">{invoice.vehicle_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Items Table */}
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-auto border-collapse text-[10px]">
            <thead>
              <tr className="border-y-2 border-gray-800">
                <th className="text-center py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '3%' }}>#</th>
                <th className="w-full min-w-52 px-2 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-800">Product</th>
                <th className="text-center py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '7%' }}>Pack</th>
                <th className="text-center py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '6%' }}>HSN</th>
                <th className="text-center py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '6%' }}>Exp</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '8%' }}>MRP</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '5%' }}>Qty</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '5%' }}>Free</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '8%' }}>Rate</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '6%' }}>Disc%</th>
                <th className="text-right py-2 px-1 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '6%' }}>GST%</th>
                <th className="text-right py-2 px-2 font-semibold text-gray-800 uppercase text-[9px] tracking-wider" style={{ width: '10%' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, index) => {
                const discount = item.discount_percent;
                const gstPercent = item.gst_percent;
                const freeQty = item.free_quantity;
                const unitPrice = item.unit_price;
                const lineTotal = item.line_total;

                return (
                  <tr key={index} className="border-b border-gray-200" style={{ lineHeight: '1.2' }}>
                    <td className="py-2 px-1 text-center text-gray-500" style={{ verticalAlign: 'middle' }}>{index + 1}</td>
                    <td className="w-full min-w-52 px-2 py-2" style={{ verticalAlign: 'middle' }}>
                      <span className="break-words font-medium text-gray-900">{item.product_name}</span>
                    </td>
                    <td className="py-2 px-1 text-center text-gray-600" style={{ verticalAlign: 'middle' }}>
                      {item.packages_per_box && item.units_per_pack
                        ? `${item.packages_per_box}*${item.units_per_pack}`
                        : '-'}
                    </td>
                    <td className="py-2 px-1 text-center text-gray-600" style={{ verticalAlign: 'middle' }}>
                      {item.hsn_code || 'Not available'}
                    </td>
                    <td className="py-2 px-1 text-center text-gray-600" style={{ verticalAlign: 'middle' }}>
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', {
                        month: '2-digit',
                        year: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="py-2 px-1 text-right" style={{ verticalAlign: 'middle' }}>
                      {item.mrp == null ? 'Not available' : formatCurrency(item.mrp)}
                    </td>
                    <td className="py-2 px-1 text-right font-medium tabular-nums" style={{ verticalAlign: 'middle' }}>
                      {formatExactDecimal(item.quantity, 'Invoice billed quantity', quantityOptions)}
                    </td>
                    <td className="py-2 px-1 text-right text-green-600 font-medium tabular-nums" style={{ verticalAlign: 'middle' }}>
                      {compareExactDecimals(freeQty, 0, 'Invoice free quantity', quantityOptions) > 0 ? formatExactDecimal(freeQty, 'Invoice free quantity', quantityOptions) : '-'}
                    </td>
                    <td className="py-2 px-1 text-right" style={{ verticalAlign: 'middle' }}>
                      {formatCurrency(unitPrice)}
                    </td>
                    <td className="py-2 px-1 text-right" style={{ verticalAlign: 'middle' }}>
                      {compareExactDecimals(discount, 0, 'Invoice discount percent', quantityOptions) > 0 ? `${formatExactDecimal(discount, 'Invoice discount percent', quantityOptions)}%` : '-'}
                    </td>
                    <td className="py-2 px-1 text-right" style={{ verticalAlign: 'middle' }}>
                      {compareExactDecimals(gstPercent, 0, 'Invoice GST percent', quantityOptions) > 0 ? `${formatExactDecimal(gstPercent, 'Invoice GST percent', quantityOptions)}%` : '-'}
                    </td>
                    <td className="py-2 px-2 text-right font-semibold" style={{ verticalAlign: 'middle' }}>
                      {formatCurrency(lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          {/* Bottom Section - Summary and Notes */}
          <div className="grid grid-cols-2 gap-5 mt-6">
            {/* Left Side - Tax Breakup, Notes, T&C, Signature */}
            <div className="space-y-3">
              {/* Tax Breakup - FIRST (always at top) */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 mb-2">
                  Tax Breakup
                  <span className="ml-2 text-[10px] font-normal text-gray-500">
                    ({invoice.gst_type === 'IGST'
                      ? 'Inter-State · IGST'
                      : invoice.gst_type === 'CGST/SGST'
                        ? 'Intra-State · CGST/SGST'
                        : 'Tax treatment unavailable'})
                  </span>
                </h3>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left pb-1 text-gray-600 font-medium">Rate</th>
                        <th className="text-right pb-1 text-gray-600 font-medium">Taxable</th>
                        {invoice.gst_type === 'IGST' ? (
                          <th className="text-right pb-1 text-gray-600 font-medium">IGST</th>
                        ) : (
                          <>
                            <th className="text-right pb-1 text-gray-600 font-medium">CGST</th>
                            <th className="text-right pb-1 text-gray-600 font-medium">SGST</th>
                          </>
                        )}
                        <th className="text-right pb-1 text-gray-600 font-medium">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group items by GST rate for proper breakup
                        const rateGroups: Record<string, { taxable: string; tax: string; cgst: string; sgst: string }> = {};
                        (invoice.items || []).forEach((item: InvoiceItem) => {
                          const rate = normalizeExactDecimal(item.gst_percent, 'Invoice GST rate', quantityOptions);
                          if (!rateGroups[rate]) rateGroups[rate] = { taxable: '0.00', tax: '0.00', cgst: '0.00', sgst: '0.00' };
                          rateGroups[rate].taxable = addExactDecimals([rateGroups[rate].taxable, item.taxable_amount], 'GST taxable group', moneyOptions);
                          rateGroups[rate].tax = addExactDecimals([rateGroups[rate].tax, item.total_tax_amount], 'GST tax group', moneyOptions);
                          rateGroups[rate].cgst = addExactDecimals([rateGroups[rate].cgst, item.cgst_amount], 'CGST group', moneyOptions);
                          rateGroups[rate].sgst = addExactDecimals([rateGroups[rate].sgst, item.sgst_amount], 'SGST group', moneyOptions);
                        });
                        const rates = Object.keys(rateGroups).sort((a, b) => compareExactDecimals(a, b, 'GST rate order', quantityOptions));
                        return rates.map(rate => (
                          <tr key={rate}>
                            <td className="pt-1 text-gray-700">{formatExactDecimal(rate, 'Invoice GST rate', quantityOptions)}%</td>
                            <td className="pt-1 text-right text-gray-700">{formatCurrency(rateGroups[rate].taxable)}</td>
                            {invoice.gst_type === 'IGST' ? (
                              <td className="pt-1 text-right text-gray-700">{formatCurrency(rateGroups[rate].tax)}</td>
                            ) : (
                              <>
                                <td className="pt-1 text-right text-gray-700">{formatCurrency(rateGroups[rate].cgst)}</td>
                                <td className="pt-1 text-right text-gray-700">{formatCurrency(rateGroups[rate].sgst)}</td>
                              </>
                            )}
                            <td className="pt-1 text-right text-gray-700 font-medium">{formatCurrency(rateGroups[rate].tax)}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Terms & Conditions - In a box below tax */}
              {(companyInfo as any)?.business_settings?.terms_and_conditions && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                    <h3 className="text-[10px] font-semibold text-gray-600 uppercase">Terms & Conditions</h3>
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-gray-600 leading-relaxed whitespace-pre-line">
                      {(companyInfo as any).business_settings.terms_and_conditions}
                    </p>
                  </div>
                </div>
              )}

              {/* Notes - Plain text, no box, below T&C */}
              {invoice.notes && (
                <div>
                  <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Notes</h3>
                  <p className="text-[10px] text-gray-600 leading-relaxed">{invoice.notes}</p>
                </div>
              )}

              {/* Compact Authorization - Single line style */}
              <div className="text-[9px] text-gray-400 pt-1">
                <span>For {companyName}</span>
                <span className="mx-1">•</span>
                <span>Digitally Authorized</span>
                <span className="mx-1">•</span>
                <span>ERP Generated</span>
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
                  {compareExactDecimals(totals.discount_amount, 0, 'Invoice discount', moneyOptions) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Item Discounts:</span>
                      <span className="font-medium text-green-600">-{formatCurrency(totals.discount_amount)}</span>
                    </div>
                  )}
                  {compareExactDecimals(totals.scheme_discount, 0, 'Invoice scheme discount', moneyOptions) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Scheme Discount:</span>
                      <span className="font-medium text-green-600">-{formatCurrency(totals.scheme_discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Taxable Amount:</span>
                    <span className="font-medium">{formatCurrency(totals.taxable_amount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Total GST:</span>
                    <span className="font-medium">{formatCurrency(totals.total_tax_amount)}</span>
                  </div>
                  {compareExactDecimals(totals.freight_charges, 0, 'Invoice freight', moneyOptions) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Delivery Charges:</span>
                      <span className="font-medium">{formatCurrency(totals.freight_charges)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Round Off:</span>
                    <span className="font-medium">
                      {compareExactDecimals(totals.round_off_amount, 0, 'Invoice round off', moneyOptions) >= 0 ? '+' : ''}{formatCurrency(totals.round_off_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-300">
                    <span className="text-sm font-bold text-gray-900">Net Amount:</span>
                    <span className="text-sm font-bold text-blue-600">
                      {formatCurrency(
                        // Use final_amount from calculator (includes all discounts, delivery, etc.)
                        totals.final_amount
                      )}
                    </span>
                  </div>
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
