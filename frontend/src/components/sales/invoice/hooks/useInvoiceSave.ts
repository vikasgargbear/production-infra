/**
 * API-only invoice submission.
 *
 * A Sales invoice is successful only after the canonical command has executed
 * and the server read-back supplies its final ID and number. Nothing is written
 * to IndexedDB and failed requests are never converted into local documents.
 */

import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { invoicesApi } from '../../../../services/api';
import { Customer } from '../../../../types/models/customer';
import type { CompanyInfo } from '../../../../types/common/company.types';
import { showFinancialEntryNotification } from '../../../../utils/financialEntryNotifier';
import { clientUuid } from '../../../../utils/clientUuid';
import type { Invoice } from './useInvoiceLogic';
import type { CreatedInvoiceData } from '../types/invoiceTypes';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import { normalizeAuthoritativeDecimal } from '../../../../utils/exactDecimal';
import {
    buildCanonicalInvoicePreparePayload,
    invoicePreviewValidationError,
} from '../utils/canonicalInvoiceCommand';
import { requireCanonicalPostingDate } from '../../../../utils/canonicalPostingDate';

export interface UseInvoiceSaveProps {
    invoice: Invoice;
    selectedCustomer: Customer | null;
    companyInfo: CompanyInfo | null;
    documentPolicy: CanonicalDocumentPolicy | null;
    businessDate: string;
    isOnline: boolean;
    setInvoice: Dispatch<SetStateAction<Invoice>>;
    setCreatedInvoiceData: Dispatch<SetStateAction<CreatedInvoiceData | null>>;
    setShowSuccessModal: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    prepareDraft?: (commandPayload: Record<string, unknown>) => Promise<CanonicalCommandPreview>;
}

export interface UseInvoiceSaveReturn {
    saving: boolean;
    preparedPreview: CanonicalCommandPreview | null;
    reviewOpen: boolean;
    handleSaveInvoice: () => Promise<void>;
    confirmPreparedInvoice: () => Promise<void>;
    closeInvoiceReview: () => void;
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

export function useInvoiceSave(props: UseInvoiceSaveProps): UseInvoiceSaveReturn {
    const {
        invoice,
        selectedCustomer,
        companyInfo,
        documentPolicy,
        businessDate,
        isOnline,
        setInvoice,
        setCreatedInvoiceData,
        setShowSuccessModal,
        setError,
        prepareDraft,
    } = props;
    const [saving, setSaving] = useState(false);
    const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const executedResourceId = useRef<string | null>(null);
    const idempotencyKey = useRef(`erp-web-invoice:${clientUuid()}`);
    const lifecycleId = useRef(clientUuid());
    const preparedFingerprint = useRef<string | null>(null);

    const handleSaveInvoice = useCallback(async () => {
        setError(null);
        const validationError = invoicePreviewValidationError(companyInfo, invoice, selectedCustomer);
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            return;
        }
        try {
            requireCanonicalPostingDate(invoice.invoice_date, businessDate, 'Invoice date');
        } catch (dateError) {
            const message = dateError instanceof Error ? dateError.message : 'Invoice date is invalid.';
            setError(message);
            toast.error(message);
            return;
        }

        if (!isOnline) {
            const message = 'Invoice submission requires an API connection. No local or queued invoice was created.';
            setError(message);
            toast.error(message);
            return;
        }

        if (saving) return;
        setSaving(true);
        try {
            let payload = buildCanonicalInvoicePreparePayload(
                invoice,
                selectedCustomer!,
                idempotencyKey.current,
                documentPolicy,
            );
            let fingerprint = JSON.stringify(payload);
            if (preparedFingerprint.current && preparedFingerprint.current !== fingerprint) {
                idempotencyKey.current = `erp-web-invoice:${clientUuid()}`;
                lifecycleId.current = clientUuid();
                executedResourceId.current = null;
                setPreparedPreview(null);
                payload = buildCanonicalInvoicePreparePayload(
                    invoice,
                    selectedCustomer!,
                    idempotencyKey.current,
                    documentPolicy,
                );
                fingerprint = JSON.stringify(payload);
            }
            if (!preparedPreview || preparedFingerprint.current !== fingerprint) {
                const prepared = prepareDraft
                    ? await prepareDraft(payload)
                    : (await invoicesApi.prepareCanonical(payload)).data;
                preparedFingerprint.current = fingerprint;
                setPreparedPreview(prepared);
            }
            setReviewOpen(true);
        } catch (error) {
            const message = formatInvoiceSubmissionError(error);
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [
        companyInfo,
        businessDate,
        documentPolicy,
        invoice,
        isOnline,
        preparedPreview,
        prepareDraft,
        saving,
        selectedCustomer,
        setError,
    ]);

    const confirmPreparedInvoice = useCallback(async () => {
        if (!preparedPreview || saving) return;
        if (!selectedCustomer) {
            const message = 'The selected customer changed after review. Return and prepare the invoice again.';
            setError(message);
            toast.error(message);
            return;
        }

        setSaving(true);
        try {
            if (!executedResourceId.current) {
                const executed = await invoicesApi.executePreparedCanonical(preparedPreview, lifecycleId.current);
                const invoiceId = executed?.data?.invoice_id;
                if (!executed?.data?.success || !invoiceId) {
                    throw new Error('The API did not confirm the invoice. No invoice was created.');
                }
                executedResourceId.current = String(invoiceId);
            }

            const invoiceId = executedResourceId.current;
            const readback = (await invoicesApi.getCanonicalPostingReadback(invoiceId)).data;
            if (!readback || String(readback.sales_invoice_id) !== invoiceId) {
                throw new Error('Invoice posted, but authoritative readback could not be verified. Retry to perform GET-only reconciliation.');
            }
            if (typeof readback.invoice_number !== 'string' || !readback.invoice_number.trim()) {
                throw new Error('Invoice posted, but authoritative readback omitted its invoice number.');
            }
            const invoiceNumber = readback.invoice_number.trim();

            const authoritativeTotal = normalizeAuthoritativeDecimal(
                readback.invoice_total,
                'Posted invoice total',
                { scale: 2 },
            );
            setInvoice(previous => ({ ...previous, invoice_number: invoiceNumber }));
            setCreatedInvoiceData({
                invoiceId: String(invoiceId),
                invoiceNumber,
                customerName: selectedCustomer!.customer_name,
                customerPhone: selectedCustomer!.primary_phone || '',
                customerEmail: selectedCustomer!.primary_email || '',
                totalAmount: authoritativeTotal,
                isOffline: false,
            });
            setShowSuccessModal(true);
            showFinancialEntryNotification({
                title: 'Sales Invoice Posted',
                reference: invoiceNumber,
                amount: authoritativeTotal,
                status: 'confirmed',
                impacts: [
                    'The invoice is committed to the backend sales ledger.',
                    'Inventory is reduced against the selected batches.',
                    'Customer receivable and outstanding balances are refreshed.',
                    'Output GST values are recorded for compliance reporting.',
                ],
            });
            executedResourceId.current = null;
            preparedFingerprint.current = null;
            idempotencyKey.current = `erp-web-invoice:${clientUuid()}`;
            lifecycleId.current = clientUuid();
            setPreparedPreview(null);
            setReviewOpen(false);
        } catch (error) {
            const message = formatInvoiceSubmissionError(error);
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [
        preparedPreview,
        saving,
        selectedCustomer,
        setCreatedInvoiceData,
        setError,
        setInvoice,
        setShowSuccessModal,
    ]);

    return {
        saving,
        preparedPreview,
        reviewOpen,
        handleSaveInvoice,
        confirmPreparedInvoice,
        closeInvoiceReview: () => setReviewOpen(false),
    };
}

export default useInvoiceSave;
