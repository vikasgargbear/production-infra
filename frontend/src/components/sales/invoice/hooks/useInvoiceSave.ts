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
    canonicalInvoiceValidationError,
    companyInvoiceValidationError,
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

export const formatCanonicalInvoiceConfirmation = (preview: CanonicalCommandPreview): string => {
    const finance = firstImpact(preview.financial_impact);
    const tax = firstImpact(preview.tax_impact);
    const inventory = Array.isArray(preview.inventory_impact) ? preview.inventory_impact : [];
    const total = finance.receivable || finance.grand_total || finance.amount || 'server calculated';
    const taxTotal = tax.igst_total || tax.total_tax || tax.amount
        || [tax.cgst_total, tax.sgst_total].filter(Boolean).join(' + ')
        || 'server calculated';
    const warnings = Array.isArray(preview.policy_warnings) && preview.policy_warnings.length > 0
        ? `\nWarnings: ${preview.policy_warnings.join('; ')}`
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
        const validationError = companyInvoiceValidationError(companyInfo, invoice)
            || canonicalInvoiceValidationError(invoice, selectedCustomer);
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
