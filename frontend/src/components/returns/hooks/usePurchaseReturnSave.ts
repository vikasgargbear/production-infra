/**
 * usePurchaseReturnSave Hook
 *
 * Handles purchase return save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - Stock DEDUCTION via deductStockLocally (goods returned to supplier)
 * - Background sync
 */

import { useState, useCallback } from 'react';
import { returnsApi } from '../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../sales/utils/offlineSaveHelpers';

export interface UsePurchaseReturnSaveProps {
    returnData: any;
    selectedInvoice: any;
    isOnline: boolean;
    validateReturn: () => boolean;
    onClose: () => void;
    toast: any;
}

export interface UsePurchaseReturnSaveReturn {
    saving: boolean;
    handleSaveReturn: () => Promise<void>;
}

export function usePurchaseReturnSave(props: UsePurchaseReturnSaveProps): UsePurchaseReturnSaveReturn {
    const {
        returnData,
        selectedInvoice,
        isOnline,
        validateReturn,
        onClose,
        toast
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSaveReturn = useCallback(async () => {
        if (!validateReturn()) return;

        setSaving(true);
        try {
            // Filter items to only selected ones with quantity
            const filteredItems = returnData.items.filter((item: any) => {
                const hasQuantity = (item.return_quantity || 0) > 0;
                return item.selected && hasQuantity;
            });

            // Build return payload (same as original handleSaveReturn)
            const returnPayload = {
                ...returnData,
                purchase_id: selectedInvoice?.supplier_invoice_id || selectedInvoice?.invoice_id,
                reason: returnData.return_reason,
                original_purchase: selectedInvoice,
                items: filteredItems.map((item: any) => ({
                    invoice_item_id: item.invoice_item_id || item.id,
                    product_id: item.product_id,
                    batch_id: item.batch_id,
                    batch_number: item.batch_number,
                    return_quantity: item.return_quantity,
                    quantity: item.return_quantity,
                    unit_price: parseFloat((item.unit_price || 0).toString()),
                    cost_per_unit: parseFloat((item.unit_price || 0).toString()),
                    discount_percent: item.discount_percent || 0,
                    tax_percent: item.tax_percent || item.gst_percent || 0,
                    return_reason: item.return_reason || returnData.return_reason,
                    selected: true,
                    restock: item.restock !== false,
                    disposition: item.restock !== false ? 'RESTOCK' : 'DESTROY'
                }))
            };

            // Generate temp ID
            const tempId = generateTempId();
            const localReturnNo = await documentNumberGenerator.generateNumber(DOC_TYPES.PURCHASE_RETURN, false);

            // Save locally first (instant)
            const localReturn = {
                ...returnPayload,
                return_number: localReturnNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('purchase_returns', localReturn);

            // PURCHASE RETURN = GOODS RETURNED TO SUPPLIER → Deduct stock locally
            const stockDeductions = filteredItems
                .filter((item: any) => item.batch_id && item.return_quantity > 0)
                .map((item: any) => ({
                    product_id: item.product_id,
                    batch_id: item.batch_id,
                    quantity: parseFloat(String(item.return_quantity))
                }));

            if (stockDeductions.length > 0) {
                await offlineDB.deductStockLocally(stockDeductions);
                console.log(`[PurchaseReturn] ✅ Deducted stock for ${stockDeductions.length} items locally`);
            }

            toast.success('Purchase return created successfully');

            console.log('[PurchaseReturn] ✅ Local save complete');

            // BACKGROUND SYNC
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[PurchaseReturn] 📡 Background sync to backend...');
                        const response = await returnsApi.createPurchaseReturn(returnPayload);

                        if (response.data?.return_id) {
                            await offlineDB.updateLocalId('purchase_returns', tempId, response.data.return_id);
                            console.log('[PurchaseReturn] ✅ Background sync complete - ID:', response.data.return_id);
                        }
                    } catch (syncError) {
                        console.warn('[PurchaseReturn] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('purchase_returns', tempId, 'create', localReturn);
                    }
                })();
            } else {
                await offlineDB.addToSyncQueue('purchase_returns', tempId, 'create', localReturn);
            }

            setTimeout(() => onClose(), 1500);
        } catch (error: any) {
            const errorMessage = error.message || 'Failed to create return';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [returnData, selectedInvoice, isOnline, validateReturn, onClose, toast]);

    return {
        saving,
        handleSaveReturn
    };
}

export default usePurchaseReturnSave;
