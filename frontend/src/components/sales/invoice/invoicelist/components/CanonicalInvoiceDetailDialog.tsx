import React, { useMemo } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { CanonicalInvoiceDetail } from '../../../../../services/api/modules/sales/canonicalSalesDocuments.types';
import {
    addExactDecimals,
    compareExactDecimals,
    exactDecimalString,
    exactDecimalUnits,
    formatExactCurrency,
    formatExactDecimal,
    normalizeAuthoritativeDecimal,
} from '../../../../../utils/exactDecimal';
import { formatCalendarDate } from '../../../../../utils/calendarDate';
import type { Invoice } from '../types/invoicelist.types';

interface CanonicalInvoiceDetailDialogProps {
    document: Invoice;
    detail: CanonicalInvoiceDetail | null;
    loading: boolean;
    error: string | null;
    onClose: () => void;
    onRetry: () => void;
    onPrint: () => void;
    onDownload: () => void;
}

const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;
const quantityOptions = { scale: 6, maximumWholeDigits: 20, allowNegative: false } as const;
const rateOptions = { scale: 4, maximumWholeDigits: 20, allowNegative: false } as const;

const displayDate = (value: string | null): string => {
    if (!value) return 'Not specified';
    try {
        return formatCalendarDate(value);
    } catch {
        return value;
    }
};

const displayQuantity = (value: unknown, label: string): string => {
    const units = exactDecimalUnits(value, label, quantityOptions);
    const hundredths = units / 10000n + (units % 10000n >= 5000n ? 1n : 0n);
    return formatExactDecimal(exactDecimalString(hundredths, 2), label, {
        scale: 2, maximumWholeDigits: 20, allowNegative: false,
    });
};

const displayRate = (value: unknown, label: string): string => {
    const units = exactDecimalUnits(value, label, rateOptions);
    const cents = units / 100n + (units % 100n >= 50n ? 1n : 0n);
    return formatExactCurrency(exactDecimalString(cents, 2), label);
};

const displayLineDiscount = (
    line: CanonicalInvoiceDetail['items'][number], index: number,
): React.ReactNode => {
    const label = `Invoice line ${index + 1} discount`;
    const lineAmount = formatExactCurrency(line.line_discount_amount, `${label} allocation`);
    const invoiceAmount = formatExactCurrency(
        line.document_discount_amount, `${label} invoice allocation`,
    );
    const hasLineAmount = compareExactDecimals(
        line.line_discount_amount, '0.00', `${label} allocation`, moneyOptions,
    ) !== 0;
    const hasInvoiceAmount = compareExactDecimals(
        line.document_discount_amount, '0.00', `${label} invoice allocation`, moneyOptions,
    ) !== 0;
    const input = line.line_discount_kind === 'percent'
        ? `${displayQuantity(line.line_discount_value, `${label} percent`)}%`
        : line.line_discount_kind === 'amount'
            ? `Fixed ${formatExactCurrency(
                exactDecimalString(
                    exactDecimalUnits(line.line_discount_value, `${label} amount`, quantityOptions)
                        / 10000n,
                    2,
                ),
                `${label} fixed amount`,
            )}`
            : 'None';
    return (
        <>
            <div>{input}</div>
            {hasLineAmount && <div className="text-xs text-gray-500">Allocated {lineAmount}</div>}
            {hasInvoiceAmount && <div className="text-xs text-gray-500">Invoice allocation {invoiceAmount}</div>}
        </>
    );
};

const lineGstAmount = (detail: CanonicalInvoiceDetail, lineIndex: number): string => {
    const line = detail.items[lineIndex];
    return addExactDecimals(
        [line.cgst_amount, line.sgst_amount, line.igst_amount],
        `Invoice line ${lineIndex + 1} GST amount`,
        moneyOptions,
    );
};

interface GstBand {
    rate: string;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
}

const gstBands = (detail: CanonicalInvoiceDetail): GstBand[] => {
    const bands = new Map<string, GstBand>();
    detail.items.forEach((line, index) => {
        const rate = normalizeAuthoritativeDecimal(
            line.gst_percent, `Invoice line ${index + 1} GST rate`, quantityOptions,
        );
        const existing = bands.get(rate) ?? {
            rate, taxable: '0.00', cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00',
        };
        bands.set(rate, {
            rate,
            taxable: addExactDecimals([existing.taxable, line.taxable_amount], 'GST band taxable', moneyOptions),
            cgst: addExactDecimals([existing.cgst, line.cgst_amount], 'GST band CGST', moneyOptions),
            sgst: addExactDecimals([existing.sgst, line.sgst_amount], 'GST band SGST', moneyOptions),
            igst: addExactDecimals([existing.igst, line.igst_amount], 'GST band IGST', moneyOptions),
            cess: addExactDecimals([existing.cess, line.cess_amount], 'GST band cess', moneyOptions),
        });
    });
    return [...bands.values()];
};

export const CanonicalInvoiceDetailDialog: React.FC<CanonicalInvoiceDetailDialogProps> = ({
    document,
    detail,
    loading,
    error,
    onClose,
    onRetry,
    onPrint,
    onDownload,
}) => {
    const taxBands = useMemo(() => detail ? gstBands(detail) : [], [detail]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 sm:p-5"
            role="presentation" onMouseDown={onClose}>
            <section role="dialog" aria-modal="true" aria-labelledby="canonical-invoice-detail-title"
                onMouseDown={(event) => event.stopPropagation()}
                className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 px-4 py-3 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Tax Invoice</p>
                        <h2 id="canonical-invoice-detail-title" className="truncate text-xl font-semibold text-gray-950">
                            {document.invoice_number}
                        </h2>
                        <p className="mt-0.5 text-sm text-gray-600">Double-click or Enter on a history row to reopen this invoice.</p>
                    </div>
                    <button type="button" onClick={onClose}
                        className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
                        aria-label="Close invoice detail"><X className="h-5 w-5" /></button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
                    {loading && (
                        <div className="flex min-h-64 items-center justify-center text-sm text-gray-600" role="status">
                            Loading invoice…
                        </div>
                    )}
                    {!loading && error && (
                        <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center text-center" role="alert">
                            <p className="font-medium text-red-800">The invoice could not be loaded.</p>
                            <p className="mt-1 text-sm text-red-700">{error}</p>
                            <button type="button" onClick={onRetry}
                                className="mt-4 min-h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-800 hover:bg-red-50">
                                Retry
                            </button>
                        </div>
                    )}
                    {!loading && !error && detail && (
                        <div className="space-y-4">
                            <section className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                                <div className="rounded-lg border border-gray-200 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Seller</p>
                                    <p className="mt-1 font-semibold text-gray-950">{detail.seller_legal_name}</p>
                                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{detail.seller_address}</p>
                                    <p className="mt-1 text-xs text-gray-600">GSTIN {detail.seller_gstin}</p>
                                </div>
                                <div className="rounded-lg border border-gray-200 p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bill To</p>
                                    <p className="mt-1 font-semibold text-gray-950">{detail.customer_name}</p>
                                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{detail.billing_address}</p>
                                    {detail.customer_gst_number && <p className="mt-1 text-xs text-gray-600">GSTIN {detail.customer_gst_number}</p>}
                                </div>
                                <dl className="grid min-w-52 grid-cols-[auto_auto] content-start gap-x-4 gap-y-2 rounded-lg border border-gray-200 p-3 text-sm">
                                    <dt className="text-gray-500">Date</dt><dd className="text-right font-medium">{displayDate(detail.invoice_date)}</dd>
                                    <dt className="text-gray-500">Due</dt><dd className="text-right font-medium">{displayDate(detail.due_date)}</dd>
                                    <dt className="text-gray-500">Status</dt><dd className="text-right font-medium capitalize">{detail.status.replace(/_/g, ' ')}</dd>
                                    <dt className="text-gray-500">Currency</dt><dd className="text-right font-medium">{detail.currency_code}</dd>
                                    <dt className="text-gray-500">Place of Supply</dt><dd className="text-right font-medium">{detail.place_of_supply_display_name} ({detail.place_of_supply_state_code})</dd>
                                    <dt className="text-gray-500">Supply</dt><dd className="text-right font-medium capitalize">{detail.supply_type.replace(/_/g, ' ')}</dd>
                                    <dt className="text-gray-500">Tax</dt><dd className="text-right font-medium">{detail.tax_charge_mechanism === 'reverse_charge' ? 'Reverse charge' : 'Normal charge'}</dd>
                                </dl>
                            </section>

                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="min-w-[1050px] w-full border-collapse text-sm" aria-label="Invoice lines">
                                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Product</th>
                                            <th className="px-3 py-2 text-left">Batch</th>
                                            <th className="px-3 py-2 text-left">Expiry</th>
                                            <th className="px-3 py-2 text-right">Qty</th>
                                            <th className="px-3 py-2 text-right">Rate</th>
                                            <th className="px-3 py-2 text-right">Disc</th>
                                            <th className="px-3 py-2 text-right">Taxable</th>
                                            <th className="px-3 py-2 text-right">GST % / Amount</th>
                                            <th className="px-3 py-2 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {detail.items.map((line, index) => {
                                            const allocations = line.batch_allocations.length ? line.batch_allocations : null;
                                            const gstAmount = lineGstAmount(detail, index);
                                            return (
                                                <tr key={line.id} className="align-top hover:bg-gray-50/70">
                                                    <td className="px-3 py-2.5">
                                                        <p className="font-medium text-gray-950">{line.product_name}</p>
                                                        <p className="mt-0.5 text-xs text-gray-600">Mfr {line.manufacturer_name}</p>
                                                        <p className="mt-0.5 text-xs text-gray-500">HSN {line.hsn_code} | {line.unit}</p>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-gray-800">
                                                        {allocations ? allocations.map(item => <div key={item.allocation_id}>{item.batch_number}</div>) : (line.batch_number || 'Not applicable')}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-gray-700">
                                                        {allocations ? allocations.map(item => <div key={item.allocation_id}>{displayDate(item.expiry_date)}</div>) : displayDate(line.expiry_date)}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">
                                                        <div>{displayQuantity(line.quantity, `Invoice line ${index + 1} quantity`)}</div>
                                                        {compareExactDecimals(line.free_quantity, '0.000000', `Invoice line ${index + 1} free quantity`, quantityOptions) > 0
                                                            && <div className="text-xs text-gray-500">+ {displayQuantity(line.free_quantity, `Invoice line ${index + 1} free quantity`)} free</div>}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">{displayRate(line.unit_price, `Invoice line ${index + 1} rate`)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">{displayLineDiscount(line, index)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">{formatExactCurrency(line.taxable_amount, `Invoice line ${index + 1} taxable`)}</td>
                                                    <td className="px-3 py-2.5 text-right tabular-nums">
                                                        <div className="font-medium">{displayQuantity(line.gst_percent, `Invoice line ${index + 1} GST rate`)}%</div>
                                                        <div className="text-xs text-gray-500">{formatExactCurrency(gstAmount, `Invoice line ${index + 1} GST amount`)}</div>
                                                        {compareExactDecimals(line.cess_amount, '0.00', `Invoice line ${index + 1} cess`, moneyOptions) !== 0
                                                            && <div className="text-xs text-gray-500">Cess {formatExactCurrency(line.cess_amount, `Invoice line ${index + 1} cess`)}</div>}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatExactCurrency(line.line_total, `Invoice line ${index + 1} total`)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <section className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
                                <div className="overflow-hidden rounded-lg border border-gray-200">
                                    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">GST by rate and amount</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-[560px] w-full text-sm" aria-label="GST breakdown by rate">
                                            <thead className="text-xs text-gray-500"><tr>
                                                <th className="px-3 py-2 text-left">GST Rate</th><th className="px-3 py-2 text-right">Taxable</th>
                                                <th className="px-3 py-2 text-right">CGST</th><th className="px-3 py-2 text-right">SGST</th>
                                                <th className="px-3 py-2 text-right">IGST</th><th className="px-3 py-2 text-right">Cess</th>
                                            </tr></thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {taxBands.map(band => <tr key={band.rate}>
                                                    <td className="px-3 py-2 font-medium">{formatExactDecimal(band.rate, 'GST band rate', quantityOptions)}%</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{formatExactCurrency(band.taxable, 'GST band taxable')}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{formatExactCurrency(band.cgst, 'GST band CGST')}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{formatExactCurrency(band.sgst, 'GST band SGST')}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{formatExactCurrency(band.igst, 'GST band IGST')}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{formatExactCurrency(band.cess, 'GST band cess')}</td>
                                                </tr>)}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <dl className="rounded-lg border border-gray-300 p-3 text-sm">
                                    {[
                                        ['Subtotal', detail.subtotal_amount],
                                        ['Discount', detail.pre_tax_discount_amount],
                                        ['Charges', detail.charges_amount],
                                        ['Taxable Amount', detail.taxable_amount],
                                        ['CGST', detail.cgst_amount],
                                        ['SGST', detail.sgst_amount],
                                        ['IGST', detail.igst_amount],
                                        ['Cess', detail.cess_amount],
                                        ['Round Off', detail.rounding_adjustment],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex justify-between gap-6 py-1.5">
                                            <dt className="text-gray-600">{label}</dt><dd className="font-medium tabular-nums">{formatExactCurrency(value, `Invoice ${label}`)}</dd>
                                        </div>
                                    ))}
                                    <div className="mt-1 flex justify-between gap-6 border-t-2 border-gray-900 pt-2 text-base">
                                        <dt className="font-semibold">Grand Total</dt><dd className="font-bold tabular-nums">{formatExactCurrency(detail.total_amount, 'Invoice grand total')}</dd>
                                    </div>
                                </dl>
                            </section>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
                    <button type="button" onClick={onPrint} disabled={!detail || loading}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                        <Printer className="h-4 w-4" /> Print
                    </button>
                    <button type="button" onClick={onDownload} disabled={!detail || loading}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                        <Download className="h-4 w-4" /> Download PDF
                    </button>
                </footer>
            </section>
        </div>
    );
};
