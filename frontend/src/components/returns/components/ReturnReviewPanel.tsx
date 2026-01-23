/**
 * ReturnReviewPanel Component
 * Clean, professional preview matching invoice preview style
 * Apple/Zerodha-like minimalist design
 */

import React, { useMemo } from 'react';
import { Save, Printer, ArrowLeft } from 'lucide-react';
import useCompanyDetails from '../../../hooks/useCompanyDetails';
import type { ReturnReviewPanelProps } from '../types/return.types';

export const ReturnReviewPanel = React.memo<ReturnReviewPanelProps>(({
    returnData,
    selectedCustomer,
    selectedInvoice,
    customerDues,
    onSave,
    onPrint,
    onBack,
    saving
}) => {
    const { companyDetails } = useCompanyDetails();

    const selectedItems = useMemo(() =>
        returnData.items.filter(item => item.selected && item.return_quantity > 0),
        [returnData.items]
    );

    const formatCurrency = (amount: number) => {
        return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatExpiry = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' });
        } catch {
            return '-';
        }
    };

    // Get customer address as string
    const getCustomerAddress = () => {
        if (!selectedCustomer) return '';
        const c = selectedCustomer as any;

        if (typeof c.address === 'string') return c.address;
        if (c.address?.street) return c.address.street;
        if (c.address?.address_line1) return c.address.address_line1;
        if (typeof c.billing_address === 'string') return c.billing_address;
        if (c.billing_address?.street) return c.billing_address.street;

        // Build from parts
        const parts = [c.address_line1, c.city, c.state, c.pincode].filter(Boolean);
        return parts.join(', ');
    };

    const isGSTCustomer = (selectedCustomer as any)?.gst_number;

    return (
        <div className="max-w-4xl mx-auto">
            {/* Print styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #return-preview, #return-preview * { visibility: visible; }
                    #return-preview {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        padding: 20px;
                    }
                    .no-print { display: none !important; }
                    @page { size: A4 portrait; margin: 15mm; }
                }
            `}</style>

            {/* Action Bar - Outside Preview */}
            <div className="mb-4 flex items-center justify-between no-print">
                <button
                    onClick={onBack}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Edit Return</span>
                </button>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={onPrint}
                        disabled={saving}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
                    >
                        <Printer className="w-4 h-4" />
                        <span>Print</span>
                    </button>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                    >
                        {saving ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Creating...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>Confirm Return</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Clean Preview - Invoice Style */}
            <div id="return-preview" className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="px-6 py-4">
                    {/* Header - 3 Column Grid like Invoice */}
                    <div className="mb-4">
                        <div className="grid grid-cols-3 gap-3 items-stretch">
                            {/* Company Info */}
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div className="flex items-start space-x-2">
                                    <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <span className="text-lg font-bold text-white">
                                            {(companyDetails.company_name || 'A').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-sm font-bold text-gray-900 leading-tight">
                                            {companyDetails.company_name || 'Your Company'}
                                        </h2>
                                        <p className="text-xs text-gray-600 mt-0.5 truncate">
                                            {companyDetails.company_address || ''}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            GST: {companyDetails.company_gst_number || '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Customer Details */}
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer</div>
                                <div className="font-medium text-gray-900 text-sm">
                                    {(selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name}
                                </div>
                                <div className="text-xs text-gray-600 mt-0.5 truncate">
                                    {getCustomerAddress()}
                                </div>
                                {isGSTCustomer && (
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        GST: {(selectedCustomer as any).gst_number}
                                    </div>
                                )}
                            </div>

                            {/* Return Info */}
                            <div className="bg-gray-100 rounded-lg p-3 border border-gray-200">
                                <h1 className="text-sm font-bold text-gray-900 mb-2">
                                    {isGSTCustomer ? 'CREDIT NOTE' : 'SALES RETURN'}
                                </h1>
                                <div className="space-y-1">
                                    <p className="text-xs text-gray-700">
                                        <span className="text-gray-500">No:</span>
                                        <span className="ml-1 font-medium">{returnData.return_no}</span>
                                    </p>
                                    <p className="text-xs text-gray-700">
                                        <span className="text-gray-500">Date:</span>
                                        <span className="ml-1 font-medium">{formatDate(returnData.return_date)}</span>
                                    </p>
                                    <p className="text-xs text-gray-700">
                                        <span className="text-gray-500">Reason:</span>
                                        <span className="ml-1 font-medium">{returnData.return_reason}</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Original Invoice Reference (if any) */}
                    {returnData.invoice_number && (
                        <div className="mb-4 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 border border-gray-100">
                            Against Invoice: <span className="font-medium text-gray-700">{returnData.invoice_number}</span>
                            {selectedInvoice?.invoice_date && (
                                <span className="ml-2">dated {formatDate(selectedInvoice.invoice_date)}</span>
                            )}
                        </div>
                    )}

                    {/* Items Table - Clean like Invoice */}
                    <div className="mb-6">
                        <table className="w-full border border-gray-200">
                            <thead className="bg-gray-100">
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">#</th>
                                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Product</th>
                                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">HSN</th>
                                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Batch</th>
                                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Expiry</th>
                                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Qty</th>
                                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">Rate</th>
                                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-700 uppercase border-r border-gray-200">GST%</th>
                                    <th className="text-right py-2 px-3 text-xs font-semibold text-gray-700 uppercase">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedItems.map((item, index) => {
                                    const qty = parseFloat(String(item.return_quantity || 0));
                                    const rate = parseFloat(String(item.unit_price || 0));
                                    const taxPercent = parseFloat(String(item.tax_percent || 0));
                                    const lineTotal = qty * rate * (1 + taxPercent / 100);

                                    return (
                                        <tr key={index} className="border-b border-gray-200">
                                            <td className="py-2 px-3 text-sm border-r border-gray-200">{index + 1}</td>
                                            <td className="py-2 px-3 border-r border-gray-200">
                                                <div className="text-sm font-medium text-gray-900">{item.product_name}</div>
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                                                {item.hsn_code || '3004'}
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                                                {item.batch_number || '-'}
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                                                {formatExpiry(item.expiry_date)}
                                            </td>
                                            <td className="py-2 px-3 text-sm text-center border-r border-gray-200 font-medium">
                                                {item.return_quantity}
                                                {(item.return_free_qty || 0) > 0 && (
                                                    <div className="text-xs text-gray-500">+{item.return_free_qty} free</div>
                                                )}
                                            </td>
                                            <td className="py-2 px-3 text-sm text-right border-r border-gray-200">
                                                {formatCurrency(rate)}
                                            </td>
                                            <td className="py-2 px-3 text-xs text-center border-r border-gray-200">
                                                {taxPercent > 0 ? `${taxPercent}%` : '-'}
                                            </td>
                                            <td className="py-2 px-3 text-sm text-right font-medium">
                                                {formatCurrency(lineTotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom Section - 2 Column */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Left - Notes & Tax Breakup */}
                        <div className="space-y-4">
                            {returnData.return_reason_notes && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <h3 className="text-xs font-semibold text-gray-700 uppercase mb-1">Notes</h3>
                                    <p className="text-xs text-gray-600">{returnData.return_reason_notes}</p>
                                </div>
                            )}

                            {/* Tax Breakup for GST customers */}
                            {isGSTCustomer && (
                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Tax Summary</h3>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left pb-1 text-gray-500 font-medium">Taxable</th>
                                                <th className="text-right pb-1 text-gray-500 font-medium">CGST</th>
                                                <th className="text-right pb-1 text-gray-500 font-medium">SGST</th>
                                                <th className="text-right pb-1 text-gray-500 font-medium">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="pt-1 text-gray-700">{formatCurrency(returnData.subtotal_amount)}</td>
                                                <td className="pt-1 text-right text-gray-700">{formatCurrency(returnData.tax_amount / 2)}</td>
                                                <td className="pt-1 text-right text-gray-700">{formatCurrency(returnData.tax_amount / 2)}</td>
                                                <td className="pt-1 text-right font-medium text-gray-800">{formatCurrency(returnData.tax_amount)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Authorization */}
                            <div className="border border-gray-200 rounded-lg p-2">
                                <p className="text-xs text-gray-600">For {companyDetails.company_name || 'Your Company'}</p>
                                <p className="text-xs text-gray-400 mt-1">Digitally Authorized</p>
                            </div>
                        </div>

                        {/* Right - Summary */}
                        <div className="flex justify-end">
                            <div className="border border-gray-200 rounded-lg overflow-hidden w-72">
                                <div className="bg-gray-100 px-3 py-2">
                                    <h3 className="text-xs font-bold text-gray-800 uppercase">Return Summary</h3>
                                </div>
                                <div className="p-3 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Subtotal:</span>
                                        <span className="font-medium">{formatCurrency(returnData.subtotal_amount)}</span>
                                    </div>
                                    {returnData.tax_amount > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-600">Tax Amount:</span>
                                            <span className="font-medium">{formatCurrency(returnData.tax_amount)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between pt-2 border-t border-gray-200">
                                        <span className="text-sm font-bold text-gray-900">Credit Amount:</span>
                                        <span className="text-sm font-bold text-blue-600">
                                            {formatCurrency(returnData.total_amount)}
                                        </span>
                                    </div>
                                    {customerDues > 0 && (
                                        <div className="text-xs text-gray-500 pt-1 border-t border-gray-100">
                                            Outstanding Balance: {formatCurrency(customerDues)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-6 pt-4 border-t border-gray-200 text-center">
                        <p className="text-xs text-gray-500">
                            {isGSTCustomer ? 'GST Credit Note' : 'Sales Return'} • {returnData.return_no} • Generated on {new Date().toLocaleDateString('en-IN')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
});

ReturnReviewPanel.displayName = 'ReturnReviewPanel';
