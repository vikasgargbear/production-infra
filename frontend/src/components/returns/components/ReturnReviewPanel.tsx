/**
 * ReturnReviewPanel Component
 * Clean, professional preview matching invoice preview style
 * Uses global ModuleHeader and DocumentFooter components
 */

import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useCompany } from '../../../contexts/CompanyContext';
import { ModuleHeader, DocumentFooter } from '../../global';
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
    // Use same company context as Invoice for consistency
    const { companyInfo } = useCompany();
    const [notes, setNotes] = useState(returnData.return_reason_notes || '');

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

    // Handle save with notes
    const handleSave = () => {
        // Update returnData with notes before save
        returnData.return_reason_notes = notes;
        onSave();
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
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

            {/* Main Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="max-w-6xl mx-auto">
                    {/* Clean Preview - Invoice Style */}
                    <div id="return-preview" className="bg-white rounded-lg border border-gray-200 shadow-sm">
                        <div className="px-6 py-4">
                            {/* Header - 3 Column Grid like Invoice */}
                            <div className="mb-4">
                                <div className="grid grid-cols-3 gap-3 items-stretch">
                                    {/* Company Info - Using same pattern as Invoice */}
                                    <div className="bg-gradient-to-br from-blue-50 to-gray-50 rounded-xl p-3 border border-blue-200">
                                        <div className="flex items-start space-x-2">
                                            {companyInfo?.logo ? (
                                                <img
                                                    src={companyInfo?.logo}
                                                    alt={companyInfo?.name || 'Company'}
                                                    className="w-12 h-12 object-contain rounded-lg flex-shrink-0"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    <span className="text-xl font-bold text-white">
                                                        {(companyInfo?.name || 'A').charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h2 className="text-base font-bold text-gray-900 leading-tight">
                                                    {companyInfo?.name || 'Your Company'}
                                                </h2>
                                                <p className="text-xs text-gray-600 mt-0.5 truncate">
                                                    {companyInfo?.address || ''}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-0.5">
                                                    <span className="font-medium">GST:</span> {companyInfo?.gst || '-'}
                                                    <span className="mx-1">|</span>
                                                    <span className="font-medium">DL:</span> {companyInfo?.drugLicense || '-'}
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
                                        {(selectedCustomer as any)?.drug_license_number && (
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                DL: {(selectedCustomer as any).drug_license_number}
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

                            {/* Credit Note Banner - Highlight what will be generated */}
                            {returnData.return_type === 'credit_note' && isGSTCustomer && (
                                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                            <span className="text-blue-600 font-bold">₹</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-blue-900">
                                                Credit Note will be generated
                                            </p>
                                            <p className="text-xs text-blue-600">
                                                {returnData.credit_adjustment_type === 'existing_dues'
                                                    ? 'Will be adjusted against outstanding dues'
                                                    : 'Will be available for future purchases'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xl font-bold text-blue-700">
                                            {formatCurrency(returnData.total_amount)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* No Financial Adjustment Banner */}
                            {returnData.return_type === 'no_adjustment' && (
                                <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-gray-700">
                                        📦 Return Only — No credit note or refund will be issued
                                    </p>
                                </div>
                            )}

                            {/* Replacement Banner */}
                            {returnData.return_type === 'replacement' && (
                                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-green-700">
                                        🔄 Replacement will be issued for returned items
                                    </p>
                                </div>
                            )}

                            {/* Refund Banner */}
                            {returnData.return_type === 'refund' && (
                                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-lg p-3 flex items-center justify-between">
                                    <p className="text-sm font-medium text-purple-700">
                                        💰 Cash/Bank Refund to be issued
                                    </p>
                                    <span className="text-lg font-bold text-purple-700">
                                        {formatCurrency(returnData.total_amount)}
                                    </span>
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
                                                        <div className="text-[10px] text-gray-500">
                                                            {item.pack_size && `Pack: ${item.pack_size}`}
                                                            {item.uom && ` | ${item.uom}`}
                                                        </div>
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
                                        <p className="text-xs text-gray-600">For {companyInfo?.name || 'Your Company'}</p>
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

                            {/* Footer inside preview */}
                            <div className="mt-6 pt-4 border-t border-gray-200 text-center">
                                <p className="text-xs text-gray-500">
                                    {isGSTCustomer ? 'GST Credit Note' : 'Sales Return'} • {returnData.return_no} • Generated on {new Date().toLocaleDateString('en-IN')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Notes Section - Like Invoice Preview */}
                    <div className="w-full mt-4 mb-4">
                        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                            <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
                                <h3 className="text-xs font-bold text-gray-800 uppercase">Return Notes</h3>
                            </div>
                            <div className="p-3">
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    rows={2}
                                    placeholder="Add any additional notes for this return..."
                                />
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-xs text-gray-500">These notes will appear on the printed document</span>
                                    <span className="text-xs text-gray-400">{notes.length}/500</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer - Using Global DocumentFooter */}
            <DocumentFooter
                totalItems={selectedItems.length}
                grandTotal={returnData.total_amount}
                subtotalAmount={returnData.subtotal_amount}
                taxAmount={returnData.tax_amount}
                onPrint={onPrint}
                onSave={handleSave}
                isSaving={saving}
                saveLabel="Confirm Return"
                showActionButtons={true}
                showPrintOptions={true}
                showSaveOption={true}
            />
        </div>
    );
});

ReturnReviewPanel.displayName = 'ReturnReviewPanel';
