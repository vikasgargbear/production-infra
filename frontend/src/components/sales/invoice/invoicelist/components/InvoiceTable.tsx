import React, { useState } from 'react';
import { Download, Eye, Mail, MessageCircle, Printer, X } from 'lucide-react';
import { DataTable, StatusBadge } from '../../../../global';
import { useCompany } from '../../../../../contexts/CompanyContext';
import type { InvoiceTableProps, Invoice } from '../types/invoicelist.types';
import { compareExactDecimals, formatExactCurrency } from '../../../../../utils/exactDecimal';
import {
    salesDocumentLabel,
    salesDocumentNumberLabel,
    salesDocumentStatus,
    salesHistoryDocumentCsv,
    salesHistoryAmountLabel,
    salesHistoryPrintHtml,
    salesStatusLabel,
    salesStatusTone,
} from '../utils/salesHistoryPresentation';
import { formatCalendarDate } from '../../../../../utils/calendarDate';
import { invoicesApi } from '../../../../../services/api/modules/sales/invoices.api';

export const InvoiceTable = React.memo<InvoiceTableProps>(({
    invoices,
    documentType,
    selectedIds,
    isAllSelected,
    loading,
    onToggleSelect,
    onToggleSelectAll,
}) => {
    const { companyInfo } = useCompany();
    const companyName = companyInfo?.name?.trim() || null;
    const [viewingDocument, setViewingDocument] = useState<Invoice | null>(null);
    const [documentActionError, setDocumentActionError] = useState<string | null>(null);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not specified';
        try {
            return formatCalendarDate(dateString);
        } catch {
            return 'Not specified';
        }
    };

    const createDocumentMessage = (document: Invoice) => {
        const label = salesDocumentLabel(document.document_type);
        return `Dear ${document.customer_name},

Your ${label.toLowerCase()}${companyName ? ` from ${companyName}` : ''} is ready.

${label} #: ${document.invoice_number}
Date: ${formatDate(document.invoice_date)}
${document.total_amount === null ? '' : `Amount: ${formatExactCurrency(document.total_amount, 'Sales history amount')}\n`}
${document.due_date ? `Due/Delivery Date: ${formatDate(document.due_date)}\n` : ''}
${document.document_type === 'invoice' && document.pending_amount !== null
                && compareExactDecimals(document.pending_amount, '0.00', 'Outstanding amount', { scale: 2, maximumWholeDigits: 20 }) > 0
                ? `Pending: ${formatExactCurrency(document.pending_amount, 'Outstanding amount')}\n`
                : ''}Status: ${salesStatusLabel(salesDocumentStatus(document))}

Thank you for your business.

${companyName ? `\n---\n${companyName}` : ''}`;
    };

    const handleWhatsApp = (document: Invoice) => {
        if (!document.customer_phone) return;
        let phone = document.customer_phone.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = phone.slice(1);
        if (phone.length === 10) phone = `91${phone}`;
        window.open(
            `https://wa.me/${phone}?text=${encodeURIComponent(createDocumentMessage(document))}`,
            '_blank',
            'noopener,noreferrer',
        );
    };

    const handleEmail = (document: Invoice) => {
        if (!document.customer_email) return;
        const label = salesDocumentLabel(document.document_type);
        const subject = `${label} ${document.invoice_number}`
            + (document.total_amount === null ? '' : ` - ${formatExactCurrency(document.total_amount, 'Sales history amount')}`);
        window.location.href = `mailto:${encodeURIComponent(document.customer_email)}`
            + `?subject=${encodeURIComponent(subject)}`
            + `&body=${encodeURIComponent(createDocumentMessage(document))}`;
    };

    const handlePrint = async (document: Invoice) => {
        setDocumentActionError(null);
        if (document.document_type === 'invoice') {
            try {
                const response = await invoicesApi.getById(document.id);
                const { printableCanonicalInvoice, printInvoice } = await import('../../../../../utils/invoicePdfGenerator');
                printInvoice(printableCanonicalInvoice(response.data));
            } catch (error) {
                setDocumentActionError(error instanceof Error ? error.message : 'Invoice print is unavailable.');
            }
            return;
        }
        const printWindow = window.open('', '_blank', 'noopener,noreferrer');
        if (!printWindow) {
            setDocumentActionError('The browser blocked the print window.');
            return;
        }
        printWindow.document.write(salesHistoryPrintHtml(document));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const handleDownload = async (document: Invoice) => {
        setDocumentActionError(null);
        if (document.document_type === 'invoice') {
            try {
                const response = await invoicesApi.getById(document.id);
                const { downloadInvoicePDF, printableCanonicalInvoice } = await import('../../../../../utils/invoicePdfGenerator');
                await downloadInvoicePDF(printableCanonicalInvoice(response.data));
            } catch (error) {
                setDocumentActionError(error instanceof Error ? error.message : 'Invoice PDF is unavailable.');
            }
            return;
        }
        const blob = new Blob([salesHistoryDocumentCsv(document)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = window.document.createElement('a');
        link.href = url;
        link.download = `${document.document_type}-${document.invoice_number}.csv`
            .replace(/[^a-zA-Z0-9._-]/g, '-');
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const columns = [
        {
            key: 'select',
            header: (
                <input type="checkbox" aria-label="Select all visible documents"
                    checked={isAllSelected} onChange={onToggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            ),
            render: (_: unknown, document: Invoice) => (
                <input type="checkbox"
                    aria-label={`Select ${salesDocumentLabel(document.document_type)} ${document.invoice_number}`}
                    checked={selectedIds.has(document.id)} onChange={() => onToggleSelect(document.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            ),
            width: '50px',
        },
        {
            key: 'invoice_date', header: 'Date', width: '110px',
            render: (_: unknown, document: Invoice) => (
                <div className="text-gray-700">{formatDate(document.invoice_date)}</div>
            ),
        },
        {
            key: 'invoice_number', header: salesDocumentNumberLabel(documentType), width: '150px',
            render: (_: unknown, document: Invoice) => (
                <div className="text-sm text-gray-700">{document.invoice_number}</div>
            ),
        },
        {
            key: 'customer_name', header: 'Customer',
            render: (_: unknown, document: Invoice) => (
                <div className="font-medium text-gray-900">{document.customer_name}</div>
            ),
        },
        {
            key: 'total_amount', header: 'Amount', align: 'right' as const, width: '150px',
            render: (_: unknown, document: Invoice) => (
                <div className="text-right">
                    <div className="font-semibold text-gray-900">
                        {salesHistoryAmountLabel(document.total_amount)}
                    </div>
                    {document.document_type === 'invoice' && document.pending_amount !== null
                        && compareExactDecimals(document.pending_amount, '0.00', 'Outstanding amount', { scale: 2, maximumWholeDigits: 20 }) > 0 && (
                        <div className="text-xs text-red-700">
                            {formatExactCurrency(document.pending_amount, 'Outstanding amount')} pending
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: 'document_status',
            header: documentType === 'invoice' ? 'Payment Status' : 'Document Status',
            align: 'center' as const, width: '130px',
            render: (_: unknown, document: Invoice) => {
                const status = salesDocumentStatus(document);
                return <StatusBadge status={salesStatusTone(status)} label={salesStatusLabel(status)} />;
            },
        },
        {
            key: 'due_date',
            header: documentType === 'sales_order' ? 'Delivery' : documentType === 'invoice' ? 'Due' : 'Dispatch',
            width: '100px',
            render: (_: unknown, document: Invoice) => {
                if (!document.due_date) return <div className="text-gray-400">—</div>;
                const overdue = document.document_type === 'invoice' && document.payment_status === 'overdue';
                return <div className={overdue ? 'text-red-700' : 'text-gray-700'}>{formatDate(document.due_date)}</div>;
            },
        },
        {
            key: 'actions', header: 'Actions', align: 'center' as const, width: '230px',
            render: (_: unknown, document: Invoice) => {
                const label = salesDocumentLabel(document.document_type);
                const iconButton = 'flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors';
                return (
                    <div className="flex items-center justify-center gap-0.5">
                        <button type="button" onClick={() => setViewingDocument(document)}
                            className={`${iconButton} text-gray-700 hover:bg-gray-100`}
                            title="View summary" aria-label={`View ${label} ${document.invoice_number}`}>
                            <Eye className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handlePrint(document)}
                            className={`${iconButton} text-gray-700 hover:bg-gray-100`}
                            title={document.document_type === 'invoice' ? 'Print canonical invoice' : 'Print summary'}
                            aria-label={`Print ${label} ${document.invoice_number}`}>
                            <Printer className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleDownload(document)}
                            className={`${iconButton} text-gray-700 hover:bg-gray-100`}
                            title={document.document_type === 'invoice' ? 'Download canonical invoice PDF' : 'Download summary CSV'}
                            aria-label={`Download ${label} ${document.invoice_number}`}>
                            <Download className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleWhatsApp(document)} disabled={!document.customer_phone}
                            className={`${iconButton} text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:text-gray-300`}
                            title={document.customer_phone ? 'Open WhatsApp composer' : 'Customer phone unavailable'}
                            aria-label={`Share ${label} ${document.invoice_number} via WhatsApp`}>
                            <MessageCircle className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleEmail(document)} disabled={!document.customer_email}
                            className={`${iconButton} text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300`}
                            title={document.customer_email ? 'Open email composer' : 'Customer email unavailable'}
                            aria-label={`Email ${label} ${document.invoice_number}`}>
                            <Mail className="h-4 w-4" />
                        </button>
                    </div>
                );
            },
        },
    ];

    return (
        <>
            {documentActionError && (
                <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {documentActionError}
                </div>
            )}
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                <DataTable columns={columns} data={invoices} keyField="id" loading={loading}
                    emptyMessage={`No ${salesDocumentLabel(documentType).toLowerCase()} records found`} />
            </div>

            {viewingDocument && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    role="presentation" onMouseDown={() => setViewingDocument(null)}>
                    <section role="dialog" aria-modal="true" aria-labelledby="sales-document-summary-title"
                        onMouseDown={(event) => event.stopPropagation()}
                        className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-xl">
                        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                    {salesDocumentLabel(viewingDocument.document_type)}
                                </p>
                                <h2 id="sales-document-summary-title" className="text-lg font-semibold text-gray-900">
                                    {viewingDocument.invoice_number}
                                </h2>
                            </div>
                            <button type="button" onClick={() => setViewingDocument(null)}
                                className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100"
                                aria-label="Close document summary"><X className="h-5 w-5" /></button>
                        </header>
                        <dl className="grid grid-cols-[9rem_1fr] px-5 py-3 text-sm">
                            {[
                                ['Date', formatDate(viewingDocument.invoice_date)],
                                ['Customer', viewingDocument.customer_name],
                                ['Amount', salesHistoryAmountLabel(viewingDocument.total_amount)],
                                ['Status', salesStatusLabel(salesDocumentStatus(viewingDocument))],
                                ['Items', String(viewingDocument.items_count)],
                            ].map(([term, description]) => (
                                <React.Fragment key={term}>
                                    <dt className="border-b border-gray-100 py-3 text-gray-500">{term}</dt>
                                    <dd className="border-b border-gray-100 py-3 font-medium text-gray-900">{description}</dd>
                                </React.Fragment>
                            ))}
                        </dl>
                        <footer className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
                            <button type="button" onClick={() => handlePrint(viewingDocument)}
                                className="min-h-11 rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                                {viewingDocument.document_type === 'invoice' ? 'Print Invoice' : 'Print Summary'}
                            </button>
                            <button type="button" onClick={() => handleDownload(viewingDocument)}
                                className="min-h-11 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
                                {viewingDocument.document_type === 'invoice' ? 'Download PDF' : 'Download CSV'}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </>
    );
});

InvoiceTable.displayName = 'InvoiceTable';
