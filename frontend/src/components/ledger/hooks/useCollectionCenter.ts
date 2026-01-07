/**
 * useCollectionCenter Hook
 * 
 * Extracts collection management logic from CollectionCenter.tsx
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { ledgerApi, customersApi } from '../../../services/api';
import apiClient from '../../../services/api/apiClient';
import { toast } from 'react-toastify';

// ============================================
// Type Definitions
// ============================================

export interface CollectionItem {
    customer_id: string;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    customer_address: string;
    total_outstanding: number;
    overdue_amount: number;
    days_overdue: number;
    last_payment_date: string | null;
    last_payment_amount: number | null;
    credit_limit: number;
    status: 'pending' | 'promised' | 'partial' | 'collected' | 'disputed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assigned_to?: string;
    next_follow_up?: string;
    promise_date?: string;
    promise_amount?: number;
    notes?: string;
    payment_behavior: 'regular' | 'delayed' | 'defaulter';
}

export interface CollectionStats {
    total_outstanding: number;
    total_overdue: number;
    collections_today: number;
    collections_mtd: number;
    promise_amount: number;
    customers_count: number;
    critical_accounts: number;
    success_rate: number;
    collection_change?: number;
}

export interface CollectionFilters {
    search: string;
    status: string;
    priority: string;
    assignee: string;
    minAmount: number;
    sortBy: 'outstanding' | 'overdue' | 'days' | 'name';
    sortOrder: 'asc' | 'desc';
}

// ============================================
// Default Values
// ============================================

const getDefaultFilters = (): CollectionFilters => ({
    search: '',
    status: 'all',
    priority: 'all',
    assignee: 'all',
    minAmount: 0,
    sortBy: 'overdue',
    sortOrder: 'desc'
});

const defaultStats: CollectionStats = {
    total_outstanding: 0,
    total_overdue: 0,
    collections_today: 0,
    collections_mtd: 0,
    promise_amount: 0,
    customers_count: 0,
    critical_accounts: 0,
    success_rate: 0
};

// ============================================
// Hook Implementation
// ============================================

export function useCollectionCenter() {
    // Data State
    const [collections, setCollections] = useState<CollectionItem[]>([]);
    const [stats, setStats] = useState<CollectionStats>(defaultStats);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filter State
    const [filters, setFilters] = useState<CollectionFilters>(getDefaultFilters());

    // Selection State
    const [selectedItems, setSelectedItems] = useState<string[]>([]);

    // ============================================
    // Computed Values
    // ============================================

    const filteredCollections = useMemo(() => {
        let result = [...collections];

        // Search filter
        if (filters.search) {
            const search = filters.search.toLowerCase();
            result = result.filter(c =>
                c.customer_name.toLowerCase().includes(search) ||
                c.customer_phone?.includes(search)
            );
        }

        // Status filter
        if (filters.status !== 'all') {
            result = result.filter(c => c.status === filters.status);
        }

        // Priority filter
        if (filters.priority !== 'all') {
            result = result.filter(c => c.priority === filters.priority);
        }

        // Minimum amount filter
        if (filters.minAmount > 0) {
            result = result.filter(c => c.total_outstanding >= filters.minAmount);
        }

        // Sorting
        result.sort((a, b) => {
            let comparison = 0;
            switch (filters.sortBy) {
                case 'outstanding':
                    comparison = a.total_outstanding - b.total_outstanding;
                    break;
                case 'overdue':
                    comparison = a.overdue_amount - b.overdue_amount;
                    break;
                case 'days':
                    comparison = a.days_overdue - b.days_overdue;
                    break;
                case 'name':
                    comparison = a.customer_name.localeCompare(b.customer_name);
                    break;
            }
            return filters.sortOrder === 'desc' ? -comparison : comparison;
        });

        return result;
    }, [collections, filters]);

    const selectedCustomers = useMemo(() => {
        return collections.filter(c => selectedItems.includes(c.customer_id));
    }, [collections, selectedItems]);

    // ============================================
    // API Actions
    // ============================================

    const fetchCollections = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Use the working sales/outstanding endpoint
            const response = await apiClient.get('/sales/outstanding', {
                params: { party_type: 'customer', limit: 500 }
            });

            if (response.data) {
                const data = response.data.data || response.data || [];

                const collectionItems: CollectionItem[] = data.map((item: any) => ({
                    customer_id: String(item.customer_id || item.party_id),
                    customer_name: item.customer_name || item.party_name,
                    customer_phone: item.primary_phone || item.phone || '',
                    customer_email: item.email || '',
                    customer_address: item.address || '',
                    total_outstanding: item.current_outstanding || item.total_outstanding || 0,
                    overdue_amount: item.overdue_amount || item.current_outstanding || 0,
                    days_overdue: item.days_overdue || 0,
                    last_payment_date: item.last_payment_date || null,
                    last_payment_amount: item.last_payment_amount || null,
                    credit_limit: item.credit_limit || 0,
                    status: 'pending' as const,
                    priority: item.current_outstanding > 50000 ? 'critical' :
                        item.current_outstanding > 25000 ? 'high' :
                            item.current_outstanding > 10000 ? 'medium' : 'low',
                    payment_behavior: 'regular' as const
                }));

                setCollections(collectionItems);

                // Calculate stats
                const newStats: CollectionStats = {
                    total_outstanding: collectionItems.reduce((s, c) => s + c.total_outstanding, 0),
                    total_overdue: collectionItems.reduce((s, c) => s + c.overdue_amount, 0),
                    collections_today: 0,
                    collections_mtd: 0,
                    promise_amount: 0,
                    customers_count: collectionItems.length,
                    critical_accounts: collectionItems.filter(c => c.priority === 'critical').length,
                    success_rate: 0
                };
                setStats(newStats);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch collection data');
        } finally {
            setLoading(false);
        }
    }, []);

    // ============================================
    // Filter Actions
    // ============================================

    const updateFilter = useCallback(<K extends keyof CollectionFilters>(
        key: K,
        value: CollectionFilters[K]
    ) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(getDefaultFilters());
    }, []);

    // ============================================
    // Selection Actions
    // ============================================

    const toggleSelection = useCallback((customerId: string) => {
        setSelectedItems(prev =>
            prev.includes(customerId)
                ? prev.filter(id => id !== customerId)
                : [...prev, customerId]
        );
    }, []);

    const selectAll = useCallback(() => {
        setSelectedItems(filteredCollections.map(c => c.customer_id));
    }, [filteredCollections]);

    const clearSelection = useCallback(() => {
        setSelectedItems([]);
    }, []);

    // ============================================
    // Communication Actions
    // ============================================

    const sendWhatsApp = useCallback((customer: CollectionItem) => {
        const message = encodeURIComponent(
            `Dear ${customer.customer_name},\n\nThis is a friendly reminder about your outstanding balance of ₹${customer.total_outstanding.toLocaleString()}.\n\nPlease arrange for payment at your earliest convenience.\n\nThank you.`
        );
        const phone = customer.customer_phone.replace(/\D/g, '');
        window.open(`https://wa.me/91${phone}?text=${message}`, '_blank');
    }, []);

    const sendEmail = useCallback((customer: CollectionItem) => {
        const subject = encodeURIComponent('Payment Reminder');
        const body = encodeURIComponent(
            `Dear ${customer.customer_name},\n\nThis is a reminder about your outstanding balance of ₹${customer.total_outstanding.toLocaleString()}.\n\nPlease arrange for payment.\n\nThank you.`
        );
        window.open(`mailto:${customer.customer_email}?subject=${subject}&body=${body}`, '_blank');
    }, []);

    const makeCall = useCallback((customer: CollectionItem) => {
        window.open(`tel:${customer.customer_phone}`, '_blank');
    }, []);

    const sendBulkWhatsApp = useCallback(() => {
        selectedCustomers.forEach((customer, index) => {
            setTimeout(() => sendWhatsApp(customer), index * 1000);
        });
        toast.success(`Sending WhatsApp to ${selectedCustomers.length} customers`);
    }, [selectedCustomers, sendWhatsApp]);

    const sendBulkEmail = useCallback(() => {
        const emails = selectedCustomers.map(c => c.customer_email).filter(Boolean).join(',');
        if (emails) {
            const subject = encodeURIComponent('Payment Reminder');
            window.open(`mailto:${emails}?subject=${subject}`, '_blank');
        }
    }, [selectedCustomers]);

    // ============================================
    // Export Actions
    // ============================================

    const exportToCSV = useCallback(() => {
        const headers = ['Customer', 'Phone', 'Email', 'Outstanding', 'Overdue', 'Days Overdue', 'Priority'];
        const rows = filteredCollections.map(c => [
            c.customer_name,
            c.customer_phone,
            c.customer_email,
            c.total_outstanding.toFixed(2),
            c.overdue_amount.toFixed(2),
            c.days_overdue,
            c.priority
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `collections-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }, [filteredCollections]);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        fetchCollections();
    }, [fetchCollections]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        collections,
        filteredCollections,
        stats,
        loading,
        error,

        // Filters
        filters,
        updateFilter,
        resetFilters,

        // Selection
        selectedItems,
        selectedCustomers,
        toggleSelection,
        selectAll,
        clearSelection,

        // Communication
        sendWhatsApp,
        sendEmail,
        makeCall,
        sendBulkWhatsApp,
        sendBulkEmail,

        // Actions
        fetchCollections,
        exportToCSV
    };
}

export default useCollectionCenter;
