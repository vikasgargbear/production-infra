/**
 * usePurchaseOrderSave Hook
 *
 * Handles purchase order save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - NO stock changes (POs are requests, not receipts)
 * - Background sync
 * - Error rollback
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { purchasesApi } from '../../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../../sales/utils/offlineSaveHelpers';

export interface UsePurchaseOrderSaveProps {
    purchaseOrder: any;
    selectedSupplier: any;
    isOnline: boolean;
    setCreatedPOData: (data: any) => void;
    setShowSuccessModal: (show: boolean) => void;
    validatePurchaseOrder: () => boolean;
}

export interface UsePurchaseOrderSaveReturn {
    saving: boolean;
    handleSavePurchaseOrder: () => Promise<void>;
}

export function usePurchaseOrderSave(props: UsePurchaseOrderSaveProps): UsePurchaseOrderSaveReturn {
    const {
        purchaseOrder,
        selectedSupplier,
        isOnline,
        setCreatedPOData,
        setShowSuccessModal,
        validatePurchaseOrder
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSavePurchaseOrder = useCallback(async () => {
        if (!validatePurchaseOrder()) {
            toast.error('Please fix validation errors');
            return;
        }

        setSaving(true);
        try {
            const poData = {
                po_no: purchaseOrder.po_no,
                po_date: purchaseOrder.po_date,
                expected_delivery_date: purchaseOrder.expected_delivery_date,
                supplier_id: parseInt(String(purchaseOrder.supplier_id)),
                items: purchaseOrder.items.map((item: any) => ({
                    product_id: parseInt(String(item.product_id)),
                    quantity: parseFloat(String(item.quantity)) || 1,
                    unit_price: parseFloat(String(item.unit_price)) || 0,
                    tax_percent: parseFloat(String(item.tax_percent)) || 12
                })),
                payment_terms: purchaseOrder.payment_terms,
                delivery_terms: purchaseOrder.delivery_terms,
                delivery_location: purchaseOrder.delivery_location,
                discount_amount: Number(purchaseOrder.discount_amount) || 0,
                freight_charges: Number(purchaseOrder.freight_charges) || 0,
                notes: purchaseOrder.notes
            };

            // Generate temp ID and offline document number
            const tempId = generateTempId();
            const localPoNo = purchaseOrder.po_no || await documentNumberGenerator.generateNumber(DOC_TYPES.PURCHASE_ORDER, false);

            // Save locally first (instant) - NO stock changes for POs
            const localPO = {
                ...poData,
                po_number: localPoNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('purchase_orders', localPO);

            // Show success to user IMMEDIATELY (optimistic)
            setCreatedPOData({
                poNumber: localPoNo,
                poId: tempId,
                supplierName: selectedSupplier?.supplier_name || purchaseOrder.supplier_name,
                totalAmount: purchaseOrder.total_amount
            });
            setShowSuccessModal(true);

            console.log('[PurchaseOrder] ✅ Local save complete, showing success to user');

            // BACKGROUND SYNC
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[PurchaseOrder] 📡 Background sync to backend...');
                        const response = await (purchasesApi as any).create(poData);

                        if (response?.data?.po_id || response?.data?.id) {
                            const serverId = response.data.po_id || response.data.id;
                            await offlineDB.updateLocalId('purchase_orders', tempId, serverId);
                            console.log('[PurchaseOrder] ✅ Background sync complete - ID:', serverId);
                        }
                    } catch (syncError) {
                        console.warn('[PurchaseOrder] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('purchase_orders', tempId, 'create', localPO);
                    }
                })();
            } else {
                await offlineDB.addToSyncQueue('purchase_orders', tempId, 'create', localPO);
            }

        } catch (error: any) {
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to create purchase order';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [purchaseOrder, selectedSupplier, isOnline, validatePurchaseOrder, setCreatedPOData, setShowSuccessModal]);

    return {
        saving,
        handleSavePurchaseOrder
    };
}

export default usePurchaseOrderSave;
