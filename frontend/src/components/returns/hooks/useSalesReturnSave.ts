/**
 * useSalesReturnSave Hook
 *
 * Thin wrapper around useDocumentSave for sales returns.
 * Stock ADDITION (goods returned by customer).
 */

import { toast } from 'react-toastify';
import { useDocumentSave } from '../../global/hooks/useDocumentSave';
import { returnsApi } from '../../../services/api';
import { DOC_TYPES } from '../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { showFinancialEntryNotification } from '../../../utils/financialEntryNotifier';

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
    const { returnData, isOnline, validateReturn, onClose } = props;

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.SALES_RETURN,
        idbStoreName: 'sales_returns',
        entityType: 'sales_returns',
        serverIdField: 'return_id',
        docNumberField: 'return_number',
        isOnline,

        validate: () => {
            if (!validateReturn()) return 'Please fix validation errors';
            return null;
        },

        preparePayload: () => returnData,

        apiCall: (data: any) => returnsApi.createSaleReturn(data),

        stockOperation: async () => {
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
        },

        onSuccess: () => {
            toast.success('Sales return saved successfully');
            setTimeout(() => onClose(), 2500);
        },

        onServerSuccess: (_response: any, _tempId: string, docNo: string, payload: any) => {
            showFinancialEntryNotification({
                title: 'Sales Return Posted',
                reference: docNo,
                amount: payload.total_amount,
                status: 'confirmed',
                impacts: [
                    'The sales return is committed to the backend.',
                    'Inventory and batch balances are adjusted for the returned quantities.',
                    'Customer credit or outstanding balances are updated.',
                    'Sales GST reversal values are available for compliance reporting.'
                ]
            });
        },

        onSyncQueued: (_tempId: string, docNo: string, payload: any) => {
            showFinancialEntryNotification({
                title: 'Sales Return Saved Locally',
                reference: docNo,
                amount: payload.total_amount,
                status: 'queued',
                impacts: [
                    'The sales return is queued for backend posting.',
                    'Returned stock is updated on this device immediately.',
                    'Customer credit and GST reversal will confirm after sync succeeds.'
                ]
            });
        },
    });

    return { saving, handleSaveReturn: handleSave };
}

export default useSalesReturnSave;
