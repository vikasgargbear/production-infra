/**
 * usePaymentTracking Hook
 * 
 * Extracted from PaymentTracking.js (629 lines)
 * Handles payment list loading, filtering, and selection.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { paymentsApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';
import {
    CreditCard,
    Banknote,
    Smartphone,
    Building,
    FileText,
    CheckCircle,
    Clock,
    XCircle,
    AlertTriangle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Types
export interface Payment {
    id: number | string;
    customerName?: string;
    customerPhone?: string;
    invoiceNo?: string;
    invoiceAmount?: number;
    paymentAmount: number;
    paymentDate?: string;
    paymentMode?: string;
    transactionId?: string;
    status: 'completed' | 'pending' | 'bounced' | 'failed';
    remarks?: string;
    notes?: string;
    split_payments?: { mode: string; amount: number; reference?: string }[];
    attachments?: string[];
}

export interface PaymentMode {
    id: string;
    name: string;
    icon: LucideIcon;
    color: string;
}

export interface PaymentStats {
    todayCollection: number;
    totalCollection: number;
    pendingAmount: number;
    completedCount: number;
    pendingCount: number;
}

export type StatusFilter = 'all' | 'completed' | 'pending' | 'bounced' | 'failed';
export type DateFilter = 'all' | 'today' | 'yesterday' | 'last_week' | 'last_month';

export interface UsePaymentTrackingReturn {
    // Data
    payments: Payment[];
    filteredPayments: Payment[];
    selectedPayment: Payment | null;
    stats: PaymentStats;
    paymentModes: PaymentMode[];

    // State
    loading: boolean;
    refreshing: boolean;
    error: string | null;
    showDetails: boolean;

    // Filters
    searchTerm: string;
    statusFilter: StatusFilter;
    modeFilter: string;
    dateFilter: DateFilter;

    // Actions
    setSearchTerm: (term: string) => void;
    setStatusFilter: (filter: StatusFilter) => void;
    setModeFilter: (mode: string) => void;
    setDateFilter: (filter: DateFilter) => void;
    setShowDetails: (show: boolean) => void;
    handleRefresh: () => Promise<void>;
    handlePaymentSelect: (payment: Payment) => void;

    // Helpers
    getStatusColor: (status: string) => string;
    getStatusIcon: (status: string) => LucideIcon;
    getPaymentModeIcon: (mode: string) => LucideIcon;
    getPaymentModeColor: (mode: string) => string;
}

const paymentModesList: PaymentMode[] = [
    { id: 'upi', name: 'UPI', icon: Smartphone, color: 'purple' },
    { id: 'cheque', name: 'Cheque', icon: FileText, color: 'blue' },
    { id: 'cash', name: 'Cash', icon: Banknote, color: 'green' },
    { id: 'rtgs_neft', name: 'RTGS/NEFT', icon: Building, color: 'orange' },
    { id: 'card', name: 'Card', icon: CreditCard, color: 'pink' }
];

export function usePaymentTracking(): UsePaymentTrackingReturn {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [modeFilter, setModeFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState<DateFilter>('all');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    const loadPayments = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await paymentsApi.getAll();

            if (response?.data && Array.isArray(response.data)) {
                const paymentsData = response.data;
                setPayments(paymentsData);

                await offlineStorage.storeOffline('payments', paymentsData, {
                    critical: true,
                    persistent: true
                });
            } else {
                setPayments([]);
            }
        } catch {
            const offlineData = await offlineStorage.getOffline('payments', { critical: true });

            if (offlineData && !offlineStorage.isDataStale(offlineData, 30)) {
                setPayments(offlineData.data);
                setError('Currently using offline data. Some information may be outdated.');
            } else {
                setError('Unable to load payment data. Please check your connection.');
                setPayments([]);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);

        try {
            await loadPayments();
        } catch {
            setError('Failed to refresh data. Please try again.');
        } finally {
            setRefreshing(false);
        }
    }, [loadPayments]);

    // Filtered payments
    const filteredPayments = useMemo(() => {
        let filtered = [...payments];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(payment =>
                payment.customerName?.toLowerCase().includes(term) ||
                payment.invoiceNo?.toLowerCase().includes(term) ||
                payment.transactionId?.toLowerCase().includes(term)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(payment => payment.status === statusFilter);
        }

        // Mode filter
        if (modeFilter !== 'all') {
            filtered = filtered.filter(payment => payment.paymentMode === modeFilter);
        }

        // Date filter
        if (dateFilter !== 'all') {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            switch (dateFilter) {
                case 'today':
                    filtered = filtered.filter(p => p.paymentDate === today);
                    break;
                case 'yesterday':
                    filtered = filtered.filter(p => p.paymentDate === yesterday);
                    break;
                case 'last_week':
                    filtered = filtered.filter(p => p.paymentDate && p.paymentDate >= lastWeek);
                    break;
                case 'last_month':
                    filtered = filtered.filter(p => p.paymentDate && p.paymentDate >= lastMonth);
                    break;
            }
        }

        return filtered;
    }, [payments, searchTerm, statusFilter, modeFilter, dateFilter]);

    // Calculate stats
    const stats = useMemo((): PaymentStats => {
        if (!payments.length) {
            return { todayCollection: 0, totalCollection: 0, pendingAmount: 0, completedCount: 0, pendingCount: 0 };
        }

        const today = new Date().toISOString().split('T')[0];
        const todayPayments = payments.filter(p => p.paymentDate === today && p.status === 'completed');
        const todayCollection = todayPayments.reduce((sum, p) => sum + (p.paymentAmount || 0), 0);

        const totalCollection = payments
            .filter(p => p.status === 'completed')
            .reduce((sum, p) => sum + (p.paymentAmount || 0), 0);

        const pendingAmount = payments
            .filter(p => p.status === 'pending')
            .reduce((sum, p) => sum + (p.paymentAmount || 0), 0);

        const completedCount = payments.filter(p => p.status === 'completed').length;
        const pendingCount = payments.filter(p => p.status === 'pending').length;

        return {
            todayCollection,
            totalCollection,
            pendingAmount,
            completedCount,
            pendingCount
        };
    }, [payments]);

    // Helpers
    const getStatusColor = useCallback((status: string): string => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800 border-green-200';
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'bounced':
            case 'failed': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    }, []);

    const getStatusIcon = useCallback((status: string): LucideIcon => {
        switch (status) {
            case 'completed': return CheckCircle;
            case 'pending': return Clock;
            case 'bounced': return XCircle;
            case 'failed': return AlertTriangle;
            default: return Clock;
        }
    }, []);

    const getPaymentModeIcon = useCallback((mode: string): LucideIcon => {
        const modeConfig = paymentModesList.find(m => m.id === mode);
        return modeConfig ? modeConfig.icon : CreditCard;
    }, []);

    const getPaymentModeColor = useCallback((mode: string): string => {
        const modeConfig = paymentModesList.find(m => m.id === mode);
        return modeConfig ? modeConfig.color : 'gray';
    }, []);

    const handlePaymentSelect = useCallback((payment: Payment) => {
        setSelectedPayment(payment);
        setShowDetails(true);
    }, []);

    // Load on mount
    useEffect(() => {
        loadPayments();
    }, [loadPayments]);

    // Clear old offline data periodically
    useEffect(() => {
        const interval = setInterval(() => {
            offlineStorage.clearOldData(24);
        }, 60 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return {
        payments,
        filteredPayments,
        selectedPayment,
        stats,
        paymentModes: paymentModesList,
        loading,
        refreshing,
        error,
        showDetails,
        searchTerm,
        statusFilter,
        modeFilter,
        dateFilter,
        setSearchTerm,
        setStatusFilter,
        setModeFilter,
        setDateFilter,
        setShowDetails,
        handleRefresh,
        handlePaymentSelect,
        getStatusColor,
        getStatusIcon,
        getPaymentModeIcon,
        getPaymentModeColor
    };
}

export default usePaymentTracking;
