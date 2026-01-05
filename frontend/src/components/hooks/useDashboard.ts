/**
 * useDashboard Hook
 * 
 * Extracts all state management and data fetching logic from Dashboard.tsx
 * Reduces Dashboard.tsx from 1,370 lines to ~800 lines (UI only)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Package, DollarSign, ShoppingCart, AlertCircle,
    TrendingUp, TrendingDown, Percent, RefreshCw, FileText
} from 'lucide-react';
import { dashboardApi, invoiceAPI, productsApi, customersApi } from '../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface DashboardStats {
    totalRevenue: number;
    totalOrders: number;
    totalProducts: number;
    totalCustomers: number;
    expiringSoon: number;
    pendingPayments: number;
    stockValue: number;
    lowStockItems: number;
    dailySales: number;
    monthlyGrowth: number;
    customerRetention: number;
    averageOrderValue: number;
    profitMargin: number;
    inventoryTurnover: number;
    prescriptionCount: number;
    returnRate: number;
}

export interface SalesDataPoint {
    month: string;
    revenue: number;
    orders: number;
}

export interface ProductCategory {
    name: string;
    value: number;
    color: string;
}

export interface Order {
    id: string;
    customer: string;
    amount: number;
    status: string;
    date: string;
}

export interface Alert {
    id: number;
    type: 'stock' | 'expiry' | 'order' | 'payment';
    message: string;
    severity: 'high' | 'medium' | 'low';
    timestamp: string;
    read: boolean;
}

export interface CustomKPI {
    id: number;
    name: string;
    value: string;
    icon: React.ElementType;
    color: string;
    trend: string;
}

export interface ChartData {
    revenue: SalesDataPoint[];
    orders: SalesDataPoint[];
    profit: SalesDataPoint[];
    customers: SalesDataPoint[];
}

export type AlertFilter = 'all' | 'stock' | 'expiry' | 'order' | 'payment';
export type OrderFilter = 'all' | 'completed' | 'pending' | 'cancelled';
export type ChartTimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ChartType = 'line' | 'bar' | 'area';
export type SelectedChart = 'revenue' | 'orders' | 'profit' | 'customers';
export type PanelType = 'alerts' | 'orders' | 'chart' | null;

export interface OrderSort {
    field: 'date' | 'amount';
    direction: 'asc' | 'desc';
}

// ============================================
// Default Values
// ============================================

const defaultStats: DashboardStats = {
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    expiringSoon: 0,
    pendingPayments: 0,
    stockValue: 0,
    lowStockItems: 0,
    dailySales: 0,
    monthlyGrowth: 0,
    customerRetention: 0,
    averageOrderValue: 0,
    profitMargin: 0,
    inventoryTurnover: 0,
    prescriptionCount: 0,
    returnRate: 0
};

// ============================================
// Helper Functions
// ============================================

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// ============================================
// Hook Implementation
// ============================================

export function useDashboard() {
    // Core Stats
    const [stats, setStats] = useState<DashboardStats>(defaultStats);

    // Data Collections
    const [salesData, setSalesData] = useState<SalesDataPoint[]>([]);
    const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
    const [recentOrders, setRecentOrders] = useState<Order[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [customKPIs, setCustomKPIs] = useState<CustomKPI[]>([]);
    const [chartData, setChartData] = useState<ChartData>({
        revenue: [],
        orders: [],
        profit: [],
        customers: []
    });

    // Loading States
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filter States
    const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
    const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
    const [orderSort, setOrderSort] = useState<OrderSort>({ field: 'date', direction: 'desc' });
    const [searchQuery, setSearchQuery] = useState<string>('');

    // UI States
    const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>('monthly');
    const [selectedChart, setSelectedChart] = useState<SelectedChart>('revenue');
    const [isCustomizingKPIs, setIsCustomizingKPIs] = useState<boolean>(false);
    const [selectedKPIs, setSelectedKPIs] = useState<number[]>([1, 2, 3, 4]);
    const [fabOpen, setFabOpen] = useState<boolean>(false);
    const [panel, setPanel] = useState<PanelType>(null);

    // ============================================
    // Computed Values
    // ============================================

    const filteredOrders = useMemo(() => {
        return recentOrders
            .filter(order => {
                if (orderFilter === 'all') return true;
                return order.status.toLowerCase() === orderFilter;
            })
            .filter(order => {
                if (!searchQuery) return true;
                return (
                    order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    order.id.toLowerCase().includes(searchQuery.toLowerCase())
                );
            })
            .sort((a, b) => {
                if (orderSort.field === 'date') {
                    return orderSort.direction === 'desc'
                        ? new Date(b.date).getTime() - new Date(a.date).getTime()
                        : new Date(a.date).getTime() - new Date(b.date).getTime();
                }
                if (orderSort.field === 'amount') {
                    return orderSort.direction === 'desc'
                        ? b.amount - a.amount
                        : a.amount - b.amount;
                }
                return 0;
            });
    }, [recentOrders, orderFilter, searchQuery, orderSort]);

    const filteredAlerts = useMemo(() => {
        return alerts
            .filter(alert => {
                if (alertFilter === 'all') return true;
                return alert.type === alertFilter;
            })
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [alerts, alertFilter]);

    const unreadAlertCount = useMemo(() => {
        return alerts.filter(a => !a.read).length;
    }, [alerts]);

    // ============================================
    // Alert Actions
    // ============================================

    const markAsRead = useCallback((alertId: number): void => {
        setAlerts(prev => prev.map(alert =>
            alert.id === alertId ? { ...alert, read: true } : alert
        ));
    }, []);

    const deleteAlert = useCallback((alertId: number): void => {
        setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    }, []);

    const markAllAsRead = useCallback((): void => {
        setAlerts(prev => prev.map(alert => ({ ...alert, read: true })));
    }, []);

    // ============================================
    // KPI Helpers
    // ============================================

    const updateCustomKPIs = useCallback((statsData: DashboardStats) => {
        const newKPIs: CustomKPI[] = [
            {
                id: 1,
                name: 'Stock Value',
                value: formatCurrency(statsData.stockValue),
                icon: Package,
                color: 'blue',
                trend: '0%'
            },
            {
                id: 2,
                name: 'Low Stock Items',
                value: statsData.lowStockItems.toString(),
                icon: AlertCircle,
                color: 'red',
                trend: '0'
            },
            {
                id: 3,
                name: 'Daily Sales',
                value: formatCurrency(statsData.dailySales),
                icon: DollarSign,
                color: 'green',
                trend: '0%'
            },
            {
                id: 4,
                name: 'Monthly Growth',
                value: `${statsData.monthlyGrowth}%`,
                icon: TrendingUp,
                color: 'purple',
                trend: '0%'
            },
            {
                id: 5,
                name: 'Profit Margin',
                value: `${statsData.profitMargin}%`,
                icon: Percent,
                color: 'emerald',
                trend: '0%'
            },
            {
                id: 6,
                name: 'Inventory Turnover',
                value: `${statsData.inventoryTurnover}x`,
                icon: RefreshCw,
                color: 'indigo',
                trend: '0x'
            },
            {
                id: 7,
                name: 'Prescriptions',
                value: statsData.prescriptionCount.toString(),
                icon: FileText,
                color: 'amber',
                trend: '0'
            },
            {
                id: 8,
                name: 'Return Rate',
                value: `${statsData.returnRate}%`,
                icon: TrendingDown,
                color: 'rose',
                trend: '0%'
            }
        ];
        setCustomKPIs(newKPIs);
    }, []);

    const updateChartData = useCallback((revenueData: SalesDataPoint[], currentStats: DashboardStats) => {
        setChartData({
            revenue: revenueData,
            orders: revenueData.map(d => ({ ...d, revenue: d.orders })),
            profit: revenueData.map(d => ({ ...d, revenue: d.revenue * (currentStats.profitMargin / 100) })),
            customers: revenueData.map(d => ({ ...d, revenue: Math.floor(d.orders * (currentStats.customerRetention / 100)) }))
        });
    }, []);

    // ============================================
    // Data Fetching
    // ============================================

    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const [
                statsResponse,
                invoicesResponse,
                recentOrdersResponse,
                revenueResponse,
                topProductsResponse,
                inventoryAlertsResponse,
                pendingPaymentsResponse,
                productsResponse,
                customersResponse
            ] = await Promise.all([
                dashboardApi.getStats(),
                invoiceAPI.getAll({ limit: 10 }).catch(() => ({ data: [] })),
                dashboardApi.getRecentOrders(10),
                dashboardApi.getRevenueData('monthly'),
                dashboardApi.getTopProducts(10),
                dashboardApi.getInventoryAlerts(),
                dashboardApi.getPendingPayments(),
                productsApi.getAll().catch(() => ({ data: [] })),
                customersApi.getAll().catch(() => ({ data: [] }))
            ]);

            const backendStats = statsResponse.data || {};
            const invoices = invoicesResponse.data || [];
            const products = productsResponse.data || [];
            const customers = customersResponse.data || [];

            // Calculate stats
            const totalRevenue = invoices.reduce((sum: number, invoice: any) =>
                sum + (invoice.final_amount || 0), 0);

            const today = new Date().toDateString();
            const dailySales = invoices
                .filter((invoice: any) => new Date(invoice.invoice_date).toDateString() === today)
                .reduce((sum: number, invoice: any) => sum + (invoice.final_amount || 0), 0);

            const newStats: DashboardStats = {
                totalRevenue: totalRevenue || backendStats.revenue_this_month || 0,
                totalOrders: invoices.length || backendStats.orders_this_month || 0,
                totalProducts: products.length || backendStats.total_products || 0,
                totalCustomers: customers.length || backendStats.total_customers || 0,
                expiringSoon: backendStats.expiring_soon || 0,
                pendingPayments: pendingPaymentsResponse.data?.summary?.total_receivables || 0,
                stockValue: 0,
                lowStockItems: backendStats.low_stock_products || 0,
                dailySales: dailySales,
                monthlyGrowth: 0,
                customerRetention: 0,
                averageOrderValue: invoices.length > 0 ? totalRevenue / invoices.length : 0,
                profitMargin: 0,
                inventoryTurnover: 0,
                prescriptionCount: 0,
                returnRate: 0
            };

            setStats(newStats);
            updateCustomKPIs(newStats);

            // Process orders
            const allOrders: Order[] = [];
            if (recentOrdersResponse.data && Array.isArray(recentOrdersResponse.data)) {
                const mappedOrders = recentOrdersResponse.data.map((order: any) => ({
                    id: order.order_id || order.id,
                    customer: order.customer_name || 'Unknown Customer',
                    amount: order.final_amount || 0,
                    status: order.order_status === 'confirmed' ? 'Completed' :
                        order.order_status === 'pending' ? 'Pending' : 'Cancelled',
                    date: new Date(order.order_date).toLocaleDateString('en-IN')
                }));
                allOrders.push(...mappedOrders);
            }

            if (invoices && Array.isArray(invoices)) {
                const recentInvoices = invoices.slice(0, 10).map((invoice: any) => ({
                    id: invoice.invoice_number || invoice.invoice_id,
                    customer: invoice.customer_name || 'Unknown Customer',
                    amount: invoice.final_amount || 0,
                    status: invoice.payment_status === 'paid' ? 'Completed' :
                        invoice.payment_status === 'partial' ? 'Pending' : 'Pending',
                    date: new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-IN')
                }));
                allOrders.push(...recentInvoices);
            }

            allOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setRecentOrders(allOrders.slice(0, 15));

            // Process revenue data
            let mappedSalesData: SalesDataPoint[] = [];
            if (revenueResponse.data && Array.isArray(revenueResponse.data)) {
                mappedSalesData = revenueResponse.data.map((item: any) => ({
                    month: item.month || item.period || '',
                    revenue: item.revenue || item.amount || 0,
                    orders: item.orders || item.count || 0
                }));
            }
            setSalesData(mappedSalesData);
            updateChartData(mappedSalesData, newStats);

            // Process product categories
            if (topProductsResponse.data && Array.isArray(topProductsResponse.data)) {
                const categories = topProductsResponse.data.slice(0, 6).map((prod: any, idx: number) => ({
                    name: prod.product_name || prod.name || 'Unknown',
                    value: prod.quantity_sold || prod.sales || 0,
                    color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][idx] || '#6B7280'
                }));
                setProductCategories(categories);
            }

            // Process alerts
            if (inventoryAlertsResponse.data) {
                const alertData = inventoryAlertsResponse.data;
                const newAlerts: Alert[] = [];

                if (alertData.low_stock && Array.isArray(alertData.low_stock)) {
                    alertData.low_stock.slice(0, 5).forEach((item: any, idx: number) => {
                        newAlerts.push({
                            id: idx + 1,
                            type: 'stock',
                            message: `Low stock: ${item.product_name || 'Product'} - ${item.quantity || 0} units left`,
                            severity: (item.quantity || 0) < 10 ? 'high' : 'medium',
                            timestamp: new Date().toISOString(),
                            read: false
                        });
                    });
                }

                if (alertData.expiring_soon && Array.isArray(alertData.expiring_soon)) {
                    alertData.expiring_soon.slice(0, 5).forEach((item: any, idx: number) => {
                        newAlerts.push({
                            id: 100 + idx + 1,
                            type: 'expiry',
                            message: `Expiring soon: ${item.product_name || 'Product'} - ${item.batch_number || 'Batch'}`,
                            severity: 'high',
                            timestamp: new Date().toISOString(),
                            read: false
                        });
                    });
                }

                setAlerts(newAlerts);
            }

        } catch (err) {
            console.error('Dashboard data fetch error:', err);
            setError('Failed to load dashboard data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [updateCustomKPIs, updateChartData]);

    const refreshData = useCallback(async () => {
        setRefreshing(true);
        await fetchDashboardData();
        setRefreshing(false);
    }, [fetchDashboardData]);

    // Initial data fetch
    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Stats & Data
        stats,
        salesData,
        productCategories,
        recentOrders,
        alerts,
        customKPIs,
        chartData,

        // Computed
        filteredOrders,
        filteredAlerts,
        unreadAlertCount,

        // Loading States
        loading,
        error,
        refreshing,

        // Filters
        alertFilter,
        setAlertFilter,
        orderFilter,
        setOrderFilter,
        orderSort,
        setOrderSort,
        searchQuery,
        setSearchQuery,

        // UI State
        chartTimeRange,
        setChartTimeRange,
        selectedChart,
        setSelectedChart,
        isCustomizingKPIs,
        setIsCustomizingKPIs,
        selectedKPIs,
        setSelectedKPIs,
        fabOpen,
        setFabOpen,
        panel,
        setPanel,

        // Actions
        fetchDashboardData,
        refreshData,
        markAsRead,
        deleteAlert,
        markAllAsRead
    };
}

export default useDashboard;
