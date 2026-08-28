/**
 * PartyDetailsView Component
 * Detailed view of a single party's outstanding invoices with summary cards
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { CreditCard, Clock } from 'lucide-react';
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
            header: 'Invoice #',
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
        <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Customer Contact Info */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{party.party_name}</h2>
                        <div className="flex items-center gap-6 mt-2 text-gray-600">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="text-sm text-gray-600 mb-2">Total Outstanding</div>
                    <div className="text-2xl font-bold text-gray-900">
                        {formatExactCurrency(party.total_outstanding, 'Customer outstanding')}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {party.invoice_count} invoices
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="text-sm text-gray-600 mb-2">Overdue Amount</div>
                    <div className="text-2xl font-bold text-red-600">
                        {formatExactCurrency(party.total_overdue, 'Customer overdue')}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {party.overdue_count} overdue
                    </div>
                </div>

            </div>

            {/* Outstanding Invoices Table */}
            <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Outstanding Invoices</h3>
                    <button
                        type="button"
                        disabled
                        title="Payment allocation requires the canonical customer-receipt command"
                        className="flex cursor-not-allowed items-center rounded-md border border-gray-200 bg-gray-100 px-4 py-2 text-gray-500"
                    >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Allocation unavailable
                    </button>
                </div>
                <div className="p-6">
                    {party.invoices && party.invoices.length > 0 ? (
                        <DataTable
                            columns={invoiceColumns}
                            data={party.invoices}
                            keyField="invoice_id"
                            loading={false}
                            emptyMessage="No invoices found"
                        />
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">No outstanding invoices</p>
                            <p className="text-sm">This customer has no pending payments</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

PartyDetailsView.displayName = 'PartyDetailsView';
