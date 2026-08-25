/** Canonical party-statement and aging reads only. */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

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

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    AGING: '/ledger/aging',
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
    getAging: (params: AgingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AGING, { params });
    },

};

export default ledgerApi;
