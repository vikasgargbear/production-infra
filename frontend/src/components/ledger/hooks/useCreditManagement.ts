/**
 * useCreditManagement Hook
 * 
 * Extracted from CreditManagement.js
 * Handles live API credit data loading, filtering, and stats calculation.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { customersApi, invoicesApi } from '../../../services/api';

// Types
export interface OutstandingInvoice {
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
}

export interface CustomerCredit {
    id: string | number;
    name: string;
    phone?: string;
    email?: string;
    credit_limit: number;
    credit_score?: number;
    payment_terms?: number;
    status?: string;
    creditUsed: number;
    creditAvailable: number;
    outstandingInvoices: OutstandingInvoice[];
}

export interface CreditStats {
    totalCredit: number;
    outstandingAmount: number;
    overdueAmount: number;
    customersOnCredit: number;
}

export interface UseCreditManagementReturn {
    // Data
    customers: CustomerCredit[];
    filteredCustomers: CustomerCredit[];
    creditStats: CreditStats;
    selectedCustomer: CustomerCredit | null;

    // State
    loading: boolean;
    refreshing: boolean;
    error: string | null;

    // Filters
    searchTerm: string;
    statusFilter: string;
    creditScoreFilter: string;

    // Modal
    showDetails: boolean;

    // Actions
    setSearchTerm: (term: string) => void;
    setStatusFilter: (filter: string) => void;
    setCreditScoreFilter: (filter: string) => void;
    handleCustomerSelect: (customer: CustomerCredit) => void;
    handleRefresh: () => Promise<void>;
    closeDetails: () => void;
    clearError: () => void;

    // Helpers
    getStatusColor: (customer: CustomerCredit) => string;
    getStatusText: (customer: CustomerCredit) => string;
    getCreditScoreColor: (score: number) => string;
    getCreditScoreText: (score: number) => string;
}

const initialStats: CreditStats = {
    totalCredit: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    customersOnCredit: 0
};

export function useCreditManagement(): UseCreditManagementReturn {
    // Data state
    const [customers, setCustomers] = useState<CustomerCredit[]>([]);
    const [creditStats, setCreditStats] = useState<CreditStats>(initialStats);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerCredit | null>(null);

    // Loading/error state
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [creditScoreFilter, setCreditScoreFilter] = useState('all');

    // Modal state
    const [showDetails, setShowDetails] = useState(false);

    // Load credit data only from the live API.
    const loadCreditData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [customersResponse, invoicesResponse] = await Promise.all([
                customersApi.getAll({ include_credit: true }),
                invoicesApi.getAll({ payment_status: 'unpaid' })
            ]);

            if (customersResponse?.data && Array.isArray(customersResponse.data)) {
                const customersData: CustomerCredit[] = customersResponse.data.map((customer: any) => {
                    const allInvoices = invoicesResponse?.data || [];
                    const customerInvoices = allInvoices.filter((inv: any) =>
                        inv.customer_id === customer.id &&
                        (inv.status === 'UNPAID' || inv.payment_status === 'UNPAID' || inv.status === 'outstanding')
                    );

                    const creditUsed = customerInvoices.reduce((sum: number, inv: any) =>
                        sum + (inv.final_amount || 0), 0);
                    const creditAvailable = (customer.credit_limit || 0) - creditUsed;

                    return {
                        ...customer,
                        creditUsed,
                        creditAvailable,
                        outstandingInvoices: customerInvoices.map((inv: any) => ({
                            invoiceNumber: inv.invoice_number,
                            amount: inv.amount,
                            dueDate: inv.due_date,
                            daysOverdue: inv.days_overdue || 0
                        }))
                    };
                });

                setCustomers(customersData);

                // Calculate stats
                const stats = customersData.reduce((acc, customer) => {
                    acc.totalCredit += customer.credit_limit || 0;
                    acc.outstandingAmount += customer.creditUsed || 0;
                    acc.overdueAmount += (customer.outstandingInvoices || [])
                        .filter(inv => inv.daysOverdue > 0)
                        .reduce((sum, inv) => sum + inv.amount, 0);
                    if (customer.creditUsed > 0) acc.customersOnCredit++;
                    return acc;
                }, { ...initialStats });

                setCreditStats(stats);

            } else {
                setCustomers([]);
                setCreditStats(initialStats);
            }
        } catch (err) {
            setError('Unable to load credit management data from the live API. Please try again.');
            setCustomers([]);
            setCreditStats(initialStats);
        } finally {
            setLoading(false);
        }
    }, []);

    // Refresh handler
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            await loadCreditData();
        } catch {
            setError('Failed to refresh data. Please try again.');
        } finally {
            setRefreshing(false);
        }
    }, [loadCreditData]);

    // Filtered customers (memoized)
    const filteredCustomers = useMemo(() => {
        let filtered = [...customers];

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(customer =>
                customer.name?.toLowerCase().includes(term) ||
                customer.phone?.includes(searchTerm) ||
                customer.email?.toLowerCase().includes(term)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(customer => {
                if (statusFilter === 'active') return customer.status === 'active';
                if (statusFilter === 'warning') return customer.creditAvailable <= customer.credit_limit * 0.1;
                if (statusFilter === 'blocked') return customer.creditAvailable < 0;
                return true;
            });
        }

        // Credit score filter
        if (creditScoreFilter !== 'all') {
            filtered = filtered.filter(customer => {
                const score = customer.credit_score || 0;
                if (creditScoreFilter === 'excellent') return score >= 90;
                if (creditScoreFilter === 'good') return score >= 70 && score < 90;
                if (creditScoreFilter === 'fair') return score >= 50 && score < 70;
                if (creditScoreFilter === 'poor') return score < 50;
                return true;
            });
        }

        return filtered;
    }, [customers, searchTerm, statusFilter, creditScoreFilter]);

    // Helper functions
    const getStatusColor = useCallback((customer: CustomerCredit): string => {
        if (customer.creditAvailable < 0) return 'bg-red-100 text-red-800 border-red-200';
        if (customer.creditAvailable <= customer.credit_limit * 0.1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        return 'bg-green-100 text-green-800 border-green-200';
    }, []);

    const getStatusText = useCallback((customer: CustomerCredit): string => {
        if (customer.creditAvailable < 0) return 'Blocked';
        if (customer.creditAvailable <= customer.credit_limit * 0.1) return 'Warning';
        return 'Active';
    }, []);

    const getCreditScoreColor = useCallback((score: number): string => {
        if (score >= 90) return 'text-green-600';
        if (score >= 70) return 'text-blue-600';
        if (score >= 50) return 'text-yellow-600';
        return 'text-red-600';
    }, []);

    const getCreditScoreText = useCallback((score: number): string => {
        if (score >= 90) return 'Excellent';
        if (score >= 70) return 'Good';
        if (score >= 50) return 'Fair';
        return 'Poor';
    }, []);

    const handleCustomerSelect = useCallback((customer: CustomerCredit) => {
        setSelectedCustomer(customer);
        setShowDetails(true);
    }, []);

    const closeDetails = useCallback(() => {
        setShowDetails(false);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Load on mount
    useEffect(() => {
        loadCreditData();
    }, [loadCreditData]);

    return {
        customers,
        filteredCustomers,
        creditStats,
        selectedCustomer,
        loading,
        refreshing,
        error,
        searchTerm,
        statusFilter,
        creditScoreFilter,
        showDetails,
        setSearchTerm,
        setStatusFilter,
        setCreditScoreFilter,
        handleCustomerSelect,
        handleRefresh,
        closeDetails,
        clearError,
        getStatusColor,
        getStatusText,
        getCreditScoreColor,
        getCreditScoreText
    };
}

export default useCreditManagement;
