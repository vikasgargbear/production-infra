/**
 * useInvoiceList Hook
 * 
 * Extracts state management, data fetching, and actions from InvoiceList.tsx
 * Reduces InvoiceList.tsx from 1,155 lines to ~400 lines (UI only)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoicesApi } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface Invoice {
    id: string;
    invoice_id?: string;
    invoice_number: string;
    invoiceNumber?: string;
    customer_name: string;
    customerName?: string;
    invoice_date: string;
    date?: string;
    dueDate?: string;
    final_amount: number;
    amount?: number;
    invoice_status?: string;
    status?: string;
    payment_status: string;
    paymentStatus?: string;
    items?: number;
    order_number?: string;
    order_date?: string;
}

export interface Pagination {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

export interface FilterOptions {
    search?: string;
    payment_status?: string;
    status?: string;
    dateFilter?: string;
    dateFrom?: string;
    dateTo?: string;
}

// ============================================
// Utility Functions
// ============================================

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export const formatDate = (value: string): string => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
};

export const getStatusText = (status: string | undefined): string => {
    if (!status) return 'Unknown';

    const statusMap: Record<string, string> = {
        'draft': 'Draft', 'sent': 'Sent', 'paid': 'Paid', 'posted': 'Posted',
        'overdue': 'Overdue', 'cancelled': 'Cancelled', 'canceled': 'Cancelled',
        'pending': 'Pending', 'partial': 'Partial',
        'DRAFT': 'Draft', 'SENT': 'Sent', 'PAID': 'Paid', 'POSTED': 'Posted',
        'OVERDUE': 'Overdue', 'CANCELLED': 'Cancelled', 'CANCELED': 'Cancelled',
        'PENDING': 'Pending', 'PARTIAL': 'Partial',
        'null': 'Unknown', 'undefined': 'Unknown', '': 'Unknown',
    };

    const normalizedStatus = status.toString().toLowerCase().trim();
    return statusMap[normalizedStatus] || status;
};

// ============================================
// Hook Implementation
// ============================================

export function useInvoiceList(onClose?: () => void) {
    // Core State
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    // Selection State
    const [selectedIds, setSelectedIds] = useState(new Set<string>());

    // Pagination
    const [pagination, setPagination] = useState<Pagination>({
        total: 0,
        page: 1,
        per_page: 25,
        total_pages: 0
    });

    // UX States
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [refreshSuccess, setRefreshSuccess] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);

    // ============================================
    // Computed Values
    // ============================================

    const filteredInvoices = invoices;

    const isAllSelected = useMemo(() =>
        filteredInvoices.length > 0 &&
        filteredInvoices.every(invoice => selectedIds.has(invoice.id)),
        [filteredInvoices, selectedIds]
    );

    const selectedCount = useMemo(() =>
        Array.from(selectedIds).filter(id =>
            filteredInvoices.some(f => f.id === id)
        ).length,
        [selectedIds, filteredInvoices]
    );

    const selectedInvoices = useMemo(() =>
        filteredInvoices.filter(invoice => selectedIds.has(invoice.id)),
        [filteredInvoices, selectedIds]
    );

    // ============================================
    // Selection Actions
    // ============================================

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        if (isAllSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredInvoices.forEach(invoice => next.delete(invoice.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredInvoices.forEach(invoice => next.add(invoice.id));
                return next;
            });
        }
    }, [isAllSelected, filteredInvoices]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // ============================================
    // API Actions
    // ============================================

    const fetchInvoices = useCallback(async (page = 1, filters: FilterOptions = {}) => {
        setLoading(true);
        setError(null);

        try {
            const searchParams: any = {
                limit: pagination.per_page,
                offset: (page - 1) * pagination.per_page,
                ...filters
            };

            if (filters.search?.trim()) {
                searchParams.search = filters.search.trim();
            }

            const response = await invoicesApi.getAll(searchParams);
            const responseData = response?.data || response;

            if (responseData?.invoices || responseData?.success) {
                const invoicesData = responseData.invoices || responseData.data?.invoices || [];
                const transformedInvoices = invoicesData.map((invoice: any) => ({
                    id: invoice.invoice_id?.toString() || invoice.invoice_number,
                    invoice_id: invoice.invoice_id,
                    invoice_number: invoice.invoice_number,
                    invoiceNumber: invoice.invoice_number,
                    customer_name: invoice.customer_name,
                    customerName: invoice.customer_name,
                    invoice_date: invoice.invoice_date,
                    date: invoice.invoice_date,
                    final_amount: invoice.final_amount,
                    amount: invoice.final_amount,
                    invoice_status: invoice.invoice_status,
                    status: invoice.invoice_status,
                    payment_status: invoice.payment_status,
                    paymentStatus: invoice.payment_status,
                    order_number: invoice.order_number,
                    order_date: invoice.order_date,
                    items: 0
                }));

                setInvoices(transformedInvoices);
                const total = responseData.total || responseData.data?.total || 0;
                setPagination({
                    total: total,
                    page: page,
                    per_page: pagination.per_page,
                    total_pages: Math.ceil(total / pagination.per_page)
                });
            } else {
                setError(responseData?.error?.message || 'Failed to fetch invoices');
            }
        } catch (err) {
            setError('Failed to fetch invoices. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [pagination.per_page]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setRefreshSuccess(false);

        try {
            await fetchInvoices(pagination.page);
            setRefreshSuccess(true);
            setTimeout(() => setRefreshSuccess(false), 2000);
        } finally {
            setRefreshing(false);
        }
    }, [fetchInvoices, pagination.page]);

    // ============================================
    // Filter Actions
    // ============================================

    const handleFilterChange = useCallback((filters: FilterOptions) => {
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            ...filters
        };
        fetchInvoices(1, searchParams);
    }, [searchQuery, filterStatus, fetchInvoices]);

    const handleSearchChange = useCallback((query: string) => {
        setSearchQuery(query);
        const timeoutId = setTimeout(() => {
            const searchParams = {
                search: query,
                payment_status: filterStatus === 'all' ? undefined : filterStatus
            };
            fetchInvoices(1, searchParams);
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [filterStatus, fetchInvoices]);

    const handleStatusChange = useCallback((status: string) => {
        setFilterStatus(status);
        const searchParams = {
            search: searchQuery,
            payment_status: status === 'all' ? undefined : status
        };
        fetchInvoices(1, searchParams);
    }, [searchQuery, fetchInvoices]);

    const handleDateChange = useCallback((newDateFilter: string) => {
        setDateFilter(newDateFilter);
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            dateFilter: newDateFilter
        };
        fetchInvoices(1, searchParams);
    }, [searchQuery, filterStatus, fetchInvoices]);

    const handlePageChange = useCallback((page: number) => {
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus
        };
        fetchInvoices(page, searchParams);
    }, [searchQuery, filterStatus, fetchInvoices]);

    // ============================================
    // Export Actions
    // ============================================

    const generateCSVData = useCallback((data: Invoice[]) => {
        const headers = [
            'Invoice Number', 'Customer Name', 'Date', 'Due Date',
            'Amount', 'Status', 'Payment Status'
        ];

        const rows = data.map(invoice => [
            invoice.invoice_number || invoice.invoiceNumber || '',
            invoice.customer_name || invoice.customerName || '',
            invoice.invoice_date || invoice.date || '',
            invoice.dueDate || '',
            invoice.final_amount || invoice.amount || 0,
            invoice.invoice_status || invoice.status || '',
            invoice.payment_status || invoice.paymentStatus || ''
        ]);

        return [headers, ...rows];
    }, []);

    const downloadCSV = useCallback((data: any[][], filename: string) => {
        const csvContent = data.map(row =>
            row.map(field =>
                typeof field === 'string' && field.includes(',')
                    ? `"${field}"`
                    : field
            ).join(',')
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, []);

    const handleExportAll = useCallback(async () => {
        setExporting(true);
        setExportSuccess(false);

        try {
            const csvData = generateCSVData(invoices);
            downloadCSV(csvData, `invoices-export-${new Date().toISOString().split('T')[0]}.csv`);
            setExportSuccess(true);
            setTimeout(() => setExportSuccess(false), 3000);
        } finally {
            setExporting(false);
        }
    }, [invoices, generateCSVData, downloadCSV]);

    const exportSelectedPDF = useCallback(async () => {
        if (selectedInvoices.length === 0) return;

        if (selectedInvoices.length === 1) {
            // Single invoice - would call download handler
            return selectedInvoices[0];
        }

        // Multiple - export as CSV
        const csvData = generateCSVData(selectedInvoices);
        downloadCSV(csvData, `invoices-${new Date().getTime()}.csv`);
    }, [selectedInvoices, generateCSVData, downloadCSV]);

    const printSelected = useCallback(() => {
        if (selectedInvoices.length === 0) return;

        const html = `<!DOCTYPE html><html><head><title>Print Invoices</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Invoices Report</h2>
      <table><thead><tr><th>Invoice #</th><th>Date</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${selectedInvoices.map(invoice => `<tr><td>${invoice.invoice_number}</td><td>${formatDate(invoice.invoice_date)}</td><td>${invoice.customer_name || 'N/A'}</td><td>${formatCurrency(invoice.final_amount || 0)}</td><td>${getStatusText(invoice.payment_status)}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    }, [selectedInvoices]);

    const whatsappSelected = useCallback(() => {
        if (selectedInvoices.length === 0) return;

        const message = encodeURIComponent(
            `Invoices Report:\n\n${selectedInvoices.map(invoice =>
                `${invoice.invoice_number} - ${formatDate(invoice.invoice_date)} - ${invoice.customer_name} - ${formatCurrency(invoice.final_amount || 0)} (${getStatusText(invoice.payment_status)})`
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    }, [selectedInvoices]);

    // ============================================
    // Keyboard Shortcuts
    // ============================================

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && onClose) {
                onClose();
                return;
            }

            if (event.altKey && event.key.toLowerCase() === 'r' || event.key === 'F5') {
                event.preventDefault();
                handleRefresh();
                return;
            }

            if (event.altKey && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                handleExportAll();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p' && selectedCount > 0) {
                event.preventDefault();
                printSelected();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
                event.preventDefault();
                document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus();
                return;
            }

            if (event.altKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                toggleSelectAll();
                return;
            }

            if (event.key === 'PageUp' && pagination.page > 1) {
                event.preventDefault();
                handlePageChange(pagination.page - 1);
                return;
            }

            if (event.key === 'PageDown' && pagination.page < pagination.total_pages) {
                event.preventDefault();
                handlePageChange(pagination.page + 1);
                return;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, pagination, selectedCount, toggleSelectAll, handleRefresh, handleExportAll, printSelected, handlePageChange]);

    // Initial fetch
    useEffect(() => {
        fetchInvoices();
    }, []);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        invoices,
        filteredInvoices,
        loading,
        error,
        pagination,

        // Selection
        selectedIds,
        selectedCount,
        selectedInvoices,
        isAllSelected,
        toggleSelect,
        toggleSelectAll,
        clearSelection,

        // Filters
        searchQuery,
        setSearchQuery: handleSearchChange,
        filterStatus,
        setFilterStatus: handleStatusChange,
        dateFilter,
        setDateFilter: handleDateChange,
        showFilters,
        setShowFilters,
        handleFilterChange,

        // Actions
        fetchInvoices,
        handleRefresh,
        handlePageChange,

        // Export
        handleExportAll,
        exportSelectedPDF,
        printSelected,
        whatsappSelected,

        // UX States
        refreshing,
        exporting,
        refreshSuccess,
        exportSuccess,

        // Utilities
        formatCurrency,
        formatDate,
        getStatusText
    };
}

export default useInvoiceList;
