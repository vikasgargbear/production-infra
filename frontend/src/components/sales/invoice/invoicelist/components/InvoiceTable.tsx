/**
 * InvoiceTable Component
 * Main invoice listing table with selection and actions
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { Eye, Printer, MoreVertical, XCircle } from 'lucide-react';
import { DataTable, StatusBadge } from '../../../../global';
import type { InvoiceTableProps, Invoice } from '../types/invoicelist.types';

export const InvoiceTable = React.memo<InvoiceTableProps>(({
    invoices,
    selectedIds,
    isAllSelected,
    loading,
    onToggleSelect,
    onToggleSelectAll,
    onViewInvoice,
    onPrintInvoice,
    onCancelInvoice
}) => {
    const columns = useMemo(() => [
        {
            key: 'select',
            header: (
                <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
            ),
            render: (_: any, invoice: Invoice) => (
                <input
                    type="checkbox"
                    checked={selectedIds.has(invoice.id)}
                    onChange={() => onToggleSelect(invoice.id)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
            ),
            width: '50px'
        },
        {
            key: 'invoice_date',
            header: 'Date',
            render: (_: any, invoice: Invoice) => (
                <div className="text-gray-700">
                    {new Date(invoice.invoice_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    })}
                </div>
            ),
            width: '110px'
        },
        {
            key: 'invoice_number',
            header: 'Invoice #',
            render: (_: any, invoice: Invoice) => (
                <div className="font-medium text-gray-900">{invoice.invoice_number}</div>
            ),
            width: '140px'
        },
        {
            key: 'customer_name',
            header: 'Customer',
            render: (_: any, invoice: Invoice) => (
                <div className="font-medium text-gray-900">{invoice.customer_name}</div>
            )
        },
        {
            key: 'total_amount',
            header: 'Amount',
            align: 'right' as const,
            render: (_: any, invoice: Invoice) => (
                <div className="text-right">
                    <div className="font-semibold text-gray-900">
                        ₹{invoice.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    {invoice.pending_amount > 0 && (
                        <div className="text-xs text-red-600">
                            ₹{invoice.pending_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} pending
                        </div>
                    )}
                </div>
            ),
            width: '150px'
        },
        {
            key: 'payment_status',
            header: 'Status',
            align: 'center' as const,
            render: (_: any, invoice: Invoice) => {
                const statusMap = {
                    paid: { status: 'success', label: 'Paid' },
                    partial: { status: 'warning', label: 'Partial' },
                    pending: { status: 'info', label: 'Pending' },
                    overdue: { status: 'error', label: 'Overdue' },
                    cancelled: { status: 'error', label: 'Cancelled' }
                };

                const statusConfig = statusMap[invoice.payment_status] || { status: 'default', label: invoice.payment_status };

                return <StatusBadge status={statusConfig.status as any} label={statusConfig.label} />;
            },
            width: '100px'
        },
        {
            key: 'due_date',
            header: 'Due Date',
            render: (_: any, invoice: Invoice) => {
                // Handle missing or invalid due_date
                if (!invoice.due_date) {
                    return <div className="text-gray-400">-</div>;
                }

                const dueDate = new Date(invoice.due_date);
                if (isNaN(dueDate.getTime())) {
                    return <div className="text-gray-400">-</div>;
                }

                const today = new Date();
                const isOverdue = dueDate < today && invoice.payment_status !== 'paid';

                return (
                    <div className={isOverdue ? 'text-red-600' : 'text-gray-700'}>
                        {dueDate.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short'
                        })}
                    </div>
                );
            },
            width: '100px'
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'center' as const,
            render: (_: any, invoice: Invoice) => {
                // Can cancel only if not cancelled and no payments made
                const canCancel = invoice.payment_status !== 'cancelled' && invoice.paid_amount === 0;

                return (
                    <div className="flex items-center justify-center space-x-1">
                        <button
                            onClick={() => onViewInvoice(invoice)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="View Invoice"
                        >
                            <Eye className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => onPrintInvoice(invoice)}
                            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                            title="Print Invoice"
                        >
                            <Printer className="w-4 h-4" />
                        </button>
                        {canCancel && onCancelInvoice && (
                            <button
                                onClick={() => onCancelInvoice(invoice)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                title="Cancel Invoice"
                            >
                                <XCircle className="w-4 h-4" />
                            </button>
                        )}
                        <button
                            className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                            title="More Actions"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>
                    </div>
                );
            },
            width: '140px'
        }
    ], [selectedIds, isAllSelected, onToggleSelect, onToggleSelectAll, onViewInvoice, onPrintInvoice, onCancelInvoice]);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <DataTable
                columns={columns}
                data={invoices}
                keyField="id"
                loading={loading}
                emptyMessage="No invoices found"
            />
        </div>
    );
});

InvoiceTable.displayName = 'InvoiceTable';
