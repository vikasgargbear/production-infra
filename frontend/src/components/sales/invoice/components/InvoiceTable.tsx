import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { StatusBadge } from '../../../global';
import { InvoiceActionMenu } from './InvoiceActionMenu';
import type { Invoice } from '../types/invoiceTypes';


interface InvoiceTableProps {
    invoices: Invoice[];
    selectedIds: Set<number>;
    onToggleSelect: (id: number) => void;
    onToggleSelectAll: () => void;
    onView: (invoice: Invoice) => void;
    onEdit: (invoice: Invoice) => void;
    onPrint: (invoice: Invoice) => void;
    onDownload: (invoice: Invoice) => void;
    onWhatsApp: (invoice: Invoice) => void;
    onMore: (invoice: Invoice) => void;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

const formatDate = (value: string) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
};

const getStatusText = (status: string | undefined) => {
    if (!status) return 'Unknown';
    const statusMap: Record<string, string> = {
        'draft': 'Draft', 'sent': 'Sent', 'paid': 'Paid',
        'posted': 'Posted', 'overdue': 'Overdue', 'cancelled': 'Cancelled',
        'pending': 'Pending', 'partial': 'Partial'
    };
    const normalizedStatus = status.toString().toLowerCase().trim();
    return statusMap[normalizedStatus] || status;
};

// Memoized row component for better performance
const InvoiceRow = React.memo<{
    invoice: Invoice;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    onView: (invoice: Invoice) => void;
    onEdit: (invoice: Invoice) => void;
    onPrint: (invoice: Invoice) => void;
    onDownload: (invoice: Invoice) => void;
    onWhatsApp: (invoice: Invoice) => void;
    onMore: (invoice: Invoice) => void;
}>(({
    invoice,
    isSelected,
    onToggleSelect,
    onView,
    onEdit,
    onPrint,
    onDownload,
    onWhatsApp,
    onMore
}) => {
    return (
        <tr className="hover:bg-gray-50 transition-colors">
            <td className="px-4 py-4 whitespace-nowrap">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(invoice.id)}
                    className="w-4 h-4 rounded border-gray-300"
                />
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 font-medium">
                    {formatDate(invoice.invoice_date)}
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 font-medium">
                    {invoice.customer_name}
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-600">
                    {invoice.invoice_number}
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                    {formatCurrency(invoice.final_amount || 0)}
                </div>
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <StatusBadge
                    status={getStatusText(invoice.invoice_status)}
                    variant="light"
                />
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <StatusBadge
                    status={getStatusText(invoice.payment_status)}
                    variant="light"
                />
            </td>
            <td className="px-4 py-4 whitespace-nowrap">
                <InvoiceActionMenu
                    invoice={invoice}
                    onView={onView}
                    onEdit={onEdit}
                    onPrint={onPrint}
                    onDownload={onDownload}
                    onWhatsApp={onWhatsApp}
                    onMore={onMore}
                />
            </td>
        </tr>
    );
});

InvoiceRow.displayName = 'InvoiceRow';

export const InvoiceTable: React.FC<InvoiceTableProps> = ({
    invoices,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
    onView,
    onEdit,
    onPrint,
    onDownload,
    onWhatsApp,
    onMore
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const isAllSelected = invoices.length > 0 && invoices.every(invoice => selectedIds.has(invoice.id));

    // Virtualization setup
    const rowVirtualizer = useVirtualizer({
        count: invoices.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 60, // Estimated row height in pixels
        overscan: 10, // Number of items to render outside visible area
    });

    return (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
            {/* Table Header (Fixed) */}
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-3 text-left w-12">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={onToggleSelectAll}
                                className="w-4 h-4 rounded border-gray-300"
                            />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Invoice #
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Payment
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
            </table>

            {/* Virtualized Table Body */}
            <div
                ref={parentRef}
                className="overflow-auto"
                style={{ height: '600px' }} // Fixed height for scrolling
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative'
                    }}
                >
                    <table className="min-w-full divide-y divide-gray-200">
                        <tbody className="bg-white divide-y divide-gray-200">
                            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                const invoice = invoices[virtualRow.index];
                                return (
                                    <tr
                                        key={invoice.id}
                                        data-index={virtualRow.index}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: `${virtualRow.size}px`,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                                            <table className="min-w-full">
                                                <tbody>
                                                    <InvoiceRow
                                                        invoice={invoice}
                                                        isSelected={selectedIds.has(invoice.id)}
                                                        onToggleSelect={onToggleSelect}
                                                        onView={onView}
                                                        onEdit={onEdit}
                                                        onPrint={onPrint}
                                                        onDownload={onDownload}
                                                        onWhatsApp={onWhatsApp}
                                                        onMore={onMore}
                                                    />
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Empty state */}
            {invoices.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                    No invoices to display
                </div>
            )}
        </div>
    );
};
