/**
 * InvoiceTable Component
 * Main invoice listing table with selection and actions
 * Optimized with React.memo
 */

import React, { useMemo, useState } from 'react';
import { MoreVertical, MessageCircle, Mail, XCircle } from 'lucide-react';
import { DataTable, StatusBadge } from '../../../../global';
import { useCompany } from '../../../../../contexts/CompanyContext';
import type { InvoiceTableProps, Invoice } from '../types/invoicelist.types';

// Dropdown menu for more actions
const ActionDropdown: React.FC<{
    invoice: Invoice;
    onCancel?: (invoice: Invoice) => void;
}> = ({ invoice, onCancel }) => {
    const [isOpen, setIsOpen] = useState(false);
    const canCancel = invoice.payment_status !== 'cancelled' && invoice.paid_amount === 0;

    if (!canCancel || !onCancel) return null;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                title="More Actions"
            >
                <MoreVertical className="w-4 h-4" />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop to close dropdown */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />
                    {/* Dropdown menu */}
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                        {canCancel && onCancel && (
                            <button
                                onClick={() => {
                                    onCancel(invoice);
                                    setIsOpen(false);
                                }}
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                                <XCircle className="w-4 h-4" />
                                Cancel Invoice
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export const InvoiceTable = React.memo<InvoiceTableProps>(({
    invoices,
    selectedIds,
    isAllSelected,
    loading,
    onToggleSelect,
    onToggleSelectAll,
    onCancelInvoice
}) => {
    // Get company name for message templates
    const { companyInfo } = useCompany();
    const companyName = companyInfo?.name || 'Our Company';

    // Format date helper
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // Create formatted message for both channels
    const createInvoiceMessage = (invoice: Invoice) => {
        const invoiceDate = formatDate(invoice.invoice_date);
        const dueDate = invoice.due_date ? formatDate(invoice.due_date) : 'Not specified';

        return `Dear ${invoice.customer_name},

Your invoice from ${companyName} is ready!

Invoice #: ${invoice.invoice_number}
Date: ${invoiceDate}
Amount: ₹${invoice.total_amount.toLocaleString('en-IN')}
Due Date: ${dueDate}

${invoice.pending_amount > 0 ? `Pending: ₹${invoice.pending_amount.toLocaleString('en-IN')}\n` : ''}Thank you for your business!

---
${companyName}`;
    };

    // Handle WhatsApp share
    const handleWhatsApp = (invoice: Invoice) => {
        const message = createInvoiceMessage(invoice);
        const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    // Handle Email share
    const handleEmail = (invoice: Invoice) => {
        const subject = `Invoice ${invoice.invoice_number} - ₹${invoice.total_amount.toLocaleString('en-IN')}`;
        const body = createInvoiceMessage(invoice);
        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
    };

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
                <div className="text-sm text-gray-600">{invoice.invoice_number}</div>
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
            header: 'Due',
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
            width: '90px'
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'center' as const,
            render: (_: any, invoice: Invoice) => {
                return (
                    <div className="flex items-center justify-center gap-0.5">
                        {/* WhatsApp */}
                        <button
                            onClick={() => handleWhatsApp(invoice)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Share via WhatsApp"
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                        {/* Email */}
                        <button
                            onClick={() => handleEmail(invoice)}
                            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors"
                            title="Send via Email"
                        >
                            <Mail className="w-4 h-4" />
                        </button>
                        {/* More Actions (Edit, Cancel) */}
                        <ActionDropdown
                            invoice={invoice}
                            onCancel={onCancelInvoice}
                        />
                    </div>
                );
            },
            width: '180px'
        }
    ], [selectedIds, isAllSelected, onToggleSelect, onToggleSelectAll, onCancelInvoice, companyName]);

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
