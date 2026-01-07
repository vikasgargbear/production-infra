/**
 * usePurchaseList Hook
 * 
 * Extracts state management, data fetching, and actions from PurchaseListHistory.tsx
 * Reduces PurchaseListHistory.tsx from 1,080 lines to ~400 lines (UI only)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { purchasesApi } from '../../../services/api';
import { formatCurrency as formatCurrencyUtil } from '../../../utils/formatters';

// ============================================
// Type Definitions
// ============================================

export interface Purchase {
    id: string;
    purchase_order_id?: string;
    po_number: string;
    supplier_name: string;
    po_date: string;
    total_amount: number;
    payment_status: string;
    po_status: string;
    po_type: string;
    created_at: string;
    expected_delivery_date?: string;
    items_count?: number;
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
    po_status?: string;
    po_type?: string;
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

export const formatDate = (date: string): string => {
    if (!date) return 'N/A';
    try {
        return new Date(date).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return 'Invalid Date';
    }
};

export const getStatusText = (status: string | undefined): string => {
    if (!status) return 'Unknown';

    const statusMap: Record<string, string> = {
        'draft': 'Draft', 'pending': 'Pending', 'approved': 'Approved',
        'ordered': 'Ordered', 'received': 'Received', 'partial': 'Partial',
        'completed': 'Completed', 'cancelled': 'Cancelled',
        'paid': 'Paid', 'unpaid': 'Unpaid',
        'DRAFT': 'Draft', 'PENDING': 'Pending', 'APPROVED': 'Approved',
        'ORDERED': 'Ordered', 'RECEIVED': 'Received', 'PARTIAL': 'Partial',
        'COMPLETED': 'Completed', 'CANCELLED': 'Cancelled',
        'PAID': 'Paid', 'UNPAID': 'Unpaid',
    };

    const normalizedStatus = status.toString().toLowerCase().trim();
    return statusMap[normalizedStatus] || status;
};

// ============================================
// Hook Implementation
// ============================================

export function usePurchaseList(onClose?: () => void) {
    // Core State
    const [purchases, setPurchases] = useState<Purchase[]>([]);
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

    const filteredPurchases = purchases;

    const isAllSelected = useMemo(() =>
        filteredPurchases.length > 0 &&
        filteredPurchases.every(purchase => selectedIds.has(purchase.id)),
        [filteredPurchases, selectedIds]
    );

    const selectedCount = useMemo(() =>
        Array.from(selectedIds).filter(id =>
            filteredPurchases.some(p => p.id === id)
        ).length,
        [selectedIds, filteredPurchases]
    );

    const selectedPurchases = useMemo(() =>
        filteredPurchases.filter(purchase => selectedIds.has(purchase.id)),
        [filteredPurchases, selectedIds]
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
                filteredPurchases.forEach(purchase => next.delete(purchase.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                filteredPurchases.forEach(purchase => next.add(purchase.id));
                return next;
            });
        }
    }, [isAllSelected, filteredPurchases]);

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // ============================================
    // API Actions
    // ============================================

    const fetchPurchases = useCallback(async (page = 1, filters: FilterOptions = {}) => {
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

            const response = await purchasesApi.getOrders(searchParams);

            if (response.data) {
                const purchaseOrders = response.data.purchase_orders || response.data.data || [];

                const transformedPurchases = purchaseOrders.map((po: any) => ({
                    id: po.purchase_order_id?.toString() || po.po_number,
                    purchase_order_id: po.purchase_order_id,
                    po_number: po.po_number,
                    supplier_name: po.supplier_name || 'Unknown Supplier',
                    po_date: po.po_date || po.created_at,
                    total_amount: po.total_amount || 0,
                    payment_status: po.payment_status || 'pending',
                    po_status: po.po_status || 'draft',
                    po_type: po.po_type || 'standard',
                    created_at: po.created_at,
                    expected_delivery_date: po.expected_delivery_date,
                    items_count: po.items_count || 0
                }));

                setPurchases(transformedPurchases);
                setPagination({
                    total: response.data.total || purchaseOrders.length,
                    page: page,
                    per_page: pagination.per_page,
                    total_pages: Math.ceil((response.data.total || purchaseOrders.length) / pagination.per_page)
                });
            } else {
                setError('Failed to fetch purchase orders');
            }
        } catch (err) {
            setError('Failed to fetch purchase orders. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [pagination.per_page]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setRefreshSuccess(false);

        try {
            await fetchPurchases(pagination.page);
            setRefreshSuccess(true);
            setTimeout(() => setRefreshSuccess(false), 2000);
        } finally {
            setRefreshing(false);
        }
    }, [fetchPurchases, pagination.page]);

    // ============================================
    // Filter Actions
    // ============================================

    const handleFilterChange = useCallback((filters: FilterOptions) => {
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            ...filters
        };
        fetchPurchases(1, searchParams);
    }, [searchQuery, filterStatus, fetchPurchases]);

    const handleSearchChange = useCallback((query: string) => {
        setSearchQuery(query);
        const timeoutId = setTimeout(() => {
            const searchParams = {
                search: query,
                payment_status: filterStatus === 'all' ? undefined : filterStatus
            };
            fetchPurchases(1, searchParams);
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [filterStatus, fetchPurchases]);

    const handleStatusChange = useCallback((status: string) => {
        setFilterStatus(status);
        const searchParams = {
            search: searchQuery,
            payment_status: status === 'all' ? undefined : status
        };
        fetchPurchases(1, searchParams);
    }, [searchQuery, fetchPurchases]);

    const handleDateChange = useCallback((newDateFilter: string) => {
        setDateFilter(newDateFilter);
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus,
            dateFilter: newDateFilter
        };
        fetchPurchases(1, searchParams);
    }, [searchQuery, filterStatus, fetchPurchases]);

    const handlePageChange = useCallback((page: number) => {
        const searchParams = {
            search: searchQuery,
            payment_status: filterStatus === 'all' ? undefined : filterStatus
        };
        fetchPurchases(page, searchParams);
    }, [searchQuery, filterStatus, fetchPurchases]);

    // ============================================
    // Export Actions
    // ============================================

    const generateCSVData = useCallback((data: Purchase[]) => {
        const headers = [
            'PO Number', 'Supplier', 'Date', 'Expected Delivery',
            'Amount', 'Status', 'Payment Status', 'Type'
        ];

        const rows = data.map(po => [
            po.po_number,
            po.supplier_name,
            formatDate(po.po_date),
            po.expected_delivery_date ? formatDate(po.expected_delivery_date) : 'N/A',
            po.total_amount,
            getStatusText(po.po_status),
            getStatusText(po.payment_status),
            po.po_type
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
            const csvData = generateCSVData(purchases);
            downloadCSV(csvData, `purchases-export-${new Date().toISOString().split('T')[0]}.csv`);
            setExportSuccess(true);
            setTimeout(() => setExportSuccess(false), 3000);
        } finally {
            setExporting(false);
        }
    }, [purchases, generateCSVData, downloadCSV]);

    const exportSelectedPDF = useCallback(async () => {
        if (selectedPurchases.length === 0) return;

        const csvData = generateCSVData(selectedPurchases);
        downloadCSV(csvData, `purchases-${new Date().getTime()}.csv`);
    }, [selectedPurchases, generateCSVData, downloadCSV]);

    const printSelected = useCallback(() => {
        if (selectedPurchases.length === 0) return;

        const html = `<!DOCTYPE html><html><head><title>Print Purchase Orders</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Purchase Orders Report</h2>
      <table><thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>
      ${selectedPurchases.map(po => `<tr><td>${po.po_number}</td><td>${formatDate(po.po_date)}</td><td>${po.supplier_name}</td><td>${formatCurrency(po.total_amount)}</td><td>${getStatusText(po.po_status)}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    }, [selectedPurchases]);

    const whatsappSelected = useCallback(() => {
        if (selectedPurchases.length === 0) return;

        const message = encodeURIComponent(
            `Purchase Orders Report:\n\n${selectedPurchases.map(po =>
                `${po.po_number} - ${formatDate(po.po_date)} - ${po.supplier_name} - ${formatCurrency(po.total_amount)} (${getStatusText(po.po_status)})`
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    }, [selectedPurchases]);

    // ============================================
    // Keyboard Shortcuts
    // ============================================

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && onClose) {
                onClose();
                return;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Initial fetch
    useEffect(() => {
        fetchPurchases();
    }, []);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        purchases,
        filteredPurchases,
        loading,
        error,
        pagination,

        // Selection
        selectedIds,
        selectedCount,
        selectedPurchases,
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
        fetchPurchases,
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

export default usePurchaseList;
