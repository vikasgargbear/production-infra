/**
 * useSalesReturnSave Hook
 *
 * Handles sales return save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - Stock ADDITION via restockBatchesLocally (goods returned by customer)
 * - Background sync
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { returnsApi } from '../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../sales/utils/offlineSaveHelpers';

export interface UseSalesReturnSaveProps {
    returnData: any;
    isOnline: boolean;
    validateReturn: () => boolean;
    onClose: () => void;
}

export interface UseSalesReturnSaveReturn {
    saving: boolean;
    handleSaveReturn: () => Promise<void>;
}

export function useSalesReturnSave(props: UseSalesReturnSaveProps): UseSalesReturnSaveReturn {
    const {
        returnData,
        isOnline,
        validateReturn,
        onClose
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSaveReturn = useCallback(async () => {
        if (!validateReturn()) return;

        setSaving(true);
        try {
            // Generate temp ID
            const tempId = generateTempId();
            const localReturnNo = await documentNumberGenerator.generateNumber(DOC_TYPES.SALES_RETURN, false);

            // Save locally first (instant)
            const localReturn = {
                ...returnData,
                return_number: localReturnNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('sales_returns', localReturn);

            // SALES RETURN = GOODS RETURNED BY CUSTOMER → Add stock back locally
            const items = returnData.items || [];
            const stockAdditions = items
                .filter((item: any) => item.batch_id && item.return_quantity > 0)
                .map((item: any) => ({
                    product_id: item.product_id,
                    batch_id: item.batch_id,
                    quantity: parseFloat(String(item.return_quantity))
                }));

            if (stockAdditions.length > 0) {
                await offlineDB.addStockLocally(stockAdditions);
                console.log(`[SalesReturn] ✅ Restocked ${stockAdditions.length} items locally`);
            }

            toast.success('Sales return saved successfully');

            console.log('[SalesReturn] ✅ Local save complete');

            // BACKGROUND SYNC
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[SalesReturn] 📡 Background sync to backend...');
                        const response = await returnsApi.createSaleReturn(returnData);

                        if (response.data?.return_id) {
                            await offlineDB.updateLocalId('sales_returns', tempId, response.data.return_id);
                            console.log('[SalesReturn] ✅ Background sync complete - ID:', response.data.return_id);
                        }
                    } catch (syncError) {
                        console.warn('[SalesReturn] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('sales_returns', tempId, 'create', localReturn);
                    }
                })();
            } else {
                await offlineDB.addToSyncQueue('sales_returns', tempId, 'create', localReturn);
            }

            setTimeout(() => onClose(), 2500);
        } catch (error: any) {
            const errorMessage = Array.isArray(error.message)
                ? error.message[0]?.msg || 'Failed to create return'
                : error.message || 'Failed to create return';
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [returnData, isOnline, validateReturn, onClose]);

    return {
        saving,
        handleSaveReturn
    };
}

export default useSalesReturnSave;
