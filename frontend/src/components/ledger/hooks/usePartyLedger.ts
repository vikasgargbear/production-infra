/**
 * usePartyLedger Hook
 * 
 * Extracts state management and data fetching from PartyLedgerV3.tsx
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ledgerApi, customersApi, suppliersApi } from '../../../services/api';

// ============================================
// Type Definitions
// ============================================

export interface Party {
    party_id: number;
    party_name: string;
    party_type: 'customer' | 'supplier';
    phone?: string;
    email?: string;
    gst_number?: string;
    opening_balance: number;
    closing_balance: number;
}

export interface LedgerTransaction {
    transaction_id: number;
    date: string;
    voucher_type: string;
    voucher_number: string;
    particulars: string;
    debit: number;
    credit: number;
    running_balance: number;
}

export interface DateRange {
    from: string;
    to: string;
}

export interface LedgerSummary {
    opening_balance: number;
    total_debit: number;
    total_credit: number;
    closing_balance: number;
    transaction_count: number;
}

// ============================================
// Hook Implementation
// ============================================

export function usePartyLedger() {
    // Party Selection
    const [parties, setParties] = useState<Party[]>([]);
    const [selectedParty, setSelectedParty] = useState<Party | null>(null);
    const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
    const [partySearch, setPartySearch] = useState('');

    // Transactions
    const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Date Range
    const [dateRange, setDateRange] = useState<DateRange>({
        from: new Date(new Date().getFullYear(), 3, 1).toISOString().split('T')[0], // Financial year start
        to: new Date().toISOString().split('T')[0]
    });

    // View Mode
    const [viewMode, setViewMode] = useState<'detailed' | 'summarized'>('detailed');
    const [showAging, setShowAging] = useState(false);

    // ============================================
    // Computed Values
    // ============================================

    const filteredParties = useMemo(() => {
        return parties.filter(p =>
            !partySearch || p.party_name.toLowerCase().includes(partySearch.toLowerCase())
        );
    }, [parties, partySearch]);

    const ledgerSummary = useMemo((): LedgerSummary => {
        if (!transactions.length) {
            return {
                opening_balance: selectedParty?.opening_balance || 0,
                total_debit: 0,
                total_credit: 0,
                closing_balance: selectedParty?.closing_balance || 0,
                transaction_count: 0
            };
        }

        const totals = transactions.reduce(
            (acc, t) => ({
                total_debit: acc.total_debit + t.debit,
                total_credit: acc.total_credit + t.credit
            }),
            { total_debit: 0, total_credit: 0 }
        );

        const openingBalance = selectedParty?.opening_balance || 0;
        const closingBalance = openingBalance + totals.total_debit - totals.total_credit;

        return {
            opening_balance: openingBalance,
            ...totals,
            closing_balance: closingBalance,
            transaction_count: transactions.length
        };
    }, [transactions, selectedParty]);

    // ============================================
    // API Actions
    // ============================================

    const fetchParties = useCallback(async () => {
        setLoading(true);
        try {
            const api = partyType === 'customer' ? customersApi : suppliersApi;
            const response = await api.getAll({ limit: 500 });

            if (response.data) {
                const partyData = (response.data.data || response.data || []).map((p: any) => ({
                    party_id: p.customer_id || p.supplier_id,
                    party_name: p.customer_name || p.supplier_name,
                    party_type: partyType,
                    phone: p.primary_phone || p.phone,
                    email: p.email,
                    gst_number: p.gst_number,
                    opening_balance: p.opening_balance || 0,
                    closing_balance: p.current_outstanding || p.balance || 0
                }));
                setParties(partyData);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch parties');
        } finally {
            setLoading(false);
        }
    }, [partyType]);

    const fetchLedger = useCallback(async () => {
        if (!selectedParty) return;

        setLoading(true);
        setError(null);

        try {
            const response = await ledgerApi.getPartyLedger({
                party_id: selectedParty.party_id,
                party_type: selectedParty.party_type,
                from_date: dateRange.from,
                to_date: dateRange.to
            });

            if (response.data) {
                const txnData = response.data.transactions || response.data || [];
                let runningBalance = selectedParty.opening_balance;

                const processedTransactions = txnData.map((t: any) => {
                    runningBalance += (t.debit || 0) - (t.credit || 0);
                    return {
                        transaction_id: t.transaction_id || t.id,
                        date: t.date || t.transaction_date,
                        voucher_type: t.voucher_type || t.type,
                        voucher_number: t.voucher_number || t.reference,
                        particulars: t.particulars || t.narration || '',
                        debit: t.debit || 0,
                        credit: t.credit || 0,
                        running_balance: runningBalance
                    };
                });

                setTransactions(processedTransactions);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch ledger');
        } finally {
            setLoading(false);
        }
    }, [selectedParty, dateRange]);

    // ============================================
    // Export Actions
    // ============================================

    const exportToPDF = useCallback(() => {
        // PDF generation would be implemented here
        console.log('Export to PDF', selectedParty, transactions);
    }, [selectedParty, transactions]);

    const exportToExcel = useCallback(() => {
        if (!selectedParty || !transactions.length) return;

        const headers = ['Date', 'Voucher Type', 'Voucher #', 'Particulars', 'Debit', 'Credit', 'Balance'];
        const rows = transactions.map(t => [
            t.date, t.voucher_type, t.voucher_number, t.particulars,
            t.debit.toFixed(2), t.credit.toFixed(2), t.running_balance.toFixed(2)
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ledger-${selectedParty.party_name}-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }, [selectedParty, transactions]);

    const printLedger = useCallback(() => {
        if (!selectedParty) return;

        const printContent = `
      <html><head><title>Ledger - ${selectedParty.party_name}</title>
      <style>
        body { font-family: Arial; padding: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
        th { background: #f5f5f5; }
        .party-name { font-size: 18px; font-weight: bold; }
        .summary { margin-top: 20px; }
      </style></head><body>
        <div class="party-name">${selectedParty.party_name}</div>
        <div>Period: ${dateRange.from} to ${dateRange.to}</div>
        <table>
          <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            ${transactions.map(t => `
              <tr><td>${t.date}</td><td>${t.voucher_type} ${t.voucher_number}</td>
              <td style="text-align:left">${t.particulars}</td>
              <td>${t.debit.toFixed(2)}</td><td>${t.credit.toFixed(2)}</td>
              <td>${t.running_balance.toFixed(2)}</td></tr>
            `).join('')}
          </tbody>
        </table>
        <div class="summary">
          <strong>Closing Balance: ₹${ledgerSummary.closing_balance.toFixed(2)}</strong>
        </div>
      </body></html>`;

        const w = window.open('', '_blank');
        if (w) {
            w.document.write(printContent);
            w.document.close();
            w.print();
        }
    }, [selectedParty, transactions, dateRange, ledgerSummary]);

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        fetchParties();
    }, [fetchParties]);

    useEffect(() => {
        if (selectedParty) {
            fetchLedger();
        }
    }, [selectedParty, dateRange, fetchLedger]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Party Selection
        parties,
        filteredParties,
        selectedParty,
        setSelectedParty,
        partyType,
        setPartyType,
        partySearch,
        setPartySearch,

        // Transactions
        transactions,
        ledgerSummary,
        loading,
        error,

        // Date Range
        dateRange,
        setDateRange,

        // View
        viewMode,
        setViewMode,
        showAging,
        setShowAging,

        // Actions
        fetchParties,
        fetchLedger,
        exportToPDF,
        exportToExcel,
        printLedger
    };
}

export default usePartyLedger;
