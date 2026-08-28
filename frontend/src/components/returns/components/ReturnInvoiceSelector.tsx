import React, { useEffect, useState, useCallback } from 'react';
import { FileText, ChevronRight, ChevronLeft, Loader2, RefreshCw, Package } from 'lucide-react';
import { invoicesApi } from '../../../services/api';
import type { ReturnInvoiceSelectorProps } from '../types/return.types';
import { formatReturnMoney } from '../utils/returnDecimal';
import { formatCalendarDate } from '../../../utils/calendarDate';

interface InvoiceData {
    id?: string | number;
    invoice_id?: string | number;
    invoice_number: string;
    invoice_date: string;
    final_amount?: number | string;
    total_amount?: number | string;
    grand_total?: number | string;
    total_items?: number;
    items?: any[];
}

const formatInvoiceAmount = (amount: unknown): string => {
    if (amount === '' || amount === null || amount === undefined) return 'Amount unavailable';
    try { return formatReturnMoney(amount, 'Invoice amount'); }
    catch { return 'Invalid invoice amount'; }
};

export const ReturnInvoiceSelector = React.memo<ReturnInvoiceSelectorProps>(({
    selectedCustomer,
    selectedInvoice,
    onInvoiceSelect,
    onChangeInvoice,
    showInvoiceSection,
    invoiceSearchRef
}) => {
    const [invoices, setInvoices] = useState<InvoiceData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const ITEMS_PER_PAGE = 5;

    // Get customer ID handling multiple possible field names
    const customerId = (selectedCustomer as any)?.customer_id || (selectedCustomer as any)?.id;

    // Fetch invoices when customer is selected
    const fetchInvoices = useCallback(async (pageNum: number = 1) => {
        if (!customerId) return;

        setLoading(true);
        setError(null);

        try {
            const response = await invoicesApi.search({
                customer_id: customerId,
                skip: (pageNum - 1) * ITEMS_PER_PAGE,
                limit: ITEMS_PER_PAGE,
                sort: 'invoice_date',
                order: 'desc'
            });

            const data = (response as any)?.data || response;
            const invoiceList = data?.invoices || (Array.isArray(data) ? data : []);
            setInvoices(invoiceList);
            setTotalCount(data?.total ?? invoiceList.length);
        } catch (err) {
            console.error('Failed to fetch invoices:', err);
            setError('Failed to load invoices from the canonical API.');
            setInvoices([]);
            setTotalCount(0);
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    // Fetch on customer change or page change
    useEffect(() => {
        if (customerId && showInvoiceSection && !selectedInvoice) {
            fetchInvoices(page);
        }
    }, [customerId, showInvoiceSection, selectedInvoice, page, fetchInvoices]);

    // Reset page when customer changes
    useEffect(() => {
        setPage(1);
    }, [customerId]);

    if (!selectedCustomer || !showInvoiceSection) {
        // If invoice is selected but section hidden, show compact selected invoice preview
        if (selectedInvoice && selectedCustomer) {
            const invoiceNumber = (selectedInvoice as any)?.invoice_number || '';
            const invoiceDate = (selectedInvoice as any)?.invoice_date || '';
            const invoiceAmount = (selectedInvoice as any)?.final_amount ?? (selectedInvoice as any)?.total_amount;

            return (
                <div className="mb-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-gray-900">{invoiceNumber}</span>
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Selected</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-gray-500">
                                        {invoiceDate && (
                                            <span>{formatCalendarDate(invoiceDate)}</span>
                                        )}
                                        <span>{formatInvoiceAmount(invoiceAmount)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        if (onChangeInvoice) onChangeInvoice();
                                    }}
                                    className="px-3 py-1.5 text-sm text-blue-600 border border-blue-300 hover:bg-blue-50 rounded-lg transition-colors font-medium"
                                >
                                    Change Invoice
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    }

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    // Format currency
    // Format date
    const formatDate = (dateStr: string) => formatCalendarDate(dateStr);

    // Handle invoice click
    const handleInvoiceClick = (invoice: InvoiceData) => {
        // Map to expected format
        const invoiceId = invoice.id ?? invoice.invoice_id;
        const mappedInvoice = {
            invoice_id: invoiceId,
            id: invoiceId,
            invoice_number: invoice.invoice_number,
            invoice_date: invoice.invoice_date,
            final_amount: invoice.final_amount ?? invoice.total_amount ?? invoice.grand_total,
            total_items: invoice.total_items ?? invoice.items?.length
        };
        onInvoiceSelect(mappedInvoice as any);
    };

    return (
        <div className="mb-6">
            {/* Canonical source is required. */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <FileText className="w-4 h-4 mr-2" />
                    SELECT POSTED INVOICE (Required)
                </h3>
            </div>

            {/* Invoice list */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                {/* Invoice list */}
                <div>
                    {loading ? (
                        <div className="flex items-center justify-center py-8 text-gray-500">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Loading invoices...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <p className="text-red-500 mb-2">{error}</p>
                            <button
                                onClick={() => fetchInvoices(page)}
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Retry
                            </button>
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                            <Package className="w-8 h-8 mb-2 text-gray-400" />
                            <p>No invoices found for this customer</p>
                            <p className="text-sm text-gray-400 mt-1">A posted dispatch-allocated invoice is required for exact return lineage.</p>
                        </div>
                    ) : (
                        <>
                            {/* Invoice cards */}
                            <div className="space-y-2">
                                {invoices.map((invoice) => (
                                    <button
                                        key={invoice.id ?? invoice.invoice_id}
                                        data-testid={`select-sales-invoice-${invoice.id ?? invoice.invoice_id}`}
                                        onClick={() => handleInvoiceClick(invoice)}
                                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-between group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                                                <FileText className="w-5 h-5 text-gray-500 group-hover:text-blue-600" />
                                            </div>
                                            <div>
                                                <span className="font-semibold text-gray-900 block">
                                                    {invoice.invoice_number}
                                                </span>
                                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                                    <span>{formatDate(invoice.invoice_date)}</span>
                                                    {(invoice.total_items ?? invoice.items?.length) !== undefined && (
                                                        <span>{invoice.total_items ?? invoice.items?.length} items</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-semibold text-gray-900">
                                                {formatInvoiceAmount(invoice.final_amount ?? invoice.total_amount ?? invoice.grand_total)}
                                            </span>
                                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 inline-block ml-2" />
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                                    <span className="text-sm text-gray-500">
                                        Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <span className="text-sm text-gray-600 px-2">
                                            Page {page} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page === totalPages}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

ReturnInvoiceSelector.displayName = 'ReturnInvoiceSelector';
