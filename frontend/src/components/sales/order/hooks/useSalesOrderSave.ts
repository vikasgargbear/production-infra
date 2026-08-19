/**
 * useSalesOrderSave Hook
 *
 * Thin wrapper around useDocumentSave for sales orders.
 * NO stock deduction (orders are commitments, not dispatches).
 */

import { useDocumentSave } from '../../../global/hooks/useDocumentSave';
import { apiClient } from '../../../../services/api';
import { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import type { Order, CreatedOrderData } from '../../../../types/models';

export interface UseSalesOrderSaveProps {
    order: Order;
    selectedCustomer: any;
    isOnline: boolean;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    setCreatedOrderData: React.Dispatch<React.SetStateAction<CreatedOrderData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    setMessage: (msg: string) => void;
    setMessageType: (type: string) => void;
}

export interface UseSalesOrderSaveReturn {
    saving: boolean;
    handleSaveOrder: () => Promise<void>;
}

export function useSalesOrderSave(props: UseSalesOrderSaveProps): UseSalesOrderSaveReturn {
    const {
        order,
        selectedCustomer,
        isOnline,
        setOrder,
        setCreatedOrderData,
        setShowSuccessModal,
    } = props;

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.SALES_ORDER,
        idbStoreName: 'sales_orders',
        entityType: 'sales_orders',
        serverIdField: 'order_id',
        docNumberField: 'order_number',
        isOnline,

        validate: () => {
            if (!order.customer_id) return 'Please select a customer';
            if (!order.items || order.items.length === 0) return 'Please add at least one item';
            return null;
        },

        preparePayload: () => ({
            customer_id: parseInt(String(order.customer_id)),
            order_date: order.order_date || new Date().toISOString().split('T')[0],
            delivery_date: order.expected_delivery_date || order.order_date,
            order_type: 'sales',
            payment_terms: 'credit',
            items: order.items.map(item => {
                const quantity = parseInt(String(item.quantity)) || 1;
                const freeQuantity = parseInt(String(item.free_quantity)) || 0;
                const unitPrice = parseFloat(String(item.unit_price)) || 0;
                const discountPercent = parseFloat(String(item.discount_percent)) || 0;
                const taxPercent = parseFloat(String(item.gst_percent)) || 0;

                return {
                    product_id: parseInt(String(item.product_id)),
                    product_code: item.product_code || null,
                    batch_id: item.batch_id ? parseInt(String(item.batch_id)) : null,
                    batch_number: item.batch_number || null,
                    quantity,
                    free_quantity: freeQuantity,
                    unit_price: unitPrice,
                    mrp: parseFloat(String(item.mrp)) || unitPrice,
                    discount_percent: discountPercent,
                    discount_amount: parseFloat(String(item.discount_amount)) || 0,
                    tax_percent: taxPercent,
                    tax_amount: parseFloat(String(item.tax_amount)) || 0,
                    gst_type: order.gst_type || 'CGST/SGST',
                    uom: item.uom || null,
                    pack_type: item.pack_type || null
                };
            }),
            notes: order.notes || '',
            billing_address: order.billing_address || '',
            shipping_address: order.shipping_address || '',
            discount_amount: parseFloat(String(order.discount_amount)) || 0,
            delivery_charges: parseFloat(String(order.delivery_charges)) || 0,
            other_charges: parseFloat(String(order.other_charges)) || 0
        }),

        apiCall: (data: any) => apiClient.post('/sales-orders/', data),

        onSuccess: (tempId: string, docNo: string) => {
            setOrder(prev => ({ ...prev, order_number: docNo, order_id: tempId as any }));
            setCreatedOrderData({
                orderId: tempId,
                orderNumber: docNo,
                customerName: selectedCustomer?.customer_name || order.customer_name,
                totalAmount: order.total_amount || 0
            });
            setShowSuccessModal(true);
        },
    });

    return { saving, handleSaveOrder: handleSave };
}

export default useSalesOrderSave;
