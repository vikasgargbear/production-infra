/**
 * Dashboard Type Definitions
 * Extracted from Dashboard.tsx as part of component decomposition
 */

import React from 'react';

// ============================================================================
// Core Data Types
// ============================================================================

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

export interface DashboardOrder {
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

export interface FabAction {
    id: string;
    label: string;
    icon: React.ElementType;
    color: string;
}

export interface ChartData {
    revenue: SalesDataPoint[];
    orders: SalesDataPoint[];
    profit: SalesDataPoint[];
    customers: SalesDataPoint[];
}

export interface OrderSort {
    field: 'date' | 'amount';
    direction: 'asc' | 'desc';
}

// ============================================================================
// Type Aliases
// ============================================================================

export type AlertFilter = 'all' | 'stock' | 'expiry' | 'order' | 'payment';
export type OrderFilter = 'all' | 'pending' | 'completed' | 'cancelled';
export type ChartTimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ChartType = 'area' | 'bar';
export type SelectedChart = 'revenue' | 'orders' | 'profit' | 'customers';
export type PanelType = 'add-sale' | 'create-challan' | 'add-purchase' | 'add-payment' | null;

// ============================================================================
// Component Props
// ============================================================================

export interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    gradient: string;
    trend?: 'up' | 'down';
    trendValue?: string;
    bgGradient: string;
}

export interface QuickActionProps {
    title: string;
    description: string;
    icon: React.ElementType;
    gradient: string;
    onClick: () => void;
}

export interface KPICardProps {
    kpi: CustomKPI;
}

export interface AlertCardProps {
    alert: Alert;
}

export interface ChartHeaderProps {
    title: string;
    subtitle: string;
    onTimeRangeChange: (range: ChartTimeRange) => void;
    onChartTypeChange?: (type: ChartType) => void;
}

export interface ChartCardProps {
    title: string;
    data: SalesDataPoint[];
    type?: ChartType;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface DashboardUIState {
    alertFilter: AlertFilter;
    orderFilter: OrderFilter;
    orderSort: OrderSort;
    chartTimeRange: ChartTimeRange;
    selectedChart: SelectedChart;
    fabOpen: boolean;
    panel: PanelType;
    isCustomizingKPIs: boolean;
    showMoreFilters: boolean;
}

export interface DashboardDataState {
    stats: DashboardStats;
    salesData: SalesDataPoint[];
    productCategories: ProductCategory[];
    recentOrders: DashboardOrder[];
    alerts: Alert[];
    customKPIs: CustomKPI[];
    chartData: ChartData;
}

export interface DashboardAsyncState {
    loading: boolean;
    error: string | null;
    refreshing: boolean;
}

export interface DashboardState {
    ui: DashboardUIState;
    data: DashboardDataState;
    async: DashboardAsyncState;
    selectedKPIs: number[];
    searchQuery: string;
}
