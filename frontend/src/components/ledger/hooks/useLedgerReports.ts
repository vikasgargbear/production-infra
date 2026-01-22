/**
 * useLedgerReports Hook
 * 
 * Extracts reporting logic from LedgerReports.tsx
 */

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ledgerApi, reportsApi } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface ReportFilters {
    dateRange: {
        from: Date | null;
        to: Date | null;
    };
    reportType: ReportType;
    partyType: 'all' | 'customer' | 'supplier';
    groupBy: 'day' | 'week' | 'month' | 'quarter';
}

export type ReportType =
    | 'overview'
    | 'aging'
    | 'cashflow'
    | 'party-performance'
    | 'collection'
    | 'trends';

export interface DashboardStats {
    total_receivables: number;
    total_payables: number;
    net_position: number;
    overdue_receivables: number;
    overdue_payables: number;
    collection_efficiency: number;
    payment_efficiency: number;
    cash_flow_trend: 'positive' | 'negative' | 'neutral';
}

export interface AgingData {
    bucket: string;
    customer_count: number;
    supplier_count: number;
    customer_amount: number;
    supplier_amount: number;
}

export interface CashFlowData {
    period: string;
    inflow: number;
    outflow: number;
    net: number;
}

export interface TrendData {
    period: string;
    receivables: number;
    payables: number;
    collections: number;
    payments: number;
}

// ============================================
// Default Values
// ============================================

const getDefaultFilters = (): ReportFilters => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    return {
        dateRange: {
            from: startOfMonth,
            to: today
        },
        reportType: 'overview',
        partyType: 'all',
        groupBy: 'month'
    };
};

const defaultStats: DashboardStats = {
    total_receivables: 0,
    total_payables: 0,
    net_position: 0,
    overdue_receivables: 0,
    overdue_payables: 0,
    collection_efficiency: 0,
    payment_efficiency: 0,
    cash_flow_trend: 'neutral'
};

// ============================================
// Hook Implementation
// ============================================

export function useLedgerReports() {
    // Filters
    const [filters, setFilters] = useState<ReportFilters>(getDefaultFilters());

    // UI State
    const [exporting, setExporting] = useState(false);

    // ============================================
    // API Queries
    // ============================================

    const { data: dashboardStats, isLoading: loadingStats, refetch: refetchStats } = useQuery(
        ['ledger-dashboard-stats', filters.dateRange],
        async () => {
            const stats = await ledgerApi.getDashboardStats({
                as_of_date: filters.dateRange.to?.toISOString().split('T')[0]
            });
            return stats as DashboardStats;
        },
        {
            staleTime: 5 * 60 * 1000,
            initialData: defaultStats
        }
    );

    const { data: agingData, isLoading: loadingAging, refetch: refetchAging } = useQuery(
        ['ledger-aging', filters.partyType],
        async () => {
            const response = await ledgerApi.getAgingAnalysis({
                party_type: filters.partyType === 'all' ? undefined : filters.partyType
            });
            return response.data?.aging_data || [];
        },
        {
            enabled: filters.reportType === 'aging' || filters.reportType === 'overview'
        }
    );

    const { data: cashFlowData, isLoading: loadingCashFlow, refetch: refetchCashFlow } = useQuery(
        ['ledger-cashflow', filters.dateRange, filters.groupBy],
        async () => {
            const response = await ledgerApi.getCashFlowReport({
                from_date: filters.dateRange.from?.toISOString().split('T')[0],
                to_date: filters.dateRange.to?.toISOString().split('T')[0]
            });
            return response.data || [];
        },
        {
            enabled: filters.reportType === 'cashflow'
        }
    );

    const { data: trendData, isLoading: loadingTrends, refetch: refetchTrends } = useQuery(
        ['ledger-trends', filters.dateRange, filters.groupBy],
        async () => {
            const response = await ledgerApi.getTrendAnalysis({
                from_date: filters.dateRange.from?.toISOString().split('T')[0],
                to_date: filters.dateRange.to?.toISOString().split('T')[0]
            });
            return response.data || [];
        },
        {
            enabled: filters.reportType === 'trends'
        }
    );

    // ============================================
    // Computed Values
    // ============================================

    const isLoading = useMemo(() => {
        return loadingStats || loadingAging || loadingCashFlow || loadingTrends;
    }, [loadingStats, loadingAging, loadingCashFlow, loadingTrends]);

    const chartColors = useMemo(() => [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'
    ], []);

    // ============================================
    // Filter Actions
    // ============================================

    const updateFilter = useCallback(<K extends keyof ReportFilters>(
        key: K,
        value: ReportFilters[K]
    ) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const setDateRange = useCallback((from: Date | null, to: Date | null) => {
        setFilters(prev => ({
            ...prev,
            dateRange: { from, to }
        }));
    }, []);

    const setReportType = useCallback((type: ReportType) => {
        setFilters(prev => ({ ...prev, reportType: type }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(getDefaultFilters());
    }, []);

    // ============================================
    // Data Actions
    // ============================================

    const refreshAll = useCallback(async () => {
        await Promise.all([
            refetchStats(),
            refetchAging(),
            refetchCashFlow(),
            refetchTrends()
        ]);
    }, [refetchStats, refetchAging, refetchCashFlow, refetchTrends]);

    const exportReport = useCallback(async (format: 'pdf' | 'excel') => {
        setExporting(true);
        try {
            const response = await ledgerApi.exportReport({
                from_date: filters.dateRange.from?.toISOString().split('T')[0],
                to_date: filters.dateRange.to?.toISOString().split('T')[0],
                party_type: filters.partyType === 'all' ? undefined : filters.partyType,
                format
            });

            // Trigger download
            const blob = new Blob([response.data], {
                type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ledger-report-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    }, [filters]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Filters
        filters,
        updateFilter,
        setDateRange,
        setReportType,
        resetFilters,

        // Data
        dashboardStats: dashboardStats || defaultStats,
        agingData: agingData || [],
        cashFlowData: cashFlowData || [],
        trendData: trendData || [],

        // Loading States
        isLoading,
        loadingStats,
        loadingAging,
        loadingCashFlow,
        loadingTrends,
        exporting,

        // Actions
        refreshAll,
        exportReport,

        // Helpers
        chartColors
    };
}

export default useLedgerReports;
