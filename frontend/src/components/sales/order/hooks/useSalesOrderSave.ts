import { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import type { Order, CreatedOrderData } from '../../../../types/models';
import { ordersApi } from '../../../../services/api/modules/sales/orders.api';
import { buildCanonicalSalesOrderCommand } from '../../utils/canonicalSalesChainCommand';
import { clientUuid } from '../../../../utils/clientUuid';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { normalizeAuthoritativeDecimal } from '../../../../utils/exactDecimal';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

export interface UseSalesOrderSaveProps {
    order: Order;
    selectedCustomer: unknown;
    isOnline: boolean;
    documentPolicy: CanonicalDocumentPolicy | null;
    setOrder: React.Dispatch<React.SetStateAction<Order>>;
    setCreatedOrderData: React.Dispatch<React.SetStateAction<CreatedOrderData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    setMessage: (msg: string) => void;
    setMessageType: (type: string) => void;
}

export interface UseSalesOrderSaveReturn {
    saving: boolean;
    submissionUnavailableReason: string;
    preparedPreview: CanonicalCommandPreview | null;
    reviewOpen: boolean;
    handleSaveOrder: () => Promise<void>;
    confirmPreparedOrder: () => Promise<void>;
    closeOrderReview: () => void;
}

export function useSalesOrderSave(props: UseSalesOrderSaveProps): UseSalesOrderSaveReturn {
    const { order, selectedCustomer, isOnline, documentPolicy, setCreatedOrderData, setShowSuccessModal, setMessage, setMessageType } = props;
    const [saving, setSaving] = useState(false);
    const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const executedResourceId = useRef<string | null>(null);
    const idempotencyKey = useRef(`erp-web-sales-order:${clientUuid()}`);
    const lifecycleId = useRef(clientUuid());
    const preparedFingerprint = useRef<string | null>(null);
    const handleSaveOrder = useCallback(async () => {
        if (saving) return;
        try {
            if (!isOnline) throw new Error('Cloud API is unavailable. Nothing was saved or queued.');
            if (!selectedCustomer) throw new Error('Select a customer before preparing the order');
            setSaving(true);
            let payload = buildCanonicalSalesOrderCommand(order, idempotencyKey.current, documentPolicy);
            let fingerprint = JSON.stringify(payload);
            if (preparedFingerprint.current && preparedFingerprint.current !== fingerprint) {
                idempotencyKey.current = `erp-web-sales-order:${clientUuid()}`;
                lifecycleId.current = clientUuid();
                executedResourceId.current = null;
                setPreparedPreview(null);
                payload = buildCanonicalSalesOrderCommand(order, idempotencyKey.current, documentPolicy);
                fingerprint = JSON.stringify(payload);
            }
            if (!preparedPreview || preparedFingerprint.current !== fingerprint) {
                const prepared = await ordersApi.prepareCanonical(payload);
                preparedFingerprint.current = fingerprint;
                setPreparedPreview(prepared.data);
            }
            setReviewOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to prepare the sales order';
            setMessage(message); setMessageType('error'); toast.error(message);
        } finally { setSaving(false); }
    }, [documentPolicy, isOnline, order, preparedPreview, saving, selectedCustomer, setMessage, setMessageType]);

    const confirmPreparedOrder = useCallback(async () => {
        if (!preparedPreview || saving) return;
        setSaving(true);
        try {
            if (!executedResourceId.current) {
                const executed = await ordersApi.executePreparedCanonical(preparedPreview, lifecycleId.current);
                executedResourceId.current = String(executed.data.resource_id);
            }
            const resourceId = executedResourceId.current;
            const detail = (await ordersApi.getCanonical(resourceId)).data;
            if (!detail || String(detail.sales_order_id) !== resourceId) {
                throw new Error('Order posted, but authoritative readback could not be verified. Refresh history before retrying.');
            }
            if (typeof detail.order_number !== 'string' || !detail.order_number.trim()
                || typeof detail.customer_name !== 'string' || !detail.customer_name.trim()) {
                throw new Error('Order posted, but authoritative identity readback is incomplete.');
            }
            setCreatedOrderData({
                orderId: String(detail.sales_order_id),
                orderNumber: detail.order_number.trim(),
                customerName: detail.customer_name.trim(),
                totalAmount: normalizeAuthoritativeDecimal(detail.total_amount, 'Posted order total', {
                    scale: 2, maximumWholeDigits: 20,
                }),
            });
            setShowSuccessModal(true);
            setMessage('Sales order posted and verified from the canonical API.');
            setMessageType('success');
            executedResourceId.current = null;
            preparedFingerprint.current = null;
            idempotencyKey.current = `erp-web-sales-order:${clientUuid()}`;
            lifecycleId.current = clientUuid();
            setPreparedPreview(null); setReviewOpen(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to post or reconcile the sales order';
            setMessage(message);
            setMessageType('error');
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [preparedPreview, saving, setCreatedOrderData, setMessage, setMessageType, setShowSuccessModal]);

    return {
        saving,
        submissionUnavailableReason: '',
        preparedPreview,
        reviewOpen,
        handleSaveOrder,
        confirmPreparedOrder,
        closeOrderReview: () => setReviewOpen(false),
    };
}

export default useSalesOrderSave;
