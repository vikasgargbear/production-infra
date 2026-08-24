/**
 * useInvoiceSave Hook
 *
 * Thin wrapper around useDocumentSave for sales invoices.
 * Stock DEDUCTION (goods sold to customer).
 * Supports fallbackToOffline (5xx) and handleConflict (409 INSUFFICIENT_STOCK).
 */

import { Dispatch, SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { useDocumentSave } from '../../../global/hooks/useDocumentSave';
import { invoicesApi } from '../../../../services/api';
import { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import { getTodayBusinessDate } from '../../../../utils/indianDateUtils';
import { Customer } from '../../../../types/models/customer';
import { storageService, STORAGE_KEYS } from '../../../../services/core/storageService';
import { deductStockLocally } from '../../utils/offlineSaveHelpers';
import type { Invoice } from './useInvoiceLogic';
import type { CreatedInvoiceData } from '../types/invoiceTypes';
import { showFinancialEntryNotification } from '../../../../utils/financialEntryNotifier';
import { clientUuid } from '../../../../utils/clientUuid';
import {
    buildCanonicalInvoicePreparePayload,
    canonicalInvoiceValidationError,
} from '../utils/canonicalInvoiceCommand';

export interface UseInvoiceSaveProps {
    invoice: Invoice;
    selectedCustomer: Customer | null;
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

export function useInvoiceSave(props: UseInvoiceSaveProps): UseInvoiceSaveReturn {
    const {
        invoice,
        selectedCustomer,
        isOnline,
        setInvoice,
        setCreatedInvoiceData,
        setShowSuccessModal,
        setError
    } = props;

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.INVOICE,
        idbStoreName: 'invoices',
        entityType: 'invoices',
        serverIdField: 'invoice_id',
        docNumberField: 'invoice_number',
        isOnline,
        fallbackToOffline: true,

        validate: () => {
            setError(null);
            return canonicalInvoiceValidationError(invoice, selectedCustomer);
        },

        preparePayload: () => ({
            customer_id: String(selectedCustomer!.customer_id),
            invoice_date: invoice.invoice_date || getTodayBusinessDate(),
            due_date: invoice.due_date,
            items: invoice.items.map(item => ({
                product_id: String(item.product_id),
                batch_id: item.batch_id ? String(item.batch_id) : undefined,
                quantity: parseFloat(String(item.quantity)) || 0,
                free_quantity: parseFloat(String(item.free_quantity)) || 0,
                unit_price: parseFloat(String(item.unit_price)) || 0,
                mrp: parseFloat(String(item.mrp)) || 0,
                discount_percent: parseFloat(String(item.discount_percent)) || 0,
                gst_percent: parseFloat(String(item.gst_percent)) || 0
            })),
            discount_type: invoice.discount_type || 'percentage',
            discount_percent: parseFloat(String(invoice.discount_percent)) || 0,
            discount_amount: parseFloat(String(invoice.discount_amount)) || 0,
            freight_charges: parseFloat(String(invoice.freight_charges)) || 0,
            delivery_type: invoice.delivery_type || 'PICKUP',
            payment_mode: invoice.payment_mode || 'cash',
            payment_status: invoice.payment_status || 'pending',
            payments: (invoice.payments || []).map(p => ({
                method: p.method,
                amount: parseFloat(String(p.amount)) || 0
            })),
            billing_address: invoice.billing_address || '',
            shipping_address: invoice.shipping_address || '',
            notes: invoice.notes || '',
            gst_type: invoice.gst_type || 'CGST/SGST',
            total_amount: invoice.final_amount || 0,
            salesperson_id: invoice.salesperson_id || null,
            transport_company: invoice.transport_company || '',
            vehicle_number: invoice.vehicle_number || '',
            driver_phone: invoice.driver_phone || '',
            lr_number: invoice.lr_number || '',
            eway_bill_number: invoice.eway_bill_number || ''
        }),

        apiCall: () => invoicesApi.createCanonical(
            buildCanonicalInvoicePreparePayload(
                invoice,
                selectedCustomer!,
                `erp-web-invoice:${clientUuid()}`,
            ),
        ),

        stockOperation: async () => {
            await deductStockLocally(invoice.items);
        },

        handleConflict: (syncError: any) => {
            if (syncError.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
                const details = syncError.response.data.detail;
                setError(`Insufficient stock: Product ${details.product_id} - Required ${details.required_quantity}, Available ${details.available_quantity}`);
                toast.error(`Insufficient Stock: Only ${details.available_quantity} units available`, {
                    autoClose: 8000
                });
            }
        },

        onSuccess: (tempId: string, docNo: string) => {
            setInvoice(prev => ({ ...prev, invoice_number: docNo }));

            const createdData: CreatedInvoiceData = {
                invoiceId: tempId,
                invoiceNumber: docNo,
                customerName: selectedCustomer!.customer_name,
                customerPhone: selectedCustomer!.primary_phone || '',
                customerEmail: selectedCustomer!.primary_email || '',
                totalAmount: invoice.final_amount || 0,
                items: invoice.items,
                isOffline: !isOnline
            };

            setCreatedInvoiceData(createdData);
            setShowSuccessModal(true);
            storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);
            localStorage.removeItem('invoice_draft');
        },

        onServerSuccess: (_response: any, _tempId: string, docNo: string) => {
            showFinancialEntryNotification({
                title: 'Sales Invoice Posted',
                reference: docNo,
                amount: invoice.final_amount,
                status: 'confirmed',
                impacts: [
                    'The invoice is committed to the backend sales ledger.',
                    'Inventory is reduced against the selected batches.',
                    'Customer receivable and outstanding balances are refreshed.',
                    'Output GST values are recorded for compliance reporting.'
                ]
            });
        },

        onSyncQueued: (_tempId: string, docNo: string, payload: any) => {
            showFinancialEntryNotification({
                title: 'Sales Invoice Saved Locally',
                reference: docNo,
                amount: payload.total_amount,
                status: 'queued',
                impacts: [
                    'The invoice is stored locally and queued for backend posting.',
                    'Stock is reserved on this device immediately.',
                    'Receivable and GST confirmation will appear after sync succeeds.'
                ]
            });
        },
    });

    return { saving, handleSaveInvoice: handleSave };
}

export default useInvoiceSave;
