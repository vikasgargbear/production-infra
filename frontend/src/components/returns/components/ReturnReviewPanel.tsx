/**
 * ReturnReviewPanel Component
 * Clean, professional preview matching invoice preview style
 * Uses global ModuleHeader and DocumentFooter components
 */

import React, { useMemo, useState } from 'react';
import {
    addExactDecimals,
    compareExactDecimals,
    exactDecimalUnits,
} from '../../../utils/exactDecimal';
import { useCompany } from '../../../contexts/CompanyContext';
import { DocumentFooter } from '../../global';
import type { ReturnReviewPanelProps } from '../types/return.types';
import {
    authoritativeReturnMoney,
    authoritativeReturnQuantity,
    authoritativeReturnRate,
    formatReturnMoney,
    positiveReturnMoney,
    positiveReturnQuantity,
    positiveReturnRate,
    RETURN_MONEY_OPTIONS,
    RETURN_RATE_OPTIONS,
} from '../utils/returnDecimal';
import { formatCanonicalReasonCode } from '../utils/canonicalReturnCommand';

export const ReturnReviewPanel = React.memo<ReturnReviewPanelProps>(({
    returnData,
    selectedCustomer,
    selectedInvoice,
    customerDues,
    onSave,
    onPrint,
    onBack,
    saving,
    submissionUnavailableReason,
    preparedPreview
}) => {
    // Use same company context as Invoice for consistency
    const { companyInfo } = useCompany();
    const [notes, setNotes] = useState(returnData.return_reason_notes || '');

    const selectedItems = useMemo(() =>
        returnData.items.filter(item => {
            if (!item.selected) return false;
            try {
                return exactDecimalUnits(item.return_quantity, 'Return quantity', { scale: 6, maximumWholeDigits: 14 }) > 0n;
            } catch { return false; }
        }),
        [returnData.items]
    );

    const formatCurrency = (amount: unknown, label = 'Return amount') => {
        try { return formatReturnMoney(amount, label); }
        catch { return 'Invalid amount'; }
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

    // Build dynamic tax breakup grouped by rate
    const taxBreakup = useMemo(() => {
        const rateMap: Record<string, { taxable: string; cgst: string; sgst: string; igst: string }> = {};
        selectedItems.forEach((item, index) => {
            const label = `Sales return review lines[${index}]`;
            const taxPercent = authoritativeReturnRate(item.tax_percent, `${label}.tax_percent`);
            if (
                !positiveReturnRate(taxPercent, `${label}.tax_percent`)
                || !positiveReturnQuantity((item as any).taxable_quantity, `${label}.taxable_quantity`)
            ) return;

            const current = rateMap[taxPercent] || {
                taxable: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00',
            };
            rateMap[taxPercent] = {
                taxable: addExactDecimals(
                    [current.taxable, authoritativeReturnMoney((item as any).taxable_amount, `${label}.taxable_amount`)],
                    `${label}.taxable aggregate`,
                    RETURN_MONEY_OPTIONS,
                ),
                cgst: addExactDecimals(
                    [current.cgst, authoritativeReturnMoney((item as any).cgst_amount, `${label}.cgst_amount`)],
                    `${label}.cgst aggregate`,
                    RETURN_MONEY_OPTIONS,
                ),
                sgst: addExactDecimals(
                    [current.sgst, authoritativeReturnMoney((item as any).sgst_amount, `${label}.sgst_amount`)],
                    `${label}.sgst aggregate`,
                    RETURN_MONEY_OPTIONS,
                ),
                igst: addExactDecimals(
                    [current.igst, authoritativeReturnMoney((item as any).igst_amount, `${label}.igst_amount`)],
                    `${label}.igst aggregate`,
                    RETURN_MONEY_OPTIONS,
                ),
            };
        });
        return Object.entries(rateMap)
            .sort(([left], [right]) => compareExactDecimals(
                left,
                right,
                'Sales return tax-rate order',
                RETURN_RATE_OPTIONS,
            ))
            .map(([rate, values]) => ({ rate, ...values }));
    }, [selectedItems]);

    // Handle save with notes
    const handleSave = () => {
        if (!onSave) return;
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
                    {/* Clean Preview - matches full container width */}
                    <div id="return-preview" className="bg-white shadow-2xl my-6 p-8 border border-gray-200">
                        <div>
                            {/* Header Section - Match Invoice: Logo Left | Title + Credit Note Right */}
                            <div className="mb-5">
                                {/* Logo Left | Title + Meta Right */}
                                <div className="flex items-center justify-between border-b-2 border-gray-800 pb-3 mb-4">
                                    {/* Logo */}
                                    <div className="flex items-center">
                                        {companyInfo?.logo ? (
                                            <img src={companyInfo.logo} alt="Company Logo" className="h-20 w-auto object-contain" />
                                        ) : (
                                            <div className="w-16 h-16 bg-gray-800 rounded flex items-center justify-center">
                                                <span className="text-2xl font-bold text-white">{(companyInfo?.name || 'A').charAt(0).toUpperCase()}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Title + Details - Right aligned, stacked */}
                                    <div className="text-right">
                                        <h1 className="text-xl font-bold text-gray-900 uppercase tracking-wide">
                                            {isGSTCustomer ? 'CREDIT NOTE' : 'SALES RETURN'}
                                        </h1>
                                        <div className="text-xs mt-1.5 space-y-0.5">
                                            <div>
                                                <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">
                                                    {isGSTCustomer ? 'Credit Note No: ' : 'Return No: '}
                                                </span>
                                                <span className="font-bold text-gray-900">{returnData.credit_note_no || returnData.return_no}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Date: </span>
                                                <span className="font-bold text-gray-900">{formatDate(returnData.return_date)}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Reason: </span>
                                                <span className="font-bold text-gray-900">{formatCanonicalReasonCode(returnData.return_reason)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Company & Customer Info - 2 Column Grid (like Invoice) */}
                                <div className="grid grid-cols-2 gap-4">
                                    {/* Company Info Tile */}
                                    <div className="bg-gray-50 rounded p-3 border border-gray-200">
                                        <h2 className="text-sm font-bold text-gray-900 leading-tight">{companyInfo?.name || 'Your Company'}</h2>
                                        <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{companyInfo?.address || ''}</p>
                                        {(companyInfo?.phone || companyInfo?.email) && (
                                            <p className="text-[11px] text-gray-600 mt-1">
                                                {companyInfo?.phone && <span>Ph: {companyInfo.phone}</span>}
                                                {companyInfo?.phone && companyInfo?.email && <span> | </span>}
                                                {companyInfo?.email && <span>{companyInfo.email}</span>}
                                            </p>
                                        )}
                                        <div className="text-[11px] text-gray-600 mt-2 flex flex-wrap gap-x-4">
                                            <span><span className="font-semibold text-gray-700">GST:</span> {companyInfo?.gst_number || '-'}</span>
                                            <span><span className="font-semibold text-gray-700">DL:</span> {companyInfo?.drug_license_number || '-'}</span>
                                        </div>
                                    </div>

                                    {/* Customer Info Tile */}
                                    <div className="bg-gray-50 rounded p-3 border border-gray-200">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Customer Details</div>
                                        <div className="font-bold text-gray-900 text-sm leading-tight">
                                            {(selectedCustomer as any)?.customer_name || (selectedCustomer as any)?.name}
                                        </div>
                                        <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{getCustomerAddress()}</p>
                                        <div className="text-[11px] text-gray-600 mt-2 flex flex-wrap gap-x-4">
                                            {(selectedCustomer as any)?.primary_phone && (
                                                <span>Ph. {(selectedCustomer as any).primary_phone}</span>
                                            )}
                                            {isGSTCustomer && (
                                                <span><span className="font-semibold text-gray-700">GST:</span> {(selectedCustomer as any).gst_number}</span>
                                            )}
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

                            {/* Items Table - Compact columns, no Batch */}
                            <div className="mb-6">
                                <table className="w-full border border-gray-200 text-[10px]">
                                    <thead className="bg-gray-100">
                                        <tr className="border-b border-gray-200">
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '3%' }}>#</th>
                                            <th className="text-left py-1.5 px-2 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '30%' }}>Product</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '8%' }}>Pack</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '7%' }}>HSN</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '7%' }}>Exp</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>Qty</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '6%' }}>Free</th>
                                            <th className="text-right py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '10%' }}>Rate</th>
                                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-700 uppercase border-r border-gray-200" style={{ width: '7%' }}>GST%</th>
                                            <th className="text-right py-1.5 px-2 font-semibold text-gray-700 uppercase" style={{ width: '12%' }}>Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedItems.map((item, index) => {
                                            const label = `Sales return review lines[${index}]`;
                                            const freeQty = authoritativeReturnQuantity(
                                                item.return_free_qty ?? '0',
                                                `${label}.free_quantity`,
                                            );
                                            const rate = authoritativeReturnRate(
                                                item.unit_price,
                                                `${label}.unit_price`,
                                            );
                                            const taxPercent = authoritativeReturnRate(
                                                item.tax_percent,
                                                `${label}.tax_percent`,
                                            );
                                            const lineTotal = authoritativeReturnMoney(
                                                (item as any).total_amount,
                                                `${label}.total_amount`,
                                            );

                                            return (
                                                <tr key={index} className="border-b border-gray-200">
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200">{index + 1}</td>
                                                    <td className="py-1.5 px-2 border-r border-gray-200">
                                                        <div className="font-medium text-gray-900">{item.product_name}</div>
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200 text-gray-600">
                                                        {item.pack_size || '-'}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200">
                                                        {item.hsn_code || '3004'}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200">
                                                        {formatExpiry(item.expiry_date)}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200 font-medium">
                                                        {item.return_paid_qty ?? item.return_quantity}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200 text-green-600 font-medium">
                                                        {positiveReturnQuantity(freeQty, `${label}.free_quantity`) ? freeQty : '-'}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-right border-r border-gray-200">
                                                        ₹{rate}
                                                    </td>
                                                    <td className="py-1.5 px-1.5 text-center border-r border-gray-200">
                                                        {positiveReturnRate(taxPercent, `${label}.tax_percent`) ? `${taxPercent}%` : '-'}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right font-semibold">
                                                        {formatCurrency(lineTotal, `${label}.total_amount`)}
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
                                    {isGSTCustomer && taxBreakup.length > 0 && (
                                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Tax Breakup</h3>
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
                                                    {taxBreakup.map((row, idx) => (
                                                        <tr key={idx}>
                                                            <td className="pt-1 text-gray-700">{row.rate}%</td>
                                                            <td className="pt-1 text-right text-gray-700">{formatCurrency(row.taxable, `Taxable amount at ${row.rate}%`)}</td>
                                                            <td className="pt-1 text-right text-gray-700">{positiveReturnMoney(row.cgst, 'CGST amount') ? formatCurrency(row.cgst, 'CGST amount') : '-'}</td>
                                                            <td className="pt-1 text-right text-gray-700">{positiveReturnMoney(row.sgst, 'SGST amount') ? formatCurrency(row.sgst, 'SGST amount') : '-'}</td>
                                                            <td className="pt-1 text-right text-gray-700">{positiveReturnMoney(row.igst, 'IGST amount') ? formatCurrency(row.igst, 'IGST amount') : '-'}</td>
                                                        </tr>
                                                    ))}
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
                                            {positiveReturnMoney(returnData.tax_amount, 'Sales return tax amount') && (
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
                                            {positiveReturnMoney(customerDues, 'Customer outstanding balance') && (
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
                    {preparedPreview && (
                        <div role="status" className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950">
                            <p className="font-semibold">Immutable canonical preview prepared</p>
                            <p className="mt-1 break-all">Command: {preparedPreview.command_request_id}</p>
                            <p className="mt-1 break-all">Preview hash: {preparedPreview.preview_hash}</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.inventory_impact || [], null, 2)}</pre>
                                <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.financial_impact || [], null, 2)}</pre>
                                <pre className="overflow-auto rounded border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.tax_impact || [], null, 2)}</pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Using Global DocumentFooter */}
            {submissionUnavailableReason && (
                <div className="border-t border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
                    {submissionUnavailableReason}
                </div>
            )}
            <DocumentFooter
                totalItems={selectedItems.length}
                additionalInfo={(
                    <>
                        Sub Total: <strong>{formatCurrency(returnData.subtotal_amount, 'Sales return subtotal')}</strong>
                        {' · '}Tax: <strong>{formatCurrency(returnData.tax_amount, 'Sales return tax')}</strong>
                        {' · '}Total: <strong>{formatCurrency(returnData.total_amount, 'Sales return total')}</strong>
                    </>
                )}
                onSave={onSave ? handleSave : undefined}
                isSaving={saving}
                saveLabel="Confirm Return"
                showActionButtons={true}
                showPrintOptions={false}
                showSaveOption={true}
            />
        </div>
    );
});

ReturnReviewPanel.displayName = 'ReturnReviewPanel';
