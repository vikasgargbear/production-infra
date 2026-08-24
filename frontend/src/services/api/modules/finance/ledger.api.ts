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

export interface CanonicalPartyLedgerParams {
    party_type: 'customer' | 'supplier';
    date_from: string;
    date_to: string;
    page?: number;
    page_size?: number;
}

export interface CanonicalPartyLedgerEntryWire {
    journal_entry_id: string;
    journal_line_id: string;
    accounting_event_id: string;
    source_document_id: string;
    source_type: string;
    journal_number: string;
    posting_date: string;
    line_number: number;
    description: string;
    debit: string;
    credit: string;
    running_balance: string;
}

export interface CanonicalPartyLedgerWire {
    party_account_id: string;
    party_id: string;
    party_type: 'customer' | 'supplier';
    party_name: string;
    account_id: string;
    currency_code: 'INR';
    date_from: string;
    date_to: string;
    opening_balance: string;
    page_opening_balance: string;
    closing_balance: string;
    total_debit: string;
    total_credit: string;
    items: CanonicalPartyLedgerEntryWire[];
    page: number;
    page_size: number;
    total: number;
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

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    AGING: '/ledger/aging',
    REPORTS: '/ledger/reports',
    // Party-specific endpoints (now match backend /ledger/* routes)
    PARTY_AGING: '/ledger/aging',
} as const;

// ============================================
// API Module
// ============================================

export const ledgerApi = {
    getCanonicalPartyStatement: (
        partyAccountId: string,
        params: CanonicalPartyLedgerParams,
    ): Promise<AxiosResponse<CanonicalPartyLedgerWire>> => apiHelpers.get(
        `/canonical/party-ledger/${partyAccountId}`,
        { params },
    ),
    // AGING ANALYSIS
    getAging: (params: AgingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AGING, { params });
    },

    getAgingAnalysis: (params: AgingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PARTY_AGING, { params });
    },

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
    exportReport: (_params: ReportFilters = {}): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Exporting the unsupported legacy ledger report'),

};

export default ledgerApi;
