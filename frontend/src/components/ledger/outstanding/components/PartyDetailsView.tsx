/**
 * PartyDetailsView Component
 * Detailed view of a single party's outstanding invoices with summary cards
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { DataTable } from '../../../global';
import { formatExactCurrency } from '../../../../utils/exactDecimal';
import { format, parseISO } from 'date-fns';
import type { PartyDetailsViewProps, InvoiceDetail } from '../types/outstanding.types';

export const PartyDetailsView = React.memo<PartyDetailsViewProps>(({
    party
}) => {
    const invoiceColumns = useMemo(() => [
        {
            key: 'invoice_number',
            header: 'Document #',
            render: (_: any, invoice: InvoiceDetail) => invoice.invoice_number,
            width: '120px'
        },
        {
            key: 'invoice_date',
            header: 'Date',
            render: (_: any, invoice: InvoiceDetail) => {
                try {
                    return format(parseISO(invoice.invoice_date), 'dd/MM/yyyy');
                } catch {
                    return invoice.invoice_date;
                }
            },
            width: '100px'
        },
        {
            key: 'due_date',
            header: 'Due Date',
            render: (_: any, invoice: InvoiceDetail) => {
                try {
                    return format(parseISO(invoice.due_date), 'dd/MM/yyyy');
                } catch {
                    return invoice.due_date || '-';
                }
            },
            width: '100px'
        },
        {
            key: 'original_amount',
            header: 'Amount',
            align: 'right' as const,
            render: (_: any, invoice: InvoiceDetail) => formatExactCurrency(invoice.original_amount, 'Invoice original amount'),
            width: '120px'
        },
        {
            key: 'paid_amount',
            header: 'Paid',
            align: 'right' as const,
            render: (_: any, invoice: InvoiceDetail) => formatExactCurrency(invoice.paid_amount, 'Invoice paid amount'),
            width: '120px'
        },
        {
            key: 'current_outstanding',
            header: 'Outstanding',
            align: 'right' as const,
            render: (_: any, invoice: InvoiceDetail) => formatExactCurrency(invoice.current_outstanding, 'Invoice outstanding'),
            width: '120px'
        },
        {
            key: 'aging',
            header: 'Aging',
            align: 'center' as const,
            render: (_: any, invoice: InvoiceDetail) => {
                const getAgingColor = (bucket: string) => {
                    switch (bucket) {
                        case 'current': return 'text-green-600';
                        case '1-30': return 'text-yellow-600';
                        case '31-60': return 'text-orange-600';
                        case '61-90': return 'text-red-600';
                        case 'over_90': return 'text-red-800';
                        default: return 'text-gray-600';
                    }
                };

                return (
                    <span className={getAgingColor(invoice.aging_bucket)}>
                        {invoice.aging_bucket === 'over_90' ? '90+' : invoice.aging_bucket}
                    </span>
                );
            },
            width: '80px'
        },
        {
            key: 'status',
            header: 'Status',
            render: (_: any, invoice: InvoiceDetail) => {
                const getStatusBadge = (status: string) => {
                    switch (status) {
                        case 'overdue':
                            return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Overdue</span>;
                        case 'partial':
                            return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">Partial</span>;
                        case 'pending':
                            return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Pending</span>;
                        default:
                            return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">{status}</span>;
                    }
                };

                return getStatusBadge(invoice.status);
            },
            width: '100px'
        }
    ], []);

    return (
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
            {/* Party contact and canonical account identity */}
            <div className="mb-4 rounded-lg bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{party.party_name}</h2>
                        <p className="mt-1 text-sm text-gray-500">{party.party_code} · {party.account_status.replace('_', ' ')}</p>
                        <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:gap-6">
                            {party.party_phone && (
                                <div className="flex items-center gap-2">
                                    <span>📱</span>
                                    <span>{party.party_phone}</span>
                                </div>
                            )}
                            {party.party_email && (
                                <div className="flex items-center gap-2">
                                    <span>✉️</span>
                                    <span>{party.party_email}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 md:grid-cols-2 md:gap-6">
                <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
                    <div className="text-sm text-gray-600 mb-2">Total Outstanding</div>
                    <div className="text-2xl font-bold text-gray-900">
                        {formatExactCurrency(party.total_outstanding, 'Customer outstanding')}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {party.invoice_count} documents
                    </div>
                </div>

                <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
                    <div className="text-sm text-gray-600 mb-2">Overdue Amount</div>
                    <div className="text-2xl font-bold text-red-600">
                        {formatExactCurrency(party.total_overdue, 'Customer overdue')}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {party.overdue_count} overdue
                    </div>
                </div>

            </div>

            {/* Outstanding documents table */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
                    <h3 className="text-lg font-semibold">Outstanding documents</h3>
                    <p className="mt-1 text-sm text-gray-500">Record receipts or supplier payments from the Payments module.</p>
                </div>
                <div className="p-4 sm:p-6">
                    {party.invoices && party.invoices.length > 0 ? (
                        <>
                        <div className="space-y-3 md:hidden">
                            {party.invoices.map(document => (
                                <article key={document.open_item_id} className="rounded-xl border border-gray-200 p-4">
                                    <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold text-gray-950">{document.invoice_number}</h4><p className="mt-1 text-xs text-gray-500">Due {document.due_date}</p></div><span className={`rounded-full px-2 py-1 text-xs font-medium ${document.status === 'overdue' ? 'bg-red-100 text-red-700' : document.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{document.status}</span></div>
                                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-gray-500">Original</dt><dd className="mt-1 font-medium">{formatExactCurrency(document.original_amount, 'Document original amount')}</dd></div><div><dt className="text-gray-500">Outstanding</dt><dd className="mt-1 font-semibold text-red-700">{formatExactCurrency(document.current_outstanding, 'Document outstanding')}</dd></div></dl>
                                </article>
                            ))}
                        </div>
                        <div className="hidden md:block">
                        <DataTable
                            columns={invoiceColumns}
                            data={party.invoices}
                            keyField="invoice_id"
                            loading={false}
                            emptyMessage="No documents found"
                        />
                        </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">No outstanding documents</p>
                            <p className="text-sm">This party has no pending balance</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

PartyDetailsView.displayName = 'PartyDetailsView';
