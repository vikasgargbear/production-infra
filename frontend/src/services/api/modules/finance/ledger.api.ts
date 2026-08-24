/**
 * Ledger API Module (Unified)
 * Handles all party ledger, account transactions, and reporting
 * 
 * ENDPOINTS: 
 *   - /ledger/* (backend: app/api/routes/finance/ledger.py)
 *   - /party-ledger-v2/* (backend: app/api/routes/party_ledger.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';
import { normalizeAuthoritativeDecimal, subtractExactDecimals } from '../../../../utils/exactDecimal';

// ============================================
// Type Definitions
// ============================================

export interface LedgerParams {
    party_id?: number;
    party_type?: 'customer' | 'supplier';
    from_date?: string;
    to_date?: string;
    date_from?: string;  // Alias for from_date
    date_to?: string;    // Alias for to_date
    as_of_date?: string;
    limit?: number;
    offset?: number;
}

export interface AgingParams {
    party_type?: 'customer' | 'supplier';
    as_of_date?: string;
    date_from?: string;
    date_to?: string;
}

export interface ReportFilters {
    from_date?: string;
    to_date?: string;
    party_type?: 'customer' | 'supplier';
    format?: 'pdf' | 'excel';
}

export interface LedgerEntryData {
    party_id: number;
    party_type: 'customer' | 'supplier';
    entry_type: 'debit' | 'credit';
    amount: number;
    narration?: string;
    reference?: string;
    date?: string;
}

export interface ReminderData {
    reminder_date: string;
    reminder_note?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    PARTY: '/ledger/party',
    STATEMENTS: '/ledger/statements',
    OUTSTANDING: '/ledger/outstanding',
    AGING: '/ledger/aging',
    ENTRIES: '/ledger/entries',
    SUMMARY: '/ledger/summary',
    RECONCILE: '/ledger/reconcile',
    COLLECTIONS: '/ledger/collections',
    REPORTS: '/ledger/reports',
    // Party-specific endpoints (now match backend /ledger/* routes)
    PARTY_V2_BASE: '/ledger',
    PARTY_BALANCE: (id: number) => `/ledger/balance/${id}`,
    PARTY_STATEMENT: (id: number) => `/ledger/statement/${id}`,
    PARTY_OUTSTANDING: (id: number) => `/ledger/outstanding/${id}`,
    PARTY_AGING: '/ledger/aging',
    PARTY_ENTRY: '/ledger/entry',
    PARTY_RECONCILE: (id: number) => `/ledger/reconcile/${id}`,
    PARTY_REMINDERS: '/ledger/reminders/pending'
} as const;

// ============================================
// API Module
// ============================================

export const ledgerApi = {
    // PARTY BALANCE & STATEMENT
    getPartyInfo: (partyId: number, partyType: 'customer' | 'supplier' = 'customer'): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_BALANCE(partyId), {
            params: { party_type: partyType }
        });
    },

    getBalance: (partyId: number, partyType: 'customer' | 'supplier', asOfDate: string | null = null): Promise<AxiosResponse> => {
        const params: Record<string, any> = { party_type: partyType };
        if (asOfDate) params.as_of_date = asOfDate;
        return apiHelpers.get(ENDPOINTS.PARTY_BALANCE(partyId), { params });
    },

    getStatement: (partyId: number, partyType: 'customer' | 'supplier', params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_STATEMENT(partyId), {
            params: { party_type: partyType, ...params }
        });
    },

    getEnhancedLedger: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        const { party_id, party_type = 'customer', ...otherParams } = params;
        return apiHelpers.get(ENDPOINTS.PARTY_STATEMENT(party_id!), {
            params: { party_type, ...otherParams }
        });
    },

    getOutstandingBills: (partyId: number, partyType: 'customer' | 'supplier', params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_OUTSTANDING(partyId), {
            params: { party_type: partyType, ...params }
        });
    },

    // GENERAL LEDGER OPERATIONS
    getPartyLedger: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY, { params });
    },

    getPartyLedgerById: (partyId: number, params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.PARTY}/${partyId}`, { params });
    },

    getStatements: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STATEMENTS, { params });
    },

    getOutstanding: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.OUTSTANDING, { params });
    },

    getSummary: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.SUMMARY, { params });
    },

    // AGING ANALYSIS
    getAging: (params: AgingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AGING, { params });
    },

    getAgingAnalysis: (params: AgingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_AGING, { params });
    },

    // ENTRIES & RECONCILIATION
    createEntry: (_data: LedgerEntryData): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a ledger entry'),

    reconcileEntries: (_data: { transaction_ids: number[] }): Promise<AxiosResponse> => rejectCanonicalWrite('Reconciling ledger entries'),

    reconcileEntry: (_ledgerId: number): Promise<AxiosResponse> => rejectCanonicalWrite('Reconciling a ledger entry'),

    reconcileTransactions: (_transactionIds: number[]): Promise<AxiosResponse> => rejectCanonicalWrite('Reconciling ledger transactions'),

    // REMINDERS
    getPendingReminders: (reminderDate: string | null = null): Promise<AxiosResponse> => {
        const params: Record<string, any> = {};
        if (reminderDate) params.reminder_date = reminderDate;
        return apiHelpers.get(ENDPOINTS.PARTY_REMINDERS, { params });
    },

    // COLLECTIONS
    getCollectionData: (params: LedgerParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_AGING, {
            params: { party_type: 'customer', ...params }
        });
    },

    setCollectionReminder: (_customerId: number, _reminderData: ReminderData): Promise<AxiosResponse> => rejectCanonicalWrite('Setting a collection reminder'),

    updateCollectionStatus: (_customerId: number, _status: string): Promise<AxiosResponse> => rejectCanonicalWrite('Changing collection status'),

    // DASHBOARD & ANALYTICS
    getDashboardStats: async (params: AgingParams = {}): Promise<{
        total_receivables: string;
        total_payables: string;
        net_position: string;
        overdue_receivables: string;
        overdue_payables: string;
        collection_efficiency: null;
        payment_efficiency: null;
        cash_flow_trend: 'neutral';
    }> => {
        const [customerAging, supplierAging] = await Promise.all([
            apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'customer' } }),
            apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'supplier' } })
        ]);

        const money = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
            scale: 2, maximumWholeDigits: 20, allowNegative: true,
        });
        const totalReceivables = money(customerAging.data?.summary?.total, 'Ledger receivables');
        const totalPayables = money(supplierAging.data?.summary?.total, 'Ledger payables');
        const overdueReceivables = money(customerAging.data?.summary?.overdue, 'Ledger overdue receivables');
        const overduePayables = money(supplierAging.data?.summary?.overdue, 'Ledger overdue payables');

        return {
            total_receivables: totalReceivables,
            total_payables: totalPayables,
            net_position: subtractExactDecimals(totalReceivables, totalPayables, 'Ledger net position', {
                scale: 2, maximumWholeDigits: 20, allowNegative: true,
            }),
            overdue_receivables: overdueReceivables,
            overdue_payables: overduePayables,
            collection_efficiency: null,
            payment_efficiency: null,
            cash_flow_trend: 'neutral',
        };
    },

    // REPORTS
    getOverviewReport: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.REPORTS}/overview`, { params: filters });
    },

    getAgingReport: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: filters });
    },

    getCashFlowReport: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.REPORTS}/cashflow`, { params: filters });
    },

    getPartyPerformanceReport: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.REPORTS}/party-performance`, { params: filters });
    },

    getCollectionReport: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.REPORTS}/collection`, { params: filters });
    },

    getTrendAnalysis: (filters: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.REPORTS}/trends`, { params: filters });
    },

    // EXPORT
    exportReport: (params: ReportFilters = {}): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.REPORTS}/export`, params, { responseType: 'blob' });
    },

    exportLedger: (partyId: number, partyType: 'customer' | 'supplier', format: 'pdf' | 'excel' = 'pdf'): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.PARTY_V2_BASE}/export/${partyId}`, {
            params: { party_type: partyType, format },
            responseType: 'blob'
        });
    },
};

export const partyLedgerApi = ledgerApi;

export default ledgerApi;
