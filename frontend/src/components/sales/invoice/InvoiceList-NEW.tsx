import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, Plus, Calendar } from 'lucide-react';
import { Button, Pagination } from '../../global';
import CancelInvoiceModal from '../modals/CancelInvoiceModal';
import {
    InvoiceFilters,
    InvoiceTable,
    InvoiceBulkActions
} from './components';
import {
    useInvoiceData,
    useInvoiceFilters,
    useInvoiceActions
} from './hooks';
import type { Invoice } from './types/invoiceTypes';

interface InvoiceListProps {
    onClose?: () => void;
}

const InvoiceList: React.FC<InvoiceListProps> = ({ onClose }) => {
    // Use custom hooks
    const {
        invoices,
        loading,
        error,
        pagination,
        fetchInvoices,
        refreshing,
        refreshSuccess,
        handleRefresh
    } = useInvoiceData();

    const {
        searchQuery,
        filterStatus,
        handleSearchChange,
        handleStatusChange
    } = useInvoiceFilters();

    const {
        selectedIds,
        exporting,
        exportSuccess,
        toggleSelect,
        toggleSelectAll,
        clearSelection,
        handleExportAll,
        exportSelectedPDF,
        printSelected,
        whatsappSelected,
        handleViewInvoice,
        handleEditInvoice,
        handlePrintInvoice,
        handleDownloadInvoice,
        handleMoreOptions
    } = useInvoiceActions();

    // Cancel modal state
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [invoiceToCancel, setInvoiceToCancel] = useState<any>(null);

    const handleCancelInvoice = (invoice: Invoice) => {
        setInvoiceToCancel({
            invoice_id: invoice.invoice_id || invoice.id,
            invoice_number: invoice.invoice_number,
            customer_name: invoice.customer_name || '',
            total_amount: invoice.final_amount || 0,
            amount_paid: invoice.amount_paid || 0,
            invoice_status: invoice.invoice_status || ''
        });
        setCancelModalOpen(true);
    };

    const handleCancelSuccess = () => {
        setCancelModalOpen(false);
        setInvoiceToCancel(null);
        handleRefresh();
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && onClose) {
                onClose();
                return;
            }

            if ((event.altKey && event.key.toLowerCase() === 'r') || event.key === 'F5') {
                event.preventDefault();
                handleRefresh();
                return;
            }

            if (event.altKey && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                handleExportAll(invoices);
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && selectedIds.size > 0) {
                event.preventDefault();
                printSelected(invoices);
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
                return;
            }

            if (event.altKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                toggleSelectAll(invoices);
                return;
            }

            if (event.key === 'PageUp' && pagination.page > 1) {
                event.preventDefault();
                fetchInvoices(pagination.page - 1);
                return;
            }

            if (event.key === 'PageDown' && pagination.page < pagination.total_pages) {
                event.preventDefault();
                fetchInvoices(pagination.page + 1);
                return;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, pagination, selectedIds, invoices]);

    const selectedCount = Array.from(selectedIds).filter(id =>
        invoices.some(inv => inv.id === id)
    ).length;

    return (
        <div className="h-full bg-white flex flex-col">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            {pagination.total} total invoices
                        </p>
                    </div>
                    <div className="flex items-center space-x-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </Button>
                        {refreshSuccess && (
                            <span className="text-sm text-green-600">✓ Updated</span>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportAll(invoices)}
                            disabled={exporting}
                        >
                            <Download className="w-4 h-4 mr-2" />
                            {exporting ? 'Exporting...' : 'Export'}
                        </Button>
                        {exportSuccess && (
                            <span className="text-sm text-green-600">✓ Exported</span>
                        )}
                        <Button variant="primary" size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            New Invoice
                        </Button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 border-b border-gray-200">
                <InvoiceFilters
                    searchQuery={searchQuery}
                    filterStatus={filterStatus}
                    onSearchChange={(query) => handleSearchChange(query, (filters) => fetchInvoices(1, filters))}
                    onStatusChange={(status) => handleStatusChange(status, searchQuery, (filters) => fetchInvoices(1, filters))}
                />
            </div>

            {/* Bulk Actions */}
            {selectedCount > 0 && (
                <div className="px-6 pt-4">
                    <InvoiceBulkActions
                        selectedCount={selectedCount}
                        onMarkPaid={() => alert('Mark as paid')}
                        onSendReminder={() => alert('Send reminder')}
                        onExport={() => exportSelectedPDF(invoices)}
                        onClear={clearSelection}
                    />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-auto px-6">
                {loading && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-gray-500">Loading invoices...</div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-red-500">{error}</div>
                    </div>
                )}

                {!loading && !error && invoices.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64">
                        <Calendar className="w-16 h-16 text-gray-300 mb-4" />
                        <p className="text-gray-500 text-lg font-medium">No invoices found</p>
                        <p className="text-gray-400 text-sm mt-1">Create your first invoice to get started</p>
                    </div>
                )}

                {!loading && !error && invoices.length > 0 && (
                    <InvoiceTable
                        invoices={invoices}
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onToggleSelectAll={() => toggleSelectAll(invoices)}
                        onView={handleViewInvoice}
                        onEdit={handleEditInvoice}
                        onPrint={handlePrintInvoice}
                        onDownload={handleDownloadInvoice}
                        onWhatsApp={(invoice) => {
                            toggleSelect(invoice.id);
                            setTimeout(() => whatsappSelected(invoices), 0);
                        }}
                        onMore={handleMoreOptions}
                        onCancel={handleCancelInvoice}
                    />
                )}
            </div>

            {/* Pagination */}
            {!loading && invoices.length > 0 && (
                <div className="border-t border-gray-200 px-6 py-4">
                    <Pagination
                        currentPage={pagination.page}
                        totalPages={pagination.total_pages}
                        totalItems={pagination.total}
                        itemsPerPage={pagination.per_page}
                        onPageChange={(page) => fetchInvoices(page)}
                    />
                </div>
            )}

            {/* Keyboard Shortcuts Help */}
            <div className="border-t border-gray-100 px-6 py-2 bg-gray-50">
                <div className="flex items-center justify-center space-x-6 text-xs text-gray-500">
                    <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">ESC</kbd> Close</span>
                    <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Alt+R</kbd> Refresh</span>
                    <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Alt+E</kbd> Export</span>
                    <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Ctrl+F</kbd> Search</span>
                    <span><kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded">Alt+A</kbd> Select All</span>
                </div>
            </div>

            {/* Cancel Invoice Modal */}
            <CancelInvoiceModal
                isOpen={cancelModalOpen}
                onClose={() => { setCancelModalOpen(false); setInvoiceToCancel(null); }}
                invoice={invoiceToCancel}
                onCancelled={handleCancelSuccess}
            />
        </div>
    );
};

export default InvoiceList;
