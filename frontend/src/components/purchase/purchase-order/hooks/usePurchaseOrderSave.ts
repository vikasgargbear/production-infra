/**
 * usePurchaseOrderSave Hook
 *
 * Thin wrapper around useDocumentSave for purchase orders.
 * NO stock changes (POs are requests, not receipts).
 */

import { useDocumentSave } from '../../../global/hooks/useDocumentSave';
import { purchasesApi } from '../../../../services/api';
import { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';

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

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.PURCHASE_ORDER,
        idbStoreName: 'purchase_orders',
        entityType: 'purchase_orders',
        serverIdField: 'po_id',
        docNumberField: 'po_number',
        isOnline,

        validate: () => {
            if (!validatePurchaseOrder()) return 'Please fix validation errors';
            return null;
        },

        preparePayload: () => ({
            po_no: purchaseOrder.po_no,
            po_date: purchaseOrder.po_date,
            expected_delivery_date: purchaseOrder.expected_delivery_date,
            supplier_id: String(purchaseOrder.supplier_id),
            items: purchaseOrder.items.map((item: any) => ({
                product_id: String(item.product_id),
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
        }),

        getDocNumber: async () => {
            const { default: documentNumberGenerator } = await import('../../../../services/offline/documents/documentNumberGenerator');
            return purchaseOrder.po_no || await documentNumberGenerator.generateNumber(DOC_TYPES.PURCHASE_ORDER, false);
        },

        apiCall: (data: any) => (purchasesApi as any).create(data),

        onSuccess: (tempId: string, docNo: string) => {
            setCreatedPOData({
                poNumber: docNo,
                poId: tempId,
                supplierName: selectedSupplier?.supplier_name || purchaseOrder.supplier_name,
                totalAmount: purchaseOrder.total_amount
            });
            setShowSuccessModal(true);
        },
    });

    return { saving, handleSavePurchaseOrder: handleSave };
}

export default usePurchaseOrderSave;
