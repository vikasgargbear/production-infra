/**
 * usePaymentTracking Hook
 * 
 * Extracted from PaymentTracking.js (629 lines)
 * Handles payment list loading, filtering, and selection.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { paymentsApi } from '../../../services/api';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import {
    CreditCard,
    Banknote,
    Smartphone,
    Building,
    FileText,
    CheckCircle,
    Clock,
    XCircle
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Types
export interface Payment {
    id: string;
    partyName: string;
    paymentNumber: string;
    amount: number;
    date: string;
    method: string;
    reference?: string;
    direction: string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'reversed' | 'cancelled';
    notes?: string;
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

export type StatusFilter = 'all' | Payment['status'];
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
    { id: 'bank_transfer', name: 'Bank Transfer', icon: Building, color: 'blue' },
    { id: 'card', name: 'Card', icon: CreditCard, color: 'blue' },
    { id: 'other', name: 'Other', icon: CreditCard, color: 'gray' }
];

const PAYMENT_STATUSES = new Set<Payment['status']>([
    'draft', 'submitted', 'approved', 'rejected', 'posted', 'reversed', 'cancelled',
]);

const decodePayments = (value: unknown): Payment[] => {
    if (!Array.isArray(value)) throw new Error('Payment API returned an invalid canonical response');
    return value.map((row: any, index) => {
        const amount = typeof row?.amount === 'number' ? row.amount : Number(row?.amount);
        if (!isCanonicalUuid(row?.payment_id)
            || typeof row?.payment_number !== 'string'
            || typeof row?.party_name !== 'string'
            || typeof row?.payment_date !== 'string'
            || typeof row?.payment_method !== 'string'
            || typeof row?.direction !== 'string'
            || !PAYMENT_STATUSES.has(row?.status)
            || !Number.isFinite(amount)) {
            throw new Error(`Payment row ${index + 1} is missing canonical fields`);
        }
        return {
            id: row.payment_id,
            partyName: row.party_name,
            paymentNumber: row.payment_number,
            amount,
            date: row.payment_date,
            method: row.payment_method,
            reference: typeof row.reference_number === 'string' ? row.reference_number : undefined,
            direction: row.direction,
            status: row.status,
            notes: typeof row.notes === 'string' ? row.notes : undefined,
        };
    });
};

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
            setPayments(decodePayments(response?.data?.payments));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unable to load payment data from the live API.');
            setPayments([]);
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
                payment.partyName.toLowerCase().includes(term) ||
                payment.paymentNumber.toLowerCase().includes(term) ||
                payment.reference?.toLowerCase().includes(term)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(payment => payment.status === statusFilter);
        }

        // Mode filter
        if (modeFilter !== 'all') {
            filtered = filtered.filter(payment => payment.method === modeFilter);
        }

        // Date filter
        if (dateFilter !== 'all') {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            switch (dateFilter) {
                case 'today':
                    filtered = filtered.filter(p => p.date === today);
                    break;
                case 'yesterday':
                    filtered = filtered.filter(p => p.date === yesterday);
                    break;
                case 'last_week':
                    filtered = filtered.filter(p => p.date >= lastWeek);
                    break;
                case 'last_month':
                    filtered = filtered.filter(p => p.date >= lastMonth);
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
        const todayPayments = payments.filter(p => p.date === today && p.status === 'posted');
        const todayCollection = todayPayments.reduce((sum, p) => sum + p.amount, 0);

        const totalCollection = payments
            .filter(p => p.status === 'posted')
            .reduce((sum, p) => sum + p.amount, 0);

        const pendingAmount = payments
            .filter(p => ['draft', 'submitted', 'approved'].includes(p.status))
            .reduce((sum, p) => sum + p.amount, 0);

        const completedCount = payments.filter(p => p.status === 'posted').length;
        const pendingCount = payments.filter(p => ['draft', 'submitted', 'approved'].includes(p.status)).length;

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
            case 'posted': return 'bg-green-100 text-green-800 border-green-200';
            case 'draft':
            case 'submitted':
            case 'approved': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'rejected':
            case 'reversed':
            case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    }, []);

    const getStatusIcon = useCallback((status: string): LucideIcon => {
        switch (status) {
            case 'posted': return CheckCircle;
            case 'draft':
            case 'submitted':
            case 'approved': return Clock;
            case 'rejected':
            case 'reversed':
            case 'cancelled': return XCircle;
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
