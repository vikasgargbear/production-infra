import React from 'react';
import { FileText, Building2, Phone, Mail, Truck } from 'lucide-react';
import useCompanyDetails from '../../../hooks/useCompanyDetails';
import { determineGstType } from '../../gst/utils/gstCalculations';
import { addExactDecimals, exactDecimalUnits } from '../../../utils/exactDecimal';
import {
  authoritativeReturnMoney,
  authoritativeReturnQuantity,
  authoritativeReturnRate,
  formatReturnMoney,
  positiveReturnQuantity,
  RETURN_MONEY_OPTIONS,
} from '../utils/returnDecimal';
import { formatCanonicalReasonCode } from '../utils/canonicalReturnCommand';

interface ReturnItem {
  id?: string | number;
  selected?: boolean;
  return_quantity: number | string;
  return_paid_qty?: number | string;
  return_free_qty?: number | string;
  product_name: string;
  hsn_code?: string;
  batch_number?: string;
  expiry_date?: string;
  expiry?: string;
  unit_price: number | string;
  discount_percent?: number | string;
  tax_percent?: number | string;
  discount_amount?: number | string;
  taxable_amount?: number | string;
  cgst_amount?: number | string;
  sgst_amount?: number | string;
  igst_amount?: number | string;
  tax_amount?: number | string;
  total_amount?: number | string;
}

interface Supplier {
  supplier_name?: string;
  gst_number?: string;
  drug_license_number?: string;
  phone?: string;
  email?: string;
}

interface Purchase {
  invoice_number?: string;
  invoice_date?: string;
}

interface TransportDetails {
  transport_mode?: string;
  vehicle_no?: string;
  transporter_name?: string;
  lr_no?: string;
}

interface ReturnData {
  debit_note_no?: string;
  return_no?: string;
  return_date: string;
  return_reason: string;
  return_reason_notes?: string;
  items: ReturnItem[];
  transport_details: TransportDetails;
  subtotal_amount: string;
  tax_amount: string;
  total_amount: string;
}

interface DebitNotePreviewProps {
  returnData: ReturnData;
  supplier?: Supplier;
  purchase?: Purchase;
}

const DebitNotePreview: React.FC<DebitNotePreviewProps> = ({ returnData, supplier = {}, purchase = {} }) => {
  const { companyDetails, loading: companyLoading, error: companyError } = useCompanyDetails();

  if (companyLoading) {
    return <div className="border border-gray-200 bg-white p-6 text-sm text-gray-600">Loading company details…</div>;
  }

  if (companyError || !companyDetails) {
    return (
      <div role="alert" className="border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Company details are unavailable. Refresh the page before generating this debit note.
      </div>
    );
  }

  // Add safety checks for required data
  if (!supplier || !purchase || !returnData) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Loading return information...</p>
      </div>
    );
  }

  const formatDate = (date: string | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get only selected items with return quantity
  const returnItems = returnData.items.filter(item => {
    if (!item.selected) return false;
    try {
      return exactDecimalUnits(item.return_quantity, 'Return quantity', { scale: 6, maximumWholeDigits: 14 }) > 0n;
    } catch { return false; }
  });

  // Determine GST type using GSTIN state codes
  const gstType = determineGstType(
    companyDetails?.company_state,
    undefined,
    companyDetails?.company_gst_number,
    supplier?.gst_number
  );
  const isIGST = gstType === 'IGST';

  // Calculate GST breakup
  const calculateGSTBreakup = () => {
    const gstBreakup: Record<string, { taxableAmount: string; cgst: string; sgst: string; igst: string; totalTax: string }> = {};

    returnItems.forEach((item, index) => {
      const label = `Purchase return review lines[${index}]`;
      const taxPercent = authoritativeReturnRate(item.tax_percent, `${label}.tax_percent`);

      if (!gstBreakup[taxPercent]) {
        gstBreakup[taxPercent] = {
          taxableAmount: '0.00',
          cgst: '0.00',
          sgst: '0.00',
          igst: '0.00',
          totalTax: '0.00',
        };
      }

      gstBreakup[taxPercent].taxableAmount = addExactDecimals(
        [gstBreakup[taxPercent].taxableAmount, authoritativeReturnMoney(item.taxable_amount, `${label}.taxable_amount`)],
        `${label}.taxable aggregate`,
        RETURN_MONEY_OPTIONS,
      );
      if (isIGST) {
        gstBreakup[taxPercent].igst = addExactDecimals(
          [gstBreakup[taxPercent].igst, authoritativeReturnMoney(item.igst_amount ?? item.tax_amount, `${label}.igst_amount`)],
          `${label}.igst aggregate`,
          RETURN_MONEY_OPTIONS,
        );
      } else {
        gstBreakup[taxPercent].cgst = addExactDecimals(
          [gstBreakup[taxPercent].cgst, authoritativeReturnMoney(item.cgst_amount, `${label}.cgst_amount`)],
          `${label}.cgst aggregate`,
          RETURN_MONEY_OPTIONS,
        );
        gstBreakup[taxPercent].sgst = addExactDecimals(
          [gstBreakup[taxPercent].sgst, authoritativeReturnMoney(item.sgst_amount, `${label}.sgst_amount`)],
          `${label}.sgst aggregate`,
          RETURN_MONEY_OPTIONS,
        );
      }
      gstBreakup[taxPercent].totalTax = addExactDecimals(
        [gstBreakup[taxPercent].totalTax, authoritativeReturnMoney(item.tax_amount, `${label}.tax_amount`)],
        `${label}.tax aggregate`,
        RETURN_MONEY_OPTIONS,
      );
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
            <div className="flex items-start gap-4">
              {/* Company Logo */}
              {companyDetails.company_logo ? (
                <img
                  src={companyDetails.company_logo}
                  alt="Company Logo"
                  className="h-16 w-16 object-contain"
                />
              ) : (
                <div className="w-16 h-16 bg-orange-100 rounded flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-bold text-orange-700">
                    {(companyDetails.company_name || 'A').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Company Details - Compact */}
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                  {companyDetails.company_name}
                </h2>
                <div className="text-xs text-gray-600 space-y-0.5">
                  <p>{companyDetails.company_address}</p>
                  <div className="flex gap-4">
                    <span>GST: {companyDetails.company_gst_number}</span>
                    <span>DL: {companyDetails.company_drug_license}</span>
                    <span>Ph: {companyDetails.company_phone}</span>
                  </div>
                  {companyDetails.company_email && (
                    <p>Email: {companyDetails.company_email}</p>
                  )}
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
                  {formatCanonicalReasonCode(returnData.return_reason)}
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
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Billed</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Free</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Cost</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">GST%</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, index) => {
                  const label = `Purchase return review lines[${index}]`;
                  const price = authoritativeReturnRate(item.unit_price, `${label}.unit_price`);
                  const billed = authoritativeReturnQuantity(
                    item.return_paid_qty,
                    `${label}.billed_quantity`,
                  );
                  const free = authoritativeReturnQuantity(
                    item.return_free_qty,
                    `${label}.free_quantity`,
                  );
                  const taxPercent = authoritativeReturnRate(item.tax_percent, `${label}.tax_percent`);
                  const totalAmount = authoritativeReturnMoney(item.total_amount, `${label}.total_amount`);

                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 px-2 text-sm">{index + 1}</td>
                      <td className="py-3 px-2 text-sm font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-sm">{item.hsn_code || '-'}</td>
                      <td className="py-3 px-2 text-sm">{item.batch_number || '-'}</td>
                      <td className="py-3 px-2 text-sm">
                        {item.expiry_date || item.expiry ? formatDate(item.expiry_date || item.expiry) : '-'}
                      </td>
                      <td className="py-3 px-2 text-sm text-center">{billed}</td>
                      <td className="py-3 px-2 text-sm text-center">{positiveReturnQuantity(free, `${label}.free_quantity`) ? free : '-'}</td>
                      <td className="py-3 px-2 text-sm text-right">₹{price}</td>
                      <td className="py-3 px-2 text-sm text-center">{taxPercent}%</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">{formatReturnMoney(totalAmount, `${label}.total_amount`)}</td>
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
                    {isIGST ? (
                      <th className="text-right py-2">IGST</th>
                    ) : (
                      <>
                        <th className="text-right py-2">CGST</th>
                        <th className="text-right py-2">SGST</th>
                      </>
                    )}
                    <th className="text-right py-2">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(gstBreakup).map(([rate, values]) => (
                    <tr key={rate} className="border-b border-gray-100">
                      <td className="py-2">{rate}%</td>
                      <td className="text-right py-2">{formatReturnMoney(values.taxableAmount, `Taxable amount at ${rate}%`)}</td>
                      {isIGST ? (
                        <td className="text-right py-2">{formatReturnMoney(values.igst, `IGST at ${rate}%`)}</td>
                      ) : (
                        <>
                          <td className="text-right py-2">{formatReturnMoney(values.cgst, `CGST at ${rate}%`)}</td>
                          <td className="text-right py-2">{formatReturnMoney(values.sgst, `SGST at ${rate}%`)}</td>
                        </>
                      )}
                      <td className="text-right py-2 font-medium">{formatReturnMoney(values.totalTax, `Tax at ${rate}%`)}</td>
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
                  <span className="font-medium">{formatReturnMoney(returnData.subtotal_amount, 'Purchase return subtotal')}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Tax Amount</span>
                  <span className="font-medium">{formatReturnMoney(returnData.tax_amount, 'Purchase return tax')}</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-300">
                  <span className="font-semibold text-lg">Total Debit Amount</span>
                  <span className="font-bold text-lg text-orange-600">{formatReturnMoney(returnData.total_amount, 'Purchase return total')}</span>
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

export default DebitNotePreview;
