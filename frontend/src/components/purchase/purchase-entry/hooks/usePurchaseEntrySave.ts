/**
 * usePurchaseEntrySave Hook
 *
 * Handles purchase entry (GRN) save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - Stock ADDITION via addStockLocally (GRN = goods received)
 * - Background sync
 * - Error rollback
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { purchasesApi } from '../../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../../sales/utils/offlineSaveHelpers';

export interface UsePurchaseEntrySaveProps {
    purchase: any;
    selectedSupplier: any;
    isOnline: boolean;
    setCreatedPurchaseData: (data: any) => void;
    setShowSuccessModal: (show: boolean) => void;
    validatePurchase: () => boolean;
    generateInvoiceNumber: () => string;
}

export interface UsePurchaseEntrySaveReturn {
    saving: boolean;
    handleSavePurchase: () => Promise<void>;
}

export function usePurchaseEntrySave(props: UsePurchaseEntrySaveProps): UsePurchaseEntrySaveReturn {
    const {
        purchase,
        selectedSupplier,
        isOnline,
        setCreatedPurchaseData,
        setShowSuccessModal,
        validatePurchase,
        generateInvoiceNumber
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSavePurchase = useCallback(async () => {
        if (!validatePurchase()) {
            toast.error('Please fix validation errors');
            return;
        }

        const itemsWithoutExpiry = purchase.items.filter((item: any) => !item.expiry_date);
        if (itemsWithoutExpiry.length > 0) {
            toast.error(`Please add expiry dates for all items. ${itemsWithoutExpiry.length} item(s) missing expiry date.`);
            return;
        }

        const invoiceNumber = purchase.supplier_invoice_number || generateInvoiceNumber();

        setSaving(true);
        try {
            const purchaseData = {
                supplier_invoice_number: invoiceNumber,
                invoice_date: purchase.invoice_date,
                supplier_id: parseInt(String(purchase.supplier_id)),
                subtotal_amount: purchase.gross_amount || 0,
                tax_amount: purchase.tax_amount || 0,
                discount_amount: purchase.discount_amount || 0,
                total_amount: purchase.total_amount || 0,
                other_charges: purchase.other_charges || 0,
                items: purchase.items.map((item: any) => {
                    let productId: number | null = null;
                    if (item.product_id && item.product_id !== item.id) {
                        const parsed = parseInt(String(item.product_id));
                        if (!isNaN(parsed) && parsed > 0 && parsed < 2147483647) {
                            productId = parsed;
                        }
                    }
                    return {
                        po_item_id: item.po_item_id || undefined,
                        product_id: productId,
                        product_name: item.product_name || '',
                        batch_number: item.batch_number || '',
                        expiry_date: item.expiry_date || null,
                        manufacturing_date: item.manufacturing_date || null,
                        ordered_quantity: parseFloat(String(item.ordered_quantity || item.quantity)) || 1,
                        quantity: parseFloat(String(item.quantity)) || 1,
                        free_quantity: parseFloat(String(item.free_quantity)) || 0,
                        unit_price: parseFloat(String(item.unit_price)) || 0,
                        mrp: parseFloat(String(item.mrp)) || 0,
                        selling_price: parseFloat(String(item.selling_price || item.sale_price)) || 0,
                        discount_percent: parseFloat(String(item.discount_percent)) || 0,
                        tax_percent: parseFloat(String(item.tax_percent)) || 12,
                        pack_type: item.pack_type || 'STRIP',
                        pack_size: parseInt(String(item.pack_size)) || 10,
                        packages_per_box: parseInt(String(item.packages_per_box)) || 10,
                        hsn_code: item.hsn_code || '',
                        category: item.category || '',
                        brand_name: item.brand_name || ''
                    };
                }),
                payment_methods: purchase.payment_methods?.length > 0
                    ? purchase.payment_methods
                    : [{ method: 'cash', amount: purchase.total_amount }],
                payment_mode: purchase.payment_methods?.length > 0
                    ? purchase.payment_methods[0].method.toLowerCase()
                    : 'cash',
                payment_status: purchase.payment_status || 'pending',
                notes: purchase.notes,
                transport_company: purchase.transport_company,
                vehicle_number: purchase.vehicle_number,
                lr_number: purchase.lr_number,
                purchase_order_id: purchase.purchase_order_id || undefined
            };

            // Generate temp ID
            const tempId = generateTempId();
            const localInvoiceNo = invoiceNumber || await documentNumberGenerator.generateNumber(DOC_TYPES.GRN, false);

            // Save locally first (instant)
            const localEntry = {
                ...purchaseData,
                invoice_number: localInvoiceNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('purchase_entries', localEntry);

            // GRN = GOODS RECEIVED → Add stock locally
            const stockAdditions = purchase.items
                .filter((item: any) => item.product_id && item.quantity > 0)
                .map((item: any) => ({
                    product_id: item.product_id,
                    batch_id: item.batch_id || `temp_batch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    quantity: parseFloat(String(item.quantity)) + parseFloat(String(item.free_quantity || 0)),
                    batch_data: {
                        batch_number: item.batch_number || '',
                        expiry_date: item.expiry_date,
                        manufacturing_date: item.manufacturing_date,
                        mrp_per_unit: parseFloat(String(item.mrp)) || 0,
                        sale_price_per_unit: parseFloat(String(item.selling_price || item.sale_price)) || 0,
                        cost_per_unit: parseFloat(String(item.unit_price)) || 0,
                        batch_status: 'active'
                    }
                }));

            if (stockAdditions.length > 0) {
                await offlineDB.addStockLocally(stockAdditions);
                console.log(`[PurchaseEntry] ✅ Added stock for ${stockAdditions.length} items locally`);
            }

            // Show success to user IMMEDIATELY (optimistic)
            setCreatedPurchaseData({
                purchaseNumber: localInvoiceNo,
                purchaseId: tempId,
                supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
                totalAmount: purchase.total_amount
            });
            setShowSuccessModal(true);

            console.log('[PurchaseEntry] ✅ Local save complete, showing success to user');

            // BACKGROUND SYNC
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[PurchaseEntry] 📡 Background sync to backend...');
                        const response = await (purchasesApi as any).createEntry(purchaseData);

                        if (response?.data?.purchase_id || response?.data?.id) {
                            const serverId = response.data.purchase_id || response.data.id;
                            await offlineDB.updateLocalId('purchase_entries', tempId, serverId);
                            console.log('[PurchaseEntry] ✅ Background sync complete - ID:', serverId);
                        }
                    } catch (syncError) {
                        console.warn('[PurchaseEntry] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('purchase_entries', tempId, 'create', localEntry);
                    }
                })();
            } else {
                await offlineDB.addToSyncQueue('purchase_entries', tempId, 'create', localEntry);
            }

        } catch (error: any) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [purchase, selectedSupplier, isOnline, validatePurchase, generateInvoiceNumber, setCreatedPurchaseData, setShowSuccessModal]);

    return {
        saving,
        handleSavePurchase
    };
}

export default usePurchaseEntrySave;
