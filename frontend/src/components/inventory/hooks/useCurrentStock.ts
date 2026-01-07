/**
 * useCurrentStock Hook
 * 
 * Extracted from CurrentStock.tsx (1,188 lines)
 * Handles stock data fetching, filtering, sorting, export, and pagination.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import apiClient from '../../../services/api/apiClient';
import type { BaseStockItem, SortConfig } from '../types';
import {
    validateProductData,
    transformToStockItem
} from '../utils/stockValidation';
import jsPDF from 'jspdf';

// Types
export interface StockItem extends BaseStockItem {
    product_type?: string;
    product_class?: string;
    drug_schedule?: string;
    prescription_required?: boolean;
    is_narcotic?: boolean;
    is_controlled_substance?: boolean;
    stock_status?: 'out_of_stock' | 'low_stock' | 'normal';
    storage_conditions?: string;
    requires_cold_chain?: boolean;
    batches?: any[];
    batch_count?: number;
    // Alias properties for compatibility
    available_stock?: number;
    reserved_stock?: number;
}

export interface MoreFilters {
    stockStatus: string;
    expiryPeriod: string;
    packType: string;
}

export interface UseCurrentStockReturn {
    // Data
    stockData: StockItem[];
    filteredData: StockItem[];
    selectedProduct: StockItem | null;
    editingProduct: StockItem | null;

    // State
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    refreshing: boolean;
    hasMore: boolean;

    // Filters
    searchQuery: string;
    selectedCategory: string;
    selectedLocation: string;
    showLowStock: boolean;
    showExpiring: boolean;
    dateFilter: string;
    sortConfig: SortConfig;
    moreFilters: MoreFilters;
    showMoreFilters: boolean;
    selectedIds: Set<number>;

    // Modals
    showDetails: boolean;
    showEditModal: boolean;
    showHelpModal: boolean;

    // Actions
    setSearchQuery: (q: string) => void;
    setSelectedCategory: (c: string) => void;
    setSelectedLocation: (l: string) => void;
    setShowLowStock: (v: boolean) => void;
    setShowExpiring: (v: boolean) => void;
    setDateFilter: (f: string) => void;
    setMoreFilters: React.Dispatch<React.SetStateAction<MoreFilters>>;
    setShowMoreFilters: (v: boolean) => void;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
    setShowHelpModal: (v: boolean) => void;

    handleRefresh: () => Promise<void>;
    handleSort: (key: string) => void;
    handleViewDetails: (product: StockItem) => void;
    handleEdit: (product: StockItem) => void;
    closeDetails: () => void;
    closeEditModal: () => void;

    // Export actions
    handleExport: () => void;
    exportSelectedPDF: () => void;
    printSelected: () => void;
    whatsappSelected: () => void;

    // Pagination
    loadMoreData: () => void;
    handleScroll: (e: React.UIEvent<HTMLElement>) => void;

    // Helpers
    formatDate: (date: string | Date | undefined) => string;
    getStockStatus: (item: StockItem) => { label: string; color: string };
    selectedCount: number;
}

export function useCurrentStock(): UseCurrentStockReturn {
    // Core data state
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [stockData, setStockData] = useState<StockItem[]>([]);
    const [allProducts, setAllProducts] = useState<StockItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedLocation, setSelectedLocation] = useState('all');
    const [showLowStock, setShowLowStock] = useState(false);
    const [showExpiring, setShowExpiring] = useState(false);
    const [dateFilter, setDateFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'product_name', direction: 'asc' });
    const [moreFilters, setMoreFilters] = useState<MoreFilters>({
        stockStatus: 'all',
        expiryPeriod: 'all',
        packType: 'all'
    });
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Modal state
    const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<StockItem | null>(null);
    const [showHelpModal, setShowHelpModal] = useState(false);

    // Load stock data
    const loadStockData = useCallback(async (page = 0, reset = true) => {
        if (page === 0) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            setError(null);
            const response = await apiClient.get('/inventory/stock/current', {
                params: { limit: 100, skip: page * 100 }
            });

            let products: any[] = [];
            if (response?.data?.stocks && Array.isArray(response.data.stocks)) {
                products = response.data.stocks.map((stock: any) => ({
                    product_id: stock.product_id,
                    product_name: stock.product_name,
                    product_code: stock.product_code,
                    generic_name: stock.generic_name,
                    category: stock.category || '',
                    product_type: stock.product_type || 'standard',
                    product_class: stock.product_class || 'medicine',
                    manufacturer: stock.manufacturer,
                    brand: stock.brand,
                    hsn_code: stock.hsn_code,
                    unit: stock.unit || 'Units',
                    total_quantity_available: stock.total_quantity || 0,
                    total_quantity_reserved: stock.allocated_quantity || 0,
                    mrp_per_unit: stock.mrp || 0,
                    cost_per_unit: stock.average_cost || 0,
                    sale_price_per_unit: stock.sale_price_per_unit || 0,
                    reorder_level: stock.reorder_level || 0,
                    low_stock: stock.is_below_minimum || stock.is_below_reorder || false,
                    expiry_alert: stock.near_expiry_batches > 0,
                    total_batches: stock.total_batches || 0,
                    expired_batches: stock.expired_batches || 0,
                    near_expiry_batches: stock.near_expiry_batches || 0,
                    total_value: stock.total_value || 0,
                    batches: []
                }));
            } else if (response?.data && Array.isArray(response.data)) {
                products = response.data;
            }

            setHasMore(products.length === 100);

            const validProducts = products.filter(validateProductData);
            const transformedData = validProducts.map(transformToStockItem<StockItem>);

            if (reset || page === 0) {
                setAllProducts(transformedData);
                setStockData(transformedData);
            } else {
                setAllProducts(prev => [...prev, ...transformedData]);
                setStockData(prev => [...prev, ...transformedData]);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load stock data');
            if (page === 0) {
                setStockData([]);
                setAllProducts([]);
            }
        } finally {
            if (page === 0) {
                setLoading(false);
            } else {
                setLoadingMore(false);
            }
        }
    }, []);

    // Filtered data
    const filteredData = useMemo(() => {
        let filtered = stockData.filter(item => item && typeof item === 'object');

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item =>
                item.product_name?.toLowerCase().includes(query) ||
                item.product_code?.toLowerCase().includes(query) ||
                item.generic_name?.toLowerCase().includes(query) ||
                item.manufacturer?.toLowerCase().includes(query)
            );
        }

        // Category filter
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(item => item.category === selectedCategory);
        }

        // Location filter
        if (selectedLocation !== 'all') {
            filtered = filtered.filter(item => (item as any).storage_location === selectedLocation);
        }

        // Low stock filter
        if (showLowStock) {
            filtered = filtered.filter(item => item.low_stock || item.total_quantity_available === 0);
        }

        // Expiring filter
        if (showExpiring) {
            filtered = filtered.filter(item => item.expiry_alert);
        }

        // More filters
        if (moreFilters.stockStatus !== 'all') {
            filtered = filtered.filter(item => {
                if (moreFilters.stockStatus === 'out') return item.total_quantity_available === 0;
                if (moreFilters.stockStatus === 'low') return item.low_stock && item.total_quantity_available > 0;
                if (moreFilters.stockStatus === 'normal') return !item.low_stock && item.total_quantity_available > 0;
                return true;
            });
        }

        // Sorting
        filtered.sort((a, b) => {
            const aVal = a[sortConfig.key as keyof StockItem] ?? '';
            const bVal = b[sortConfig.key as keyof StockItem] ?? '';

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }

            const aNum = Number(aVal) || 0;
            const bNum = Number(bVal) || 0;
            return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        });

        return filtered;
    }, [stockData, searchQuery, selectedCategory, selectedLocation, showLowStock, showExpiring, moreFilters, sortConfig]);

    const selectedCount = useMemo(() => {
        return Array.from(selectedIds).filter(id =>
            filteredData.some(item => item.product_id === id)
        ).length;
    }, [selectedIds, filteredData]);

    // Load on mount
    useEffect(() => {
        loadStockData(0, true);
    }, [loadStockData]);

    // Handlers
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            await loadStockData(0, true);
        } catch {
            setError('Failed to refresh data');
        } finally {
            setRefreshing(false);
        }
    }, [loadStockData]);

    const loadMoreData = useCallback(() => {
        if (!loadingMore && hasMore) {
            const nextPage = Math.floor(allProducts.length / 100);
            setCurrentPage(nextPage);
            loadStockData(nextPage, false);
        }
    }, [loadingMore, hasMore, allProducts.length, loadStockData]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = target;
        const bottom = scrollHeight - scrollTop <= clientHeight + 100;

        if (bottom && !loadingMore && hasMore) {
            loadMoreData();
        }
    }, [loadingMore, hasMore, loadMoreData]);

    const handleSort = useCallback((key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    }, []);

    const handleViewDetails = useCallback((product: StockItem) => {
        setSelectedProduct(product);
        setShowDetails(true);
    }, []);

    const handleEdit = useCallback((product: StockItem) => {
        setEditingProduct(product);
        setShowEditModal(true);
    }, []);

    const closeDetails = useCallback(() => {
        setShowDetails(false);
    }, []);

    const closeEditModal = useCallback(() => {
        setShowEditModal(false);
        setEditingProduct(null);
    }, []);

    const formatDate = useCallback((date: string | Date | undefined): string => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }, []);

    const getStockStatus = useCallback((item: StockItem): { label: string; color: string } => {
        if (item.total_quantity_available === 0) return { label: 'Out of Stock', color: 'red' };
        if (item.low_stock) return { label: 'Low Stock', color: 'yellow' };
        return { label: 'In Stock', color: 'green' };
    }, []);

    // Export functions
    const handleExport = useCallback(() => {
        const itemsToExport = selectedIds.size > 0
            ? filteredData.filter(item => selectedIds.has(item.product_id))
            : filteredData;

        if (itemsToExport.length === 0) return;

        const csvData = itemsToExport.map(item => ({
            'Product Name': item.product_name,
            'Product Code': item.product_code,
            'Category': item.category,
            'Quantity Available': item.total_quantity_available,
            'Unit': item.unit,
            'Reorder Level': item.reorder_level,
            'MRP': item.mrp_per_unit,
            'Status': item.total_quantity_available === 0 ? 'Out of Stock' : (item.low_stock ? 'Low Stock' : 'In Stock')
        }));

        const headers = Object.keys(csvData[0]);
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => headers.map(h => `"${(row as any)[h] || ''}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `current-stock-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }, [filteredData, selectedIds]);

    const exportSelectedPDF = useCallback(() => {
        const itemsToExport = selectedIds.size > 0
            ? filteredData.filter(item => selectedIds.has(item.product_id))
            : filteredData;

        if (itemsToExport.length === 0) return;

        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('Current Stock Report', 20, 20);

        let yPos = 40;
        doc.setFontSize(10);

        itemsToExport.slice(0, 50).forEach(item => {
            const text = `${item.product_name} | ${item.total_quantity_available} ${item.unit}`;
            doc.text(text, 20, yPos);
            yPos += 8;
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
        });

        doc.save('current-stock-export.pdf');
    }, [filteredData, selectedIds]);

    const printSelected = useCallback(() => {
        const itemsToPrint = selectedIds.size > 0
            ? filteredData.filter(item => selectedIds.has(item.product_id))
            : filteredData;

        const html = `<!DOCTYPE html><html><head><title>Print Stock</title>
            <style>body{font-family:Arial;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;}</style>
            </head><body>
            <h2>Current Stock Report</h2>
            <table><thead><tr><th>Product</th><th>Qty Available</th><th>Unit</th><th>Status</th></tr></thead>
            <tbody>
            ${itemsToPrint.map(item => `<tr><td>${item.product_name}</td><td>${item.total_quantity_available}</td><td>${item.unit}</td><td>${getStockStatus(item).label}</td></tr>`).join('')}
            </tbody></table></body></html>`;

        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.focus();
        w.print();
    }, [filteredData, selectedIds, getStockStatus]);

    const whatsappSelected = useCallback(() => {
        const items = selectedIds.size > 0
            ? filteredData.filter(item => selectedIds.has(item.product_id))
            : filteredData.slice(0, 20);

        if (items.length === 0) return;

        const message = encodeURIComponent(
            `Current Stock Report:\n\n${items.map(item =>
                `${item.product_name} - ${item.total_quantity_available} ${item.unit}`
            ).join('\n')}`
        );

        window.open(`https://wa.me/?text=${message}`, '_blank');
    }, [filteredData, selectedIds]);

    return {
        stockData,
        filteredData,
        selectedProduct,
        editingProduct,
        loading,
        loadingMore,
        error,
        refreshing,
        hasMore,
        searchQuery,
        selectedCategory,
        selectedLocation,
        showLowStock,
        showExpiring,
        dateFilter,
        sortConfig,
        moreFilters,
        showMoreFilters,
        selectedIds,
        showDetails,
        showEditModal,
        showHelpModal,
        setSearchQuery,
        setSelectedCategory,
        setSelectedLocation,
        setShowLowStock,
        setShowExpiring,
        setDateFilter,
        setMoreFilters,
        setShowMoreFilters,
        setSelectedIds,
        setShowHelpModal,
        handleRefresh,
        handleSort,
        handleViewDetails,
        handleEdit,
        closeDetails,
        closeEditModal,
        handleExport,
        exportSelectedPDF,
        printSelected,
        whatsappSelected,
        loadMoreData,
        handleScroll,
        formatDate,
        getStockStatus,
        selectedCount
    };
}

export default useCurrentStock;
