/**
 * useOutstanding Hook
 * 
 * Extracted from Outstanding.tsx
 * Handles outstanding data fetching, filtering, expansion state, and export.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../../services/api/apiClient';
import { formatCurrency } from '../../../utils/formatters';

// Types
export interface InvoiceDetail {
    invoice_id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    original_amount: number;
    paid_amount: number;
    current_outstanding: number;
    days_overdue: number;
    aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | 'over_90';
    status: 'pending' | 'partial' | 'overdue';
}

export interface PartyOutstanding {
    party_id: string;
    party_name: string;
    party_phone: string;
    party_email: string;
    total_outstanding: number;
    total_overdue: number;
    invoice_count: number;
    overdue_count: number;
    oldest_invoice_days: number;
    credit_limit?: number;
    credit_utilization?: number;
    invoices?: InvoiceDetail[];
    total_advance?: number;
    customer_net_position?: number;
}

export interface AgingSummary {
    current: { count: number; amount: number };
    '1-30': { count: number; amount: number };
    '31-60': { count: number; amount: number };
    '61-90': { count: number; amount: number };
    over_90: { count: number; amount: number };
}

export interface Summary {
    total_receivable: number;
    total_payable: number;
    total_overdue: number;
    party_count: number;
    overdue_party_count: number;
    aging_summary: AgingSummary;
}

export interface OutstandingFilters {
    status: string;
    searchQuery: string;
}

export interface AllocationModalState {
    isOpen: boolean;
    customerId: number | null;
    customerName: string;
}

export interface UseOutstandingProps {
    partyType?: 'customer' | 'supplier';
}

export interface UseOutstandingReturn {
    // Data
    parties: PartyOutstanding[];
    filteredParties: PartyOutstanding[];
    summary: Summary;
    selectedParty: PartyOutstanding | null;

    // State
    isLoading: boolean;
    error: unknown;
    expandedParties: Set<string>;
    filters: OutstandingFilters;
    viewMode: 'summary' | 'aging';
    showDetailsView: boolean;
    allocationModal: AllocationModalState;

    // Actions
    setFilters: React.Dispatch<React.SetStateAction<OutstandingFilters>>;
    setViewMode: React.Dispatch<React.SetStateAction<'summary' | 'aging'>>;
    togglePartyExpansion: (partyId: string) => void;
    handlePartyClick: (party: PartyOutstanding) => void;
    closeDetailsView: () => void;
    handleExport: () => void;
    refetch: () => void;
    openAllocationModal: (party: PartyOutstanding) => void;
    closeAllocationModal: () => void;

    // Helpers
    getAgingColor: (bucket: string) => string;
}

const defaultSummary: Summary = {
    total_receivable: 0,
    total_payable: 0,
    total_overdue: 0,
    party_count: 0,
    overdue_party_count: 0,
    aging_summary: {
        current: { count: 0, amount: 0 },
        '1-30': { count: 0, amount: 0 },
        '31-60': { count: 0, amount: 0 },
        '61-90': { count: 0, amount: 0 },
        over_90: { count: 0, amount: 0 }
    }
};

export function useOutstanding({ partyType = 'customer' }: UseOutstandingProps = {}): UseOutstandingReturn {
    // UI State
    const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState<OutstandingFilters>({ status: 'all', searchQuery: '' });
    const [viewMode, setViewMode] = useState<'summary' | 'aging'>('summary');
    const [selectedParty, setSelectedParty] = useState<PartyOutstanding | null>(null);
    const [showDetailsView, setShowDetailsView] = useState(false);
    const [allocationModal, setAllocationModal] = useState<AllocationModalState>({
        isOpen: false,
        customerId: null,
        customerName: ''
    });

    // Fetch outstanding data
    const { data, isLoading, refetch, error } = useQuery({
        queryKey: ['outstanding-data', partyType, filters],
        queryFn: async () => {
            try {
                const response = await apiClient.get('/sales/outstanding', { params: {} });
                const responseData = response.data || {};
                const invoices = Array.isArray(responseData.invoices) ? responseData.invoices :
                    Array.isArray(responseData) ? responseData : [];

                // Group by customer
                const partiesMap = new Map<string, PartyOutstanding>();

                invoices.forEach((invoice: any) => {
                    const partyId = String(invoice.customer_id);

                    if (!partiesMap.has(partyId)) {
                        partiesMap.set(partyId, {
                            party_id: partyId,
                            party_name: invoice.customer_name || 'Unknown Customer',
                            party_phone: invoice.customer_phone || '',
                            party_email: invoice.customer_email || '',
                            total_outstanding: 0,
                            total_advance: invoice.customer_advance || 0,
                            customer_net_position: invoice.customer_net_position || 0,
                            total_overdue: 0,
                            invoice_count: 0,
                            overdue_count: 0,
                            oldest_invoice_days: 0,
                            invoices: []
                        });
                    }

                    const party = partiesMap.get(partyId)!;
                    const pendingAmount = parseFloat(invoice.pending_amount || 0);
                    const daysOverdue = parseInt(invoice.days_overdue || 0);

                    if (invoice.customer_advance && party.total_advance === 0) {
                        party.total_advance = invoice.customer_advance;
                    }
                    if (invoice.customer_net_position !== undefined && party.customer_net_position === 0) {
                        party.customer_net_position = invoice.customer_net_position;
                    }

                    party.total_outstanding += pendingAmount;
                    party.invoice_count++;

                    if (daysOverdue > 0) {
                        party.total_overdue += pendingAmount;
                        party.overdue_count++;
                        party.oldest_invoice_days = Math.max(party.oldest_invoice_days, daysOverdue);
                    }

                    // Determine aging bucket
                    let agingBucket: InvoiceDetail['aging_bucket'] = 'current';
                    if (daysOverdue > 90) agingBucket = 'over_90';
                    else if (daysOverdue > 60) agingBucket = '61-90';
                    else if (daysOverdue > 30) agingBucket = '31-60';
                    else if (daysOverdue > 0) agingBucket = '1-30';

                    // Determine status
                    let status: InvoiceDetail['status'] = 'pending';
                    if (invoice.payment_status === 'partial') status = 'partial';
                    else if (daysOverdue > 0) status = 'overdue';

                    party.invoices!.push({
                        invoice_id: String(invoice.invoice_id),
                        invoice_number: invoice.invoice_number || '',
                        invoice_date: invoice.invoice_date || '',
                        due_date: invoice.due_date || '',
                        original_amount: parseFloat(invoice.final_amount || 0),
                        paid_amount: parseFloat(invoice.paid_amount || 0),
                        current_outstanding: pendingAmount,
                        days_overdue: daysOverdue,
                        aging_bucket: agingBucket,
                        status: status
                    });
                });

                const parties = Array.from(partiesMap.values());

                // Calculate summary
                const summary: Summary = { ...defaultSummary };

                if (responseData.total_outstanding !== undefined) {
                    summary.total_receivable = responseData.total_outstanding;
                } else {
                    parties.forEach(party => {
                        summary.total_receivable += party.total_outstanding;
                    });
                }

                parties.forEach(party => {
                    summary.total_overdue += party.total_overdue;
                    if (party.overdue_count > 0) summary.overdue_party_count++;

                    party.invoices?.forEach(invoice => {
                        const bucket = invoice.aging_bucket;
                        const amount = invoice.current_outstanding;

                        if (bucket === 'current') {
                            summary.aging_summary.current.count++;
                            summary.aging_summary.current.amount += amount;
                        } else if (bucket === '1-30') {
                            summary.aging_summary['1-30'].count++;
                            summary.aging_summary['1-30'].amount += amount;
                        } else if (bucket === '31-60') {
                            summary.aging_summary['31-60'].count++;
                            summary.aging_summary['31-60'].amount += amount;
                        } else if (bucket === '61-90') {
                            summary.aging_summary['61-90'].count++;
                            summary.aging_summary['61-90'].amount += amount;
                        } else if (bucket === 'over_90') {
                            summary.aging_summary.over_90.count++;
                            summary.aging_summary.over_90.amount += amount;
                        }
                    });
                });

                summary.party_count = parties.length;

                return { parties, summary };
            } catch {
                return { parties: [], summary: defaultSummary };
            }
        },
        placeholderData: (previousData) => previousData,
        enabled: partyType === 'customer',
        retry: 1
    });

    const parties = data?.parties || [];
    const summary = data?.summary || defaultSummary;

    // Filtered parties
    const filteredParties = useMemo(() => {
        let filtered = parties;

        if (filters.searchQuery) {
            const query = filters.searchQuery.toLowerCase();
            filtered = filtered.filter(party =>
                party.party_name.toLowerCase().includes(query) ||
                party.party_phone?.includes(filters.searchQuery)
            );
        }

        if (filters.status === 'overdue') {
            filtered = filtered.filter(party => party.total_overdue > 0);
        } else if (filters.status === 'current') {
            filtered = filtered.filter(party => party.total_overdue === 0);
        } else if (filters.status === 'net-outstanding') {
            filtered = filtered.filter(party => {
                const netPosition = party.customer_net_position || ((party.total_advance || 0) - party.total_outstanding);
                return netPosition > 0;
            });
        }

        return filtered;
    }, [parties, filters]);

    // Actions
    const togglePartyExpansion = useCallback((partyId: string) => {
        setExpandedParties(prev => {
            const newSet = new Set(prev);
            if (newSet.has(partyId)) {
                newSet.delete(partyId);
            } else {
                newSet.add(partyId);
            }
            return newSet;
        });
    }, []);

    const handlePartyClick = useCallback((party: PartyOutstanding) => {
        setSelectedParty(party);
        setShowDetailsView(true);
    }, []);

    const closeDetailsView = useCallback(() => {
        setShowDetailsView(false);
    }, []);

    const openAllocationModal = useCallback((party: PartyOutstanding) => {
        setSelectedParty(party);
        setAllocationModal({
            isOpen: true,
            customerId: parseInt(party.party_id),
            customerName: party.party_name
        });
    }, []);

    const closeAllocationModal = useCallback(() => {
        setAllocationModal({ isOpen: false, customerId: null, customerName: '' });
    }, []);

    const handleExport = useCallback(() => {
        try {
            const csvData = filteredParties.map(party => ({
                'Party Name': party.party_name,
                'Phone': party.party_phone,
                'Total Outstanding': party.total_outstanding,
                'Overdue Amount': party.total_overdue,
                'Invoice Count': party.invoice_count,
                'Overdue Count': party.overdue_count,
                'Oldest Days': party.oldest_invoice_days
            }));

            if (csvData.length === 0) {
                alert('No data to export');
                return;
            }

            const headers = Object.keys(csvData[0]);
            const csvContent = [
                headers.join(','),
                ...csvData.map(row => headers.map(h => `"${(row as any)[h] || ''}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `outstanding_${partyType}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Failed to export data');
        }
    }, [filteredParties, partyType]);

    const getAgingColor = useCallback((bucket: string): string => {
        switch (bucket) {
            case 'current': return 'text-green-600';
            case '1-30': return 'text-yellow-600';
            case '31-60': return 'text-orange-600';
            case '61-90': return 'text-red-600';
            case 'over_90': return 'text-red-800';
            default: return 'text-gray-600';
        }
    }, []);

    return {
        parties,
        filteredParties,
        summary,
        selectedParty,
        isLoading,
        error,
        expandedParties,
        filters,
        viewMode,
        showDetailsView,
        allocationModal,
        setFilters,
        setViewMode,
        togglePartyExpansion,
        handlePartyClick,
        closeDetailsView,
        handleExport,
        refetch,
        openAllocationModal,
        closeAllocationModal,
        getAgingColor
    };
}

export default useOutstanding;
