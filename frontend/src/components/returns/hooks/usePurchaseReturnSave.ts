/**
 * usePurchaseReturnSave Hook
 *
 * Thin wrapper around useDocumentSave for purchase returns.
 * Stock DEDUCTION (goods returned to supplier).
 */

import { useDocumentSave } from '../../global/hooks/useDocumentSave';
import { returnsApi } from '../../../services/api';
import { DOC_TYPES } from '../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../services/offline/core/offlineDatabase';

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
    const { returnData, selectedInvoice, isOnline, validateReturn, onClose, toast } = props;

    const buildPayload = () => {
        const filteredItems = returnData.items.filter((item: any) => {
            const hasQuantity = (item.return_quantity || 0) > 0;
            return item.selected && hasQuantity;
        });

        return {
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
    };

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.PURCHASE_RETURN,
        idbStoreName: 'purchase_returns',
        entityType: 'purchase_returns',
        serverIdField: 'return_id',
        docNumberField: 'return_number',
        isOnline,

        validate: () => {
            if (!validateReturn()) return 'Please fix validation errors';
            return null;
        },

        preparePayload: buildPayload,

        apiCall: (data: any) => returnsApi.createPurchaseReturn(data),

        stockOperation: async () => {
            const payload = buildPayload();
            const stockDeductions = payload.items
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
        },

        onSuccess: () => {
            toast.success('Purchase return created successfully');
            setTimeout(() => onClose(), 1500);
        },
    });

    return { saving, handleSaveReturn: handleSave };
}

export default usePurchaseReturnSave;
