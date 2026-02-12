/**
 * usePurchaseEntrySave Hook
 *
 * Thin wrapper around useDocumentSave for purchase entries (GRN).
 * Stock ADDITION (goods received from supplier).
 */

import { useDocumentSave } from '../../../global/hooks/useDocumentSave';
import { purchasesApi } from '../../../../services/api';
import { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';

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

    const buildPayload = () => ({
        supplier_invoice_number: purchase.supplier_invoice_number || generateInvoiceNumber(),
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
    });

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.GRN,
        idbStoreName: 'purchase_entries',
        entityType: 'purchase_entries',
        serverIdField: 'purchase_id',
        docNumberField: 'invoice_number',
        isOnline,

        validate: () => {
            if (!validatePurchase()) return 'Please fix validation errors';
            const itemsWithoutExpiry = purchase.items.filter((item: any) => !item.expiry_date);
            if (itemsWithoutExpiry.length > 0) {
                return `Please add expiry dates for all items. ${itemsWithoutExpiry.length} item(s) missing expiry date.`;
            }
            return null;
        },

        preparePayload: buildPayload,

        getDocNumber: async () => {
            const invoiceNumber = purchase.supplier_invoice_number || generateInvoiceNumber();
            if (invoiceNumber) return invoiceNumber;
            const { default: docNumGen } = await import('../../../../services/offline/documents/documentNumberGenerator');
            return docNumGen.generateNumber(DOC_TYPES.GRN, false);
        },

        apiCall: (data: any) => (purchasesApi as any).createEntry(data),

        stockOperation: async () => {
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
                console.log(`[PurchaseEntry] Added stock for ${stockAdditions.length} items locally`);
            }
        },

        onSuccess: (tempId: string, docNo: string) => {
            setCreatedPurchaseData({
                purchaseNumber: docNo,
                purchaseId: tempId,
                supplierName: selectedSupplier?.supplier_name || purchase.supplier_name,
                totalAmount: purchase.total_amount
            });
            setShowSuccessModal(true);
        },
    });

    return { saving, handleSavePurchase: handleSave };
}

export default usePurchaseEntrySave;
