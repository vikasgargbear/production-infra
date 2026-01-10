/**
 * useInvoiceSave Hook
 * 
 * Handles invoice save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - Atomic stock operations
 * - Background sync
 * - Error rollback
 */

import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import { toast } from 'react-toastify';
import { invoicesApi } from '../../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { getTodayBusinessDate } from '../../../../utils/indianDateUtils';
import { Customer } from '../../../../types/models/customer';
import { storageService, STORAGE_KEYS } from '../../../../services/core/storageService';
import { generateTempId, deductStockLocally } from '../../utils/offlineSaveHelpers';
import { salesDataService } from '../../../../services/offline/modules/sales';
import type { Invoice, InvoiceItem } from './useInvoiceLogic';
import type { CreatedInvoiceData } from '../types/invoiceTypes';

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

/**
 * Hook to handle invoice save with offline-first approach
 */
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

    const [saving, setSaving] = useState(false);

    const handleSaveInvoice = useCallback(async () => {
        try {
            setSaving(true);
            setError(null);

            // Validate invoice
            if (!selectedCustomer) {
                throw new Error('Please select a customer');
            }
            if (invoice.items.length === 0) {
                throw new Error('Please add at least one item');
            }

            // Prepare clean invoice data for backend
            const invoiceData = {
                customer_id: Number(selectedCustomer.customer_id),
                invoice_date: invoice.invoice_date || getTodayBusinessDate(),
                due_date: invoice.due_date,
                items: invoice.items.map(item => ({
                    product_id: Number(item.product_id),
                    batch_id: item.batch_id ? Number(item.batch_id) : undefined,
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
                // M.R. / Salesperson - send to backend
                salesperson_id: invoice.salesperson_id || null,
                // Transport details - for auto-creating challan
                transport_company: invoice.transport_company || '',
                vehicle_number: invoice.vehicle_number || '',
                driver_phone: invoice.driver_phone || '',
                lr_number: invoice.lr_number || '',
                eway_bill_number: invoice.eway_bill_number || ''
            };

            console.log('[Invoice] Prepared invoice data:', JSON.stringify(invoiceData, null, 2));

            // OFFLINE-FIRST: Check network status
            if (!isOnline) {
                console.log('[Invoice] Saving offline - no internet connection');

                // Generate temporary offline invoice number
                const tempId = generateTempId();
                const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

                const offlineInvoice = {
                    ...invoiceData,
                    invoice_number: offlineInvoiceNo,
                    temp_id: tempId,
                    _localId: tempId,
                    sync_status: 'pending',
                    created_offline: true,
                };

                await offlineDB.add('invoices', offlineInvoice);
                await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice as unknown as null);

                // OFFLINE-FIRST: Immediately deduct stock from local IndexedDB
                await deductStockLocally(invoice.items);

                toast.success('✅ Invoice saved offline - Will sync when online', {
                    autoClose: 5000,
                });

                const createdData: CreatedInvoiceData = {
                    invoiceId: tempId,
                    invoiceNumber: offlineInvoiceNo,
                    customerName: selectedCustomer.customer_name,
                    customerPhone: selectedCustomer.phone || '',
                    customerEmail: selectedCustomer.email || '',
                    totalAmount: invoiceData.total_amount,
                    items: invoice.items,
                    isOffline: true
                };

                setCreatedInvoiceData(createdData);
                setShowSuccessModal(true);
                storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);

                setSaving(false);
                return;
            }

            // ============================================================
            // OPTIMISTIC UI: Save locally FIRST, sync to backend in background
            // This gives instant feedback to user while ensuring data integrity
            // ============================================================

            console.log('[Invoice] 🚀 Optimistic save - local first, then background sync');

            // Generate temporary local ID and invoice number
            const tempId = generateTempId();
            const localInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

            // Save locally first (instant)
            const localInvoice = {
                ...invoiceData,
                invoice_number: localInvoiceNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString()
            };

            await offlineDB.add('invoices', localInvoice);

            // Immediately deduct stock from local IndexedDB
            await deductStockLocally(invoice.items);

            // Show success to user IMMEDIATELY (optimistic)
            const createdData: CreatedInvoiceData = {
                invoiceId: tempId,
                invoiceNumber: localInvoiceNo,
                customerName: selectedCustomer.customer_name,
                customerPhone: selectedCustomer.phone || '',
                customerEmail: selectedCustomer.email || '',
                totalAmount: invoiceData.total_amount,
                items: invoice.items,
                isOffline: false
            };

            setInvoice(prev => ({
                ...prev,
                invoice_number: localInvoiceNo
            }));

            setCreatedInvoiceData(createdData);
            setShowSuccessModal(true);
            localStorage.removeItem('invoice_draft');

            console.log('[Invoice] ✅ Local save complete, showing success to user');

            // BACKGROUND SYNC: Send to backend in background (non-blocking)
            // User already sees success, this runs silently
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[Invoice] 📡 Background sync to backend...');
                        const response = await invoicesApi.create(invoiceData);
                        const responseData = response?.data || response;

                        // Update local record with server ID
                        if (responseData?.invoice_id) {
                            await offlineDB.updateLocalId('invoices', tempId, responseData.invoice_id);
                            console.log('[Invoice] ✅ Background sync complete - ID:', responseData.invoice_id);
                        }
                    } catch (syncError) {
                        console.warn('[Invoice] ⚠️ Background sync failed, will retry later:', syncError);
                        // Add to sync queue for later retry
                        await offlineDB.addToSyncQueue('invoices', tempId, 'create', localInvoice);
                    }
                })();
            } else {
                // Offline - add to sync queue
                await offlineDB.addToSyncQueue('invoices', tempId, 'create', localInvoice);
            }

            toast.success('✅ Invoice created successfully');
        } catch (error) {
            const err = error as { response?: { status?: number; data?: { detail?: { error?: string; product_id?: number; required_quantity?: number; available_quantity?: number } } }; code?: string; message?: string };
            console.error('[Invoice] Save failed:', error);

            const errorStatus = err.response?.status;

            // FALLBACK: If backend is unreachable (5xx), save offline instead
            if (errorStatus && (errorStatus >= 500 || err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED')) {
                console.log('[Invoice] Backend unreachable, falling back to offline save...');
                toast.warning('⚠️ Server unavailable - saving locally...', { autoClose: 3000 });

                try {
                    const tempId = generateTempId();
                    const offlineInvoiceNo = await documentNumberGenerator.generateNumber(DOC_TYPES.INVOICE, false);

                    const offlineInvoice = {
                        customer_id: selectedCustomer?.customer_id,
                        invoice_date: invoice.invoice_date,
                        due_date: invoice.due_date,
                        items: invoice.items.map(item => ({
                            product_id: item.product_id,
                            batch_id: item.batch_id,
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
                        salesperson_id: invoice.salesperson_id || null,
                        invoice_number: offlineInvoiceNo,
                        temp_id: tempId,
                        _localId: tempId,
                        sync_status: 'pending',
                        created_offline: true,
                        fallback_reason: `Backend returned ${errorStatus}`
                    };

                    await offlineDB.add('invoices', offlineInvoice);
                    await offlineDB.addToSyncQueue('invoices', tempId, 'create', offlineInvoice as unknown as null);

                    toast.success('✅ Invoice saved locally - will sync when server is back', {
                        autoClose: 5000,
                    });

                    const createdData: CreatedInvoiceData = {
                        invoiceId: tempId,
                        invoiceNumber: offlineInvoiceNo,
                        customerName: selectedCustomer?.customer_name || '',
                        customerPhone: selectedCustomer?.phone || '',
                        customerEmail: selectedCustomer?.email || '',
                        totalAmount: invoice.final_amount || 0,
                        items: invoice.items,
                        isOffline: true
                    };

                    setCreatedInvoiceData(createdData);
                    setShowSuccessModal(true);
                    storageService.removeItem(STORAGE_KEYS.INVOICE_DRAFT);
                    return;
                } catch (offlineError) {
                    console.error('[Invoice] Offline fallback also failed:', offlineError);
                    setError('Failed to save both online and offline');
                    toast.error('❌ Save failed - please try again');
                }
            } else if (errorStatus === 409 && err.response?.data?.detail?.error === 'INSUFFICIENT_STOCK') {
                const details = err.response.data.detail;
                setError(`Insufficient stock: Product ${details.product_id} - Required ${details.required_quantity}, Available ${details.available_quantity}`);
                toast.error(`❌ Insufficient Stock: Only ${details.available_quantity} units available`, {
                    autoClose: 8000
                });
            } else {
                setError(err.message || 'Failed to create invoice');
                toast.error(err.message || 'Failed to create invoice');
            }
        } finally {
            setSaving(false);
        }
    }, [invoice, selectedCustomer, isOnline, setInvoice, setCreatedInvoiceData, setShowSuccessModal, setError]);

    return {
        saving,
        handleSaveInvoice
    };
}

export default useInvoiceSave;
