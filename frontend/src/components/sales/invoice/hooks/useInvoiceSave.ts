/**
 * API-only invoice submission.
 *
 * A Sales invoice is successful only after the canonical command has executed
 * and the server read-back supplies its final ID and number. Nothing is written
 * to IndexedDB and failed requests are never converted into local documents.
 */

import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import { invoicesApi } from '../../../../services/api';
import { Customer } from '../../../../types/models/customer';
import type { CompanyInfo } from '../../../../types/common/company.types';
import { showFinancialEntryNotification } from '../../../../utils/financialEntryNotifier';
import { clientUuid } from '../../../../utils/clientUuid';
import type { Invoice } from './useInvoiceLogic';
import type { CreatedInvoiceData } from '../types/invoiceTypes';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import {
    buildCanonicalInvoicePreparePayload,
    invoicePreviewValidationError,
} from '../utils/canonicalInvoiceCommand';

export interface UseInvoiceSaveProps {
    invoice: Invoice;
    selectedCustomer: Customer | null;
    companyInfo: CompanyInfo | null;
    isOnline: boolean;
    setInvoice: Dispatch<SetStateAction<Invoice>>;
    setCreatedInvoiceData: Dispatch<SetStateAction<CreatedInvoiceData | null>>;
    setShowSuccessModal: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
}

export interface UseInvoiceSaveReturn {
    saving: boolean;
    handleSaveInvoice: () => Promise<void>;
}

export const formatInvoiceSubmissionError = (error: unknown): string => {
    const apiError = error as {
        message?: string;
        response?: { data?: { detail?: unknown } };
    };
    const detail = apiError.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail.map((entry: { loc?: string[]; msg?: string }) =>
            `${entry.loc?.join('.') || 'Field'}: ${entry.msg || 'Invalid value'}`
        ).join('\n');
    }
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
        const structured = detail as { message?: string; error?: string };
        return structured.message || structured.error || JSON.stringify(detail);
    }
    return apiError.message || 'Invoice submission failed. No invoice was created.';
};

const firstImpact = (value: unknown): Record<string, unknown> =>
    Array.isArray(value) && value[0] && typeof value[0] === 'object'
        ? value[0] as Record<string, unknown>
        : {};

const numericMoney = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatTaxImpact = (value: unknown): string => {
    const impacts = Array.isArray(value)
        ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
        : [];
    if (impacts.length === 0) return 'server calculated';

    const explicitTotals = impacts.map(impact =>
        numericMoney(impact.total_tax ?? impact.amount),
    );
    if (explicitTotals.every(total => total !== null)) {
        const total = explicitTotals.reduce<number>((sum, amount) => sum + Number(amount), 0);
        return total.toFixed(2);
    }

    const components = ['cgst_total', 'sgst_total', 'igst_total', 'cess_total'] as const;
    const amounts = impacts.flatMap(impact => components.map(component => numericMoney(impact[component])));
    if (!amounts.some(amount => amount !== null)) return 'server calculated';
    return amounts.reduce<number>((sum, amount) => sum + Number(amount || 0), 0).toFixed(2);
};

const formatPolicyWarning = (warning: unknown): string => {
    if (typeof warning === 'string') return warning;
    if (!warning || typeof warning !== 'object') return String(warning ?? 'Unspecified policy warning');
    const structured = warning as Record<string, unknown>;
    const code = String(structured.code || structured.type || '').trim();
    const message = String(structured.message || structured.detail || structured.warning || '').trim();
    if (code && message) return `${code}: ${message}`;
    return message || code || 'Unspecified policy warning';
};

export const formatCanonicalInvoiceConfirmation = (preview: CanonicalCommandPreview): string => {
    const finance = firstImpact(preview.financial_impact);
    const inventory = Array.isArray(preview.inventory_impact) ? preview.inventory_impact : [];
    const total = finance.receivable || finance.grand_total || finance.amount || 'server calculated';
    const taxTotal = formatTaxImpact(preview.tax_impact);
    const warnings = Array.isArray(preview.policy_warnings) && preview.policy_warnings.length > 0
        ? `Warnings:\n${preview.policy_warnings.map(warning => `- ${formatPolicyWarning(warning)}`).join('\n')}`
        : '';

    return [
        'Authoritative backend preview',
        `Customer receivable: ₹${total}`,
        `GST impact: ₹${taxTotal}`,
        `Inventory movements: ${inventory.length}`,
        warnings,
        '',
        'Post this invoice now?',
        'Choose Cancel to leave without creating or queuing anything.',
    ].filter(line => line !== '').join('\n');
};

export function useInvoiceSave(props: UseInvoiceSaveProps): UseInvoiceSaveReturn {
    const {
        invoice,
        selectedCustomer,
        companyInfo,
        isOnline,
        setInvoice,
        setCreatedInvoiceData,
        setShowSuccessModal,
        setError,
    } = props;
    const [saving, setSaving] = useState(false);

    const handleSaveInvoice = useCallback(async () => {
        setError(null);
        const validationError = invoicePreviewValidationError(companyInfo, invoice, selectedCustomer);
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            return;
        }

        if (!isOnline) {
            const message = 'Invoice submission requires an API connection. No local or queued invoice was created.';
            setError(message);
            toast.error(message);
            return;
        }

        setSaving(true);
        try {
            const payload = buildCanonicalInvoicePreparePayload(
                invoice,
                selectedCustomer!,
                `erp-web-invoice:${clientUuid()}`,
            );
            const prepared = await invoicesApi.prepareCanonical(payload);
            const confirmed = window.confirm(formatCanonicalInvoiceConfirmation(prepared.data));
            if (!confirmed) {
                setError('Invoice posting was cancelled. No invoice was created or queued.');
                return;
            }
            const response = await invoicesApi.executePreparedCanonical(prepared.data);
            const result = response?.data;
            const invoiceId = result?.invoice_id;
            const invoiceNumber = result?.invoice_number;
            if (!result?.success || !invoiceId || !invoiceNumber) {
                throw new Error('The API did not confirm the invoice. No invoice was created.');
            }

            setInvoice(previous => ({ ...previous, invoice_number: invoiceNumber }));
            setCreatedInvoiceData({
                invoiceId: String(invoiceId),
                invoiceNumber,
                customerName: selectedCustomer!.customer_name,
                customerPhone: selectedCustomer!.primary_phone || '',
                customerEmail: selectedCustomer!.primary_email || '',
                totalAmount: Number(result.total_amount ?? invoice.final_amount ?? 0),
                items: invoice.items,
                isOffline: false,
            });
            setShowSuccessModal(true);
            showFinancialEntryNotification({
                title: 'Sales Invoice Posted',
                reference: invoiceNumber,
                amount: Number(result.total_amount ?? invoice.final_amount ?? 0),
                status: 'confirmed',
                impacts: [
                    'The invoice is committed to the backend sales ledger.',
                    'Inventory is reduced against the selected batches.',
                    'Customer receivable and outstanding balances are refreshed.',
                    'Output GST values are recorded for compliance reporting.',
                ],
            });
        } catch (error) {
            const message = formatInvoiceSubmissionError(error);
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [
        companyInfo,
        invoice,
        isOnline,
        selectedCustomer,
        setCreatedInvoiceData,
        setError,
        setInvoice,
        setShowSuccessModal,
    ]);

    return { saving, handleSaveInvoice };
}

export default useInvoiceSave;
