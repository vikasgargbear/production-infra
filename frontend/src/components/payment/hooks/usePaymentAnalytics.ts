/**
 * usePaymentAnalytics Hook
 * 
 * Extracted from PaymentDashboard.js (545 lines)
 * Handles payment analytics data loading, filtering, and refresh.
 */

import { useState, useEffect, useCallback } from 'react';
import { paymentsApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

// Types
export interface PaymentModeData {
    amount: number;
    count: number;
}

export interface ReconciliationMetrics {
    autoReconciled: number;
    manualReview: number;
    pending: number;
    duplicates: number;
    failed: number;
}

export interface AgingBucket {
    count: number;
    amount: number;
}

export interface OverdueAnalysis {
    totalOverdue: number;
    overdueCount: number;
    agingBuckets: Record<string, AgingBucket>;
}

export interface TopCustomer {
    name: string;
    totalAmount: number;
    paymentCount: number;
}

export interface DailyTrend {
    date: string;
    amount: number;
}

export interface PreviousPeriod {
    totalCollected: number;
    paymentCount: number;
}

export interface PaymentAnalytics {
    totalCollected: number;
    paymentCount: number;
    averagePaymentAmount: number;
    previousPeriod: PreviousPeriod;
    collectionRate: number;
    avgCollectionDays: number;
    paymentModes: Record<string, PaymentModeData>;
    reconciliationMetrics: ReconciliationMetrics;
    topCustomers: TopCustomer[];
    overdueAnalysis: OverdueAnalysis;
    dailyTrends: DailyTrend[];
}

export type DateRangeType = 'today' | 'week' | 'month' | 'quarter' | 'year';

export interface UsePaymentAnalyticsReturn {
    analytics: PaymentAnalytics | null;
    dateRange: DateRangeType;
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    selectedMetric: string;

    setDateRange: (range: DateRangeType) => void;
    setSelectedMetric: (metric: string) => void;
    handleRefresh: () => Promise<void>;
    formatCurrency: (amount: number) => string;
    calculateGrowth: (current: number, previous: number) => string;
}

const defaultAnalytics: PaymentAnalytics = {
    totalCollected: 0,
    paymentCount: 0,
    averagePaymentAmount: 0,
    previousPeriod: { totalCollected: 0, paymentCount: 0 },
    collectionRate: 0,
    avgCollectionDays: 0,
    paymentModes: {},
    reconciliationMetrics: {
        autoReconciled: 0,
        manualReview: 0,
        pending: 0,
        duplicates: 0,
        failed: 0
    },
    topCustomers: [],
    overdueAnalysis: {
        totalOverdue: 0,
        overdueCount: 0,
        agingBuckets: {
            '0-30': { count: 0, amount: 0 },
            '31-60': { count: 0, amount: 0 },
            '61-90': { count: 0, amount: 0 },
            '90+': { count: 0, amount: 0 }
        }
    },
    dailyTrends: []
};

export function usePaymentAnalytics(): UsePaymentAnalyticsReturn {
    const [dateRange, setDateRange] = useState<DateRangeType>('month');
    const [analytics, setAnalytics] = useState<PaymentAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedMetric, setSelectedMetric] = useState('overview');

    const loadAnalytics = useCallback(async () => {
        setLoading(true);
        setError(null);

        const endDate = new Date();
        const startDate = new Date();

        switch (dateRange) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
        }

        try {
            // Try to get from API (currently defaults as API not ready)
            const analyticsData = { ...defaultAnalytics };
            setAnalytics(analyticsData);

            await offlineStorage.storeOffline(`payment_analytics_${dateRange}`, analyticsData, {
                persistent: true
            });
        } catch {
            // Try offline storage
            const offlineData = await offlineStorage.getOffline(`payment_analytics_${dateRange}`, { persistent: true });

            if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) {
                setAnalytics(offlineData.data);
                setError('Currently using offline data. Some information may be outdated.');
            } else {
                setError('Unable to load payment analytics. Please check your connection.');
                setAnalytics(defaultAnalytics);
            }
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);

        try {
            await loadAnalytics();
        } catch {
            setError('Failed to refresh data. Please try again.');
        } finally {
            setRefreshing(false);
        }
    }, [loadAnalytics]);

    const formatCurrency = useCallback((amount: number): string => {
        if (!amount || amount === 0) return '₹0';

        if (amount >= 10000000) {
            return `₹${(amount / 10000000).toFixed(1)}Cr`;
        } else if (amount >= 100000) {
            return `₹${(amount / 100000).toFixed(1)}L`;
        } else if (amount >= 1000) {
            return `₹${(amount / 1000).toFixed(1)}K`;
        }
        return `₹${amount}`;
    }, []);

    const calculateGrowth = useCallback((current: number, previous: number): string => {
        if (!previous || previous === 0) return '0';
        return ((current - previous) / previous * 100).toFixed(1);
    }, []);

    // Load on mount and when dateRange changes
    useEffect(() => {
        loadAnalytics();
    }, [loadAnalytics]);

    // Clear old offline data periodically
    useEffect(() => {
        const interval = setInterval(() => {
            offlineStorage.clearOldData(24);
        }, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return {
        analytics,
        dateRange,
        loading,
        refreshing,
        error,
        selectedMetric,
        setDateRange,
        setSelectedMetric,
        handleRefresh,
        formatCurrency,
        calculateGrowth
    };
}

export default usePaymentAnalytics;
