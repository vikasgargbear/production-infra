/**
 * useLedgerAnalytics Hook
 * 
 * Extracts state management and data fetching from LedgerAnalytics.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ledgerApi, customersApi, suppliersApi } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface LedgerEntry {
    entry_id: number;
    date: string;
    voucher_type: string;
    voucher_number: string;
    party_name: string;
    party_type: 'customer' | 'supplier';
    debit: number;
    credit: number;
    balance: number;
    narration?: string;
}

export interface PartySummary {
    party_id: number;
    party_name: string;
    party_type: 'customer' | 'supplier';
    total_debit: number;
    total_credit: number;
    closing_balance: number;
    transaction_count: number;
}

export interface DateRange {
    start: string;
    end: string;
}

export interface AnalyticsSummary {
    total_debit: number;
    total_credit: number;
    net_balance: number;
    transaction_count: number;
    customers_receivable: number;
    suppliers_payable: number;
}

// ============================================
// Hook Implementation
// ============================================

export function useLedgerAnalytics() {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [partySummaries, setPartySummaries] = useState<PartySummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [dateRange, setDateRange] = useState<DateRange>({
        start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [partyFilter, setPartyFilter] = useState<string>('');
    const [partyTypeFilter, setPartyTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
    const [voucherTypeFilter, setVoucherTypeFilter] = useState<string>('all');

    // View Mode
    const [viewMode, setViewMode] = useState<'entries' | 'summary' | 'aging'>('entries');

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const perPage = 50;

    // ============================================
    // Computed Values
    // ============================================

    const filteredEntries = useMemo(() => {
        return entries.filter(entry => {
            const matchesParty = !partyFilter ||
                entry.party_name.toLowerCase().includes(partyFilter.toLowerCase());

            const matchesType = partyTypeFilter === 'all' ||
                entry.party_type === partyTypeFilter;

            const matchesVoucher = voucherTypeFilter === 'all' ||
                entry.voucher_type === voucherTypeFilter;

            return matchesParty && matchesType && matchesVoucher;
        });
    }, [entries, partyFilter, partyTypeFilter, voucherTypeFilter]);

    const analyticsSummary = useMemo((): AnalyticsSummary => {
        const summary = filteredEntries.reduce(
            (acc, entry) => ({
                total_debit: acc.total_debit + entry.debit,
                total_credit: acc.total_credit + entry.credit,
                transaction_count: acc.transaction_count + 1,
                customers_receivable: acc.customers_receivable +
                    (entry.party_type === 'customer' ? entry.debit - entry.credit : 0),
                suppliers_payable: acc.suppliers_payable +
                    (entry.party_type === 'supplier' ? entry.credit - entry.debit : 0)
            }),
            { total_debit: 0, total_credit: 0, transaction_count: 0, customers_receivable: 0, suppliers_payable: 0 }
        );

        return {
            ...summary,
            net_balance: summary.total_debit - summary.total_credit
        };
    }, [filteredEntries]);

    const voucherTypes = useMemo(() => {
        const types = new Set(entries.map(e => e.voucher_type));
        return ['all', ...Array.from(types)];
    }, [entries]);

    // ============================================
    // API Actions
    // ============================================

    const fetchLedgerEntries = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = {
                from_date: dateRange.start,
                to_date: dateRange.end,
                limit: perPage,
                offset: (page - 1) * perPage
            };

            const response = await ledgerApi.getEntries(params);

            if (response.data) {
                const ledgerData = response.data.entries || response.data || [];
                setEntries(ledgerData);
                setTotalPages(Math.ceil((response.data.total || ledgerData.length) / perPage));
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch ledger entries');
        } finally {
            setLoading(false);
        }
    }, [dateRange, page]);

    const fetchPartySummaries = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [customersRes, suppliersRes] = await Promise.all([
                customersApi.getOutstanding().catch(() => ({ data: [] })),
                suppliersApi.getOutstanding().catch(() => ({ data: [] }))
            ]);

            const customerSummaries = (customersRes.data || []).map((c: any) => ({
                party_id: c.customer_id,
                party_name: c.customer_name,
                party_type: 'customer' as const,
                total_debit: c.total_sales || 0,
                total_credit: c.total_payments || 0,
                closing_balance: c.current_outstanding || c.balance || 0,
                transaction_count: c.transaction_count || 0
            }));

            const supplierSummaries = (suppliersRes.data || []).map((s: any) => ({
                party_id: s.supplier_id,
                party_name: s.supplier_name,
                party_type: 'supplier' as const,
                total_debit: s.total_payments || 0,
                total_credit: s.total_purchases || 0,
                closing_balance: s.current_outstanding || s.balance || 0,
                transaction_count: s.transaction_count || 0
            }));

            setPartySummaries([...customerSummaries, ...supplierSummaries]);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch party summaries');
        } finally {
            setLoading(false);
        }
    }, []);

    const exportToCSV = useCallback(() => {
        const headers = ['Date', 'Voucher Type', 'Voucher #', 'Party', 'Type', 'Debit', 'Credit', 'Balance'];
        const rows = filteredEntries.map(e => [
            e.date, e.voucher_type, e.voucher_number, e.party_name, e.party_type,
            e.debit.toFixed(2), e.credit.toFixed(2), e.balance.toFixed(2)
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ledger-analytics-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }, [filteredEntries]);

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        if (viewMode === 'entries') {
            fetchLedgerEntries();
        } else if (viewMode === 'summary') {
            fetchPartySummaries();
        }
    }, [viewMode, fetchLedgerEntries, fetchPartySummaries]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        entries,
        filteredEntries,
        partySummaries,
        analyticsSummary,
        loading,
        error,

        // Filters
        dateRange,
        setDateRange,
        partyFilter,
        setPartyFilter,
        partyTypeFilter,
        setPartyTypeFilter,
        voucherTypeFilter,
        setVoucherTypeFilter,
        voucherTypes,

        // View Mode
        viewMode,
        setViewMode,

        // Pagination
        page,
        setPage,
        totalPages,

        // Actions
        fetchLedgerEntries,
        fetchPartySummaries,
        exportToCSV
    };
}

export default useLedgerAnalytics;
