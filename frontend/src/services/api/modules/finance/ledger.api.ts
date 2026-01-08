/**
 * Ledger API Module (Unified)
 * Handles all party ledger, account transactions, and reporting
 * 
 * ENDPOINTS: 
 *   - /ledger/* (backend: app/api/routes/finance/ledger.py)
 *   - /party-ledger-v2/* (backend: app/api/routes/party_ledger.py)
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

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
    PARTY_V2_BASE: '/party-ledger-v2',
    PARTY_BALANCE: (id: number) => `/party-ledger-v2/balance/${id}`,
    PARTY_STATEMENT: (id: number) => `/party-ledger-v2/statement/${id}`,
    PARTY_OUTSTANDING: (id: number) => `/party-ledger-v2/outstanding-bills/${id}`,
    PARTY_AGING: '/party-ledger-v2/aging-analysis',
    PARTY_ENTRY: '/party-ledger-v2/entry',
    PARTY_RECONCILE: (id: number) => `/party-ledger-v2/reconcile/${id}`,
    PARTY_REMINDERS: '/party-ledger-v2/reminders/pending'
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
    createEntry: (data: LedgerEntryData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.PARTY_ENTRY, data);
    },

    reconcileEntries: (data: { transaction_ids: number[] }): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.RECONCILE, data);
    },

    reconcileEntry: (ledgerId: number): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.PARTY_RECONCILE(ledgerId));
    },

    reconcileTransactions: (transactionIds: number[]): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.PARTY_V2_BASE}/reconcile-bulk`, { transaction_ids: transactionIds });
    },

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

    setCollectionReminder: (customerId: number, reminderData: ReminderData): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.COLLECTIONS}/${customerId}/reminder`, reminderData);
    },

    updateCollectionStatus: (customerId: number, status: string): Promise<AxiosResponse> => {
        return apiHelpers.patch(`${ENDPOINTS.COLLECTIONS}/${customerId}/status`, { status });
    },

    // DASHBOARD & ANALYTICS
    getDashboardStats: async (params: AgingParams = {}): Promise<{
        total_receivables: number;
        total_payables: number;
        net_position: number;
    }> => {
        const [customerAging, supplierAging] = await Promise.all([
            apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'customer' } }),
            apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'supplier' } })
        ]);

        const customerData = customerAging.data?.aging_data || [];
        const supplierData = supplierAging.data?.aging_data || [];

        const totalReceivables = customerData.reduce((sum: number, c: any) => sum + (c.total_outstanding || 0), 0);
        const totalPayables = supplierData.reduce((sum: number, s: any) => sum + (s.total_outstanding || 0), 0);

        return {
            total_receivables: totalReceivables,
            total_payables: totalPayables,
            net_position: totalReceivables - totalPayables
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

    // Get bank accounts for reconciliation
    getBankAccounts: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/bank-accounts');
    }
};

export const partyLedgerApi = ledgerApi;

export default ledgerApi;
