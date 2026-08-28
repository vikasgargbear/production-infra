import React, { useMemo, useState } from 'react';
import { DocumentFooter, NotesSection } from '../../global';
import type { ReturnReviewPanelProps } from '../types/return.types';
import {
    authoritativeReturnQuantity,
    authoritativeReturnRate,
    formatReturnMoney,
    hasExactReturnPreview,
} from '../utils/returnDecimal';

const unavailable = (value: unknown): boolean => (
    value === '' || value === null || value === undefined
);

const displayQuantity = (value: unknown, label: string): string => {
    if (unavailable(value)) return 'Unavailable';
    try { return authoritativeReturnQuantity(value, label); }
    catch { return 'Invalid quantity'; }
};

const displayRate = (value: unknown, label: string): string => {
    if (unavailable(value)) return 'Unavailable';
    try { return formatReturnMoney(authoritativeReturnRate(value, label), label); }
    catch { return 'Invalid rate'; }
};

export const ReturnReviewPanel = React.memo<ReturnReviewPanelProps>(({
    returnData,
    selectedCustomer,
    onSave,
    onBack,
    saving,
    submissionUnavailableReason,
    preparedPreview,
}) => {
    const [notes, setNotes] = useState(returnData.return_reason_notes ?? '');
    const selectedItems = useMemo(
        () => returnData.items.filter(item => item.selected),
        [returnData.items],
    );
    const hasMonetaryPreview = hasExactReturnPreview(returnData.items, returnData);

    const displayLineAmount = (item: Record<string, unknown>, index: number): string => {
        if (!hasMonetaryPreview) return 'Pending backend preview';
        const amount = item.total_amount ?? item.line_total;
        if (unavailable(amount)) return 'Unavailable';
        try { return formatReturnMoney(amount, `Sales return lines[${index}].total_amount`); }
        catch { return 'Invalid amount'; }
    };

    const displayTotal = (): string => {
        if (!hasMonetaryPreview) return 'Pending backend preview';
        try { return formatReturnMoney(returnData.total_amount, 'Sales return total'); }
        catch { return 'Invalid amount'; }
    };

    const handleSave = () => {
        returnData.return_reason_notes = notes;
        onSave?.();
    };

    return (
        <div className="flex h-full flex-col bg-gray-50">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-6xl space-y-5">
                    <section className="border border-gray-200 bg-white p-6" aria-labelledby="sales-return-review-heading">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h2 id="sales-return-review-heading" className="text-lg font-semibold text-gray-900">
                                    Canonical sales-return review
                                </h2>
                                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                                    This review preserves the posted invoice, dispatch allocation, batch, billed/free quantity and quarantine lineage. Monetary and GST values appear only when an authoritative preview supplies them.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onBack}
                                disabled={Boolean(preparedPreview)}
                                className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Back to details
                            </button>
                        </div>

                        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                            <div><dt className="text-gray-500">Customer</dt><dd className="font-medium">{(selectedCustomer as any)?.customer_name ?? (selectedCustomer as any)?.name ?? 'Unavailable'}</dd></div>
                            <div><dt className="text-gray-500">Invoice</dt><dd className="font-medium">{returnData.invoice_number || 'Unavailable'}</dd></div>
                            <div><dt className="text-gray-500">Return date</dt><dd className="font-medium">{returnData.return_date || 'Unavailable'}</dd></div>
                            <div><dt className="text-gray-500">Reason</dt><dd className="font-medium">{returnData.return_reason || 'Unavailable'}</dd></div>
                            <div><dt className="text-gray-500">GST treatment</dt><dd className="font-medium">{returnData.gst_tax_treatment || 'Unavailable'}</dd></div>
                        </dl>

                        <div className="mt-5 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200 text-left text-gray-600">
                                        <th className="p-2">Product</th>
                                        <th className="p-2">HSN</th>
                                        <th className="p-2">Batch</th>
                                        <th className="p-2">Billed</th>
                                        <th className="p-2">Free</th>
                                        <th className="p-2">Rate</th>
                                        <th className="p-2">Tax</th>
                                        <th className="p-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedItems.map((item, index) => (
                                        <tr key={String(item.id ?? item.invoice_item_id ?? index)} className="border-b border-gray-100">
                                            <td className="p-2 font-medium">{item.product_name || 'Unavailable'}</td>
                                            <td className="p-2">{item.hsn_code || 'Unavailable'}</td>
                                            <td className="p-2">{item.batch_number || 'Unavailable'}</td>
                                            <td className="p-2">{displayQuantity(item.return_paid_qty, `Sales return lines[${index}].billed_quantity`)}</td>
                                            <td className="p-2">{displayQuantity(item.return_free_qty, `Sales return lines[${index}].free_quantity`)}</td>
                                            <td className="p-2">{displayRate(item.unit_price, `Sales return lines[${index}].unit_rate`)}</td>
                                            <td className="p-2">{displayQuantity(item.tax_percent, `Sales return lines[${index}].tax_rate`)}{unavailable(item.tax_percent) ? '' : '%'}</td>
                                            <td className="p-2 text-right">{displayLineAmount(item, index)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-5 flex justify-end border-t border-gray-200 pt-4 text-sm">
                            <span className="text-gray-600">Authoritative total: <strong className="text-gray-900">{displayTotal()}</strong></span>
                        </div>
                    </section>

                    <section className="border border-gray-200 bg-white p-6">
                        <NotesSection
                            value={notes}
                            onChange={setNotes}
                            placeholder="Add return notes..."
                            rows={4}
                        />
                    </section>

                    {preparedPreview && (
                        <section role="status" className="border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950">
                            <p className="font-semibold">Immutable canonical preview prepared</p>
                            <p className="mt-1 break-all">Command: {preparedPreview.command_request_id}</p>
                            <p className="mt-1 break-all">Preview hash: {preparedPreview.preview_hash}</p>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <pre className="overflow-auto border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.inventory_impact ?? [], null, 2)}</pre>
                                <pre className="overflow-auto border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.financial_impact ?? [], null, 2)}</pre>
                                <pre className="overflow-auto border border-blue-200 bg-white p-2 text-xs">{JSON.stringify(preparedPreview.tax_impact ?? [], null, 2)}</pre>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {submissionUnavailableReason && (
                <div className="border-t border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
                    {submissionUnavailableReason}
                </div>
            )}
            <DocumentFooter
                totalItems={selectedItems.length}
                additionalInfo={<>Monetary impact: <strong>{displayTotal()}</strong></>}
                onSave={onSave ? handleSave : undefined}
                isSaving={saving}
                saveDisabled={Boolean(preparedPreview) || Boolean(submissionUnavailableReason)}
                saveLabel={preparedPreview ? 'Awaiting independent approval' : 'Prepare Immutable Return'}
                showActionButtons
                showPrintOptions={false}
                showSaveOption
            />
        </div>
    );
});

ReturnReviewPanel.displayName = 'ReturnReviewPanel';
