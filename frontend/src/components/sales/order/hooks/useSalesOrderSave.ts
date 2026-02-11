/**
 * useSalesOrderSave Hook
 *
 * Handles sales order save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - NO stock deduction (orders are commitments, not dispatches)
 * - Background sync
 * - Error rollback
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { apiClient } from '../../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../utils/offlineSaveHelpers';
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
        setMessage,
        setMessageType
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSaveOrder = useCallback(async () => {
        try {
            setSaving(true);

            if (!order.customer_id) {
                throw new Error('Please select a customer');
            }
            if (!order.items || order.items.length === 0) {
                throw new Error('Please add at least one item');
            }

            // Prepare clean order data for backend
            const salesOrderData = {
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

                    const subtotal = quantity * unitPrice;
                    const discountAmount = (subtotal * discountPercent) / 100;
                    const taxableAmount = subtotal - discountAmount;
                    const taxAmount = (taxableAmount * taxPercent) / 100;

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
                        discount_amount: discountAmount,
                        tax_percent: taxPercent,
                        tax_amount: taxAmount,
                        gst_type: order.gst_type || 'CGST/SGST',
                        uom: item.uom || null,
                        pack_type: item.pack_type || null
                    };
                }),
                notes: order.notes || '',
                billing_address: order.billing_address || '',
                shipping_address: order.shipping_address || '',
                discount_amount: parseFloat(String(order.discount_amount)) || 0,
                other_charges: parseFloat(String(order.other_charges)) || 0
            };

            console.log('[SalesOrder] Prepared order data:', JSON.stringify(salesOrderData, null, 2));

            // Generate temp ID and offline document number
            const tempId = generateTempId();
            const localOrderNo = await documentNumberGenerator.generateNumber(DOC_TYPES.SALES_ORDER, false);

            // Save locally first (instant) - NO stock deduction for orders
            const localOrder = {
                ...salesOrderData,
                order_number: localOrderNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('sales_orders', localOrder);

            // Show success to user IMMEDIATELY (optimistic)
            const createdData: CreatedOrderData = {
                orderId: tempId,
                orderNumber: localOrderNo,
                customerName: selectedCustomer?.customer_name || order.customer_name,
                totalAmount: order.total_amount || 0
            };

            setOrder(prev => ({ ...prev, order_number: localOrderNo, order_id: tempId as any }));
            setCreatedOrderData(createdData);
            setShowSuccessModal(true);

            console.log('[SalesOrder] ✅ Local save complete, showing success to user');

            // BACKGROUND SYNC: Send to backend in background (non-blocking)
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[SalesOrder] 📡 Background sync to backend...');
                        const response = await apiClient.post('/sales-orders/', salesOrderData);
                        const responseData = response?.data;

                        if (responseData?.order_id) {
                            await offlineDB.updateLocalId('sales_orders', tempId, responseData.order_id);
                            console.log('[SalesOrder] ✅ Background sync complete - ID:', responseData.order_id);
                        }
                    } catch (syncError) {
                        console.warn('[SalesOrder] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('sales_orders', tempId, 'create', localOrder);
                    }
                })();
            } else {
                // Offline - add to sync queue
                await offlineDB.addToSyncQueue('sales_orders', tempId, 'create', localOrder);
            }

        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
            let errorMessage = 'Failed to create sales order';

            if (err.response?.data?.detail) {
                const details = err.response.data.detail;
                if (Array.isArray(details)) {
                    errorMessage = details.map((e: { loc?: string[]; msg: string }) =>
                        `${e.loc?.join('.') || 'Field'}: ${e.msg}`
                    ).join('\n');
                } else {
                    errorMessage = String(details);
                }
            } else if (err.message) {
                errorMessage = err.message;
            }

            setMessage(errorMessage);
            setMessageType('error');
            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, [order, selectedCustomer, isOnline, setOrder, setCreatedOrderData, setShowSuccessModal, setMessage, setMessageType]);

    return {
        saving,
        handleSaveOrder
    };
}

export default useSalesOrderSave;
