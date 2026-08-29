/** Canonical, posted-payment history and accounting readback. */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';
import { normalizeAuthoritativeDecimal } from '../../../../utils/exactDecimal';

export type CanonicalPaymentDirection = 'received' | 'made';

export interface CanonicalPaymentHistoryParams {
    direction?: 'all' | CanonicalPaymentDirection;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
}

export interface CanonicalPaymentHistoryItem {
    payment_id: string;
    command_request_id: string;
    payment_number: string;
    payment_date: string;
    branch_id: string;
    party_id: string;
    party_name: string;
    direction: CanonicalPaymentDirection;
    payment_method: 'bank_transfer' | 'card' | 'upi';
    external_reference?: string | null;
    amount: string;
    allocated_amount: string;
    allocation_count: number;
    journal_entry_id: string;
    journal_number: string;
    journal_debit_total: string;
    journal_credit_total: string;
    allocation_reconciled: true;
    journal_balanced: true;
    open_item_residuals_reconciled: true;
    status: 'posted';
}

export interface CanonicalPaymentHistoryResponse {
    items: CanonicalPaymentHistoryItem[];
    page: number;
    page_size: number;
    total: number;
}

export interface CanonicalPaymentDetail extends CanonicalPaymentHistoryItem {
    allocations: Array<{
        allocation_id: string;
        open_item_id: string;
        source_document_id: string;
        source_document_number: string;
        source_document_type: 'sales_invoice' | 'supplier_invoice';
        allocation_date: string;
        amount: string;
        principal_amount: string;
        effective_allocated_amount: string;
        residual_amount: string;
    }>;
    journal_lines: Array<{
        journal_line_id: string;
        line_number: number;
        account_id: string;
        party_id?: string | null;
        debit: string;
        credit: string;
    }>;
}

const exactMoney = (value: unknown, label: string) => normalizeAuthoritativeDecimal(
    value, label, { scale: 2, maximumWholeDigits: 20, allowNegative: false },
);

function normalizeHistoryItem(item: CanonicalPaymentHistoryItem): CanonicalPaymentHistoryItem {
    return {
        ...item,
        amount: exactMoney(item.amount, 'Payment amount'),
        allocated_amount: exactMoney(item.allocated_amount, 'Allocated amount'),
        journal_debit_total: exactMoney(item.journal_debit_total, 'Journal debit total'),
        journal_credit_total: exactMoney(item.journal_credit_total, 'Journal credit total'),
    };
}

function normalizePaymentDetail(detail: CanonicalPaymentDetail): CanonicalPaymentDetail {
    return {
        ...normalizeHistoryItem(detail),
        allocations: detail.allocations.map((row) => ({
            ...row,
            amount: exactMoney(row.amount, 'Allocation amount'),
            principal_amount: exactMoney(row.principal_amount, 'Open-item principal'),
            effective_allocated_amount: exactMoney(row.effective_allocated_amount, 'Effective allocation'),
            residual_amount: exactMoney(row.residual_amount, 'Open-item residual'),
        })),
        journal_lines: detail.journal_lines.map((row) => ({
            ...row,
            debit: exactMoney(row.debit, 'Journal debit'),
            credit: exactMoney(row.credit, 'Journal credit'),
        })),
    };
}

export const paymentsApi = {
    getCanonicalHistory: async (
        params: CanonicalPaymentHistoryParams = {},
    ): Promise<AxiosResponse<CanonicalPaymentHistoryResponse>> => {
        const response = await apiHelpers.get<CanonicalPaymentHistoryResponse>(
            '/canonical/payment-history', { params, preserveExactDecimals: true },
        );
        return {
            ...response,
            data: {
                ...response.data,
                items: response.data.items.map(normalizeHistoryItem),
            },
        };
    },

    getCanonicalDetail: async (
        paymentId: string,
    ): Promise<AxiosResponse<CanonicalPaymentDetail>> => {
        const response = await apiHelpers.get<CanonicalPaymentDetail>(
            `/canonical/payment-history/${paymentId}`,
            { preserveExactDecimals: true },
        );
        return { ...response, data: normalizePaymentDetail(response.data) };
    },
};
