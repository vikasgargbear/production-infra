/** Canonical API-only purchase-order prepare, approval, execution and readback. */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';

import { canonicalPurchaseOrdersApi } from '../../../../services/api/modules/purchase/canonicalPurchaseOrders.api';
import { clientUuid } from '../../../../utils/clientUuid';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import type {
    CreatedPOData,
    PurchaseOrderData,
} from './usePurchaseOrderLogic';
import {
    buildCanonicalPurchaseOrderPreparePayload,
    canonicalPurchaseOrderReview,
    canonicalPurchaseOrderValidationError,
    canonicalMoneyCents,
    canonicalMoneyString,
    type CanonicalPurchaseOrderReview,
    type PurchaseOrderSupplier,
} from '../utils/canonicalPurchaseOrderCommand';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import { canonicalActionErrorMessage } from '../../../../services/api/canonicalActionError';
import { requireCanonicalPostingDate } from '../../../../utils/canonicalPostingDate';

export const PURCHASE_ORDER_CANONICAL_OPERATION = 'procurement.purchase_order.prepare' as const;

export const getPurchaseOrderSubmissionBoundary = () => ({
    operationKey: PURCHASE_ORDER_CANONICAL_OPERATION,
    legacyEndpointAllowed: false,
    requiresActorConfirmation: true,
});

export interface UsePurchaseOrderSaveProps {
    purchaseOrder: PurchaseOrderData;
    selectedSupplier: PurchaseOrderSupplier | null;
    branchId: unknown;
    isOnline: boolean;
    documentPolicy: CanonicalDocumentPolicy | null;
    businessDate: string;
    setPurchaseOrder: React.Dispatch<React.SetStateAction<PurchaseOrderData>>;
    setCreatedPOData: React.Dispatch<React.SetStateAction<CreatedPOData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export interface UsePurchaseOrderSaveReturn {
    saving: boolean;
    preparingReview: boolean;
    canonicalReview: CanonicalPurchaseOrderReview | null;
    executedResourceId: string | null;
    prepareForReview: () => Promise<boolean>;
    handleSavePurchaseOrder: () => Promise<void>;
}

const submissionError = (error: unknown): string => canonicalActionErrorMessage(
    error,
    'Purchase-order verification failed. No request payload was displayed; retry the read-only reconciliation.',
);

export function usePurchaseOrderSave(
    props: UsePurchaseOrderSaveProps,
): UsePurchaseOrderSaveReturn {
    const {
        purchaseOrder,
        selectedSupplier,
        branchId,
        isOnline,
        documentPolicy,
        businessDate,
        setPurchaseOrder,
        setCreatedPOData,
        setShowSuccessModal,
        setErrors,
    } = props;
    const [saving, setSaving] = useState(false);
    const [preparingReview, setPreparingReview] = useState(false);
    const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
    const [canonicalReview, setCanonicalReview] = useState<CanonicalPurchaseOrderReview | null>(null);
    const [executedResourceId, setExecutedResourceId] = useState<string | null>(null);
    const prepareIdentityRef = useRef<{
        fingerprint: string;
        idempotencyKey: string;
        lifecycleId: string;
        executedResourceId?: string;
    } | null>(null);

    const currentFingerprint = useCallback(() => JSON.stringify({
        branchId,
        supplierId: selectedSupplier?.supplier_id,
        poDate: purchaseOrder.po_date,
        expectedOn: purchaseOrder.expected_delivery_date,
        discount: purchaseOrder.discount_amount,
        freight: purchaseOrder.freight_charges,
        lines: purchaseOrder.items.map(item => ({
            productId: item.product_id,
            uomConversionId: item.uom_conversion_id,
            billed: item.quantity,
            free: item.free_quantity,
            treatment: item.free_supply_tax_treatment,
            rate: item.unit_price,
            discount: item.discount_percent,
        })),
    }), [branchId, purchaseOrder, selectedSupplier]);

    const prepareForReview = useCallback(async (): Promise<boolean> => {
        const validationError = canonicalPurchaseOrderValidationError(
            purchaseOrder,
            selectedSupplier,
            branchId,
        );
        if (validationError) {
            setErrors({ submission: validationError });
            toast.error(validationError);
            return false;
        }
        try {
            requireCanonicalPostingDate(purchaseOrder.po_date, businessDate, 'Purchase-order date');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Purchase-order date is invalid.';
            setErrors({ submission: message });
            toast.error(message);
            return false;
        }
        if (!isOnline) {
            const message = 'Purchase-order review requires the live ERP API. Nothing was saved or queued.';
            setErrors({ submission: message });
            toast.error(message);
            return false;
        }

        setPreparingReview(true);
        setErrors({});
        try {
            const fingerprint = currentFingerprint();
            if (prepareIdentityRef.current?.fingerprint !== fingerprint) {
                prepareIdentityRef.current = {
                    fingerprint,
                    idempotencyKey: `erp-web-purchase-order:${clientUuid()}`,
                    lifecycleId: clientUuid(),
                };
                setExecutedResourceId(null);
            }
            const payload = buildCanonicalPurchaseOrderPreparePayload(
                purchaseOrder,
                selectedSupplier!,
                branchId,
                prepareIdentityRef.current.idempotencyKey,
                documentPolicy,
            );
            const prepared = await canonicalPurchaseOrdersApi.prepare(payload);
            const review = canonicalPurchaseOrderReview(
                prepared.data,
                branchId,
                selectedSupplier!.supplier_id,
            );
            setPreparedPreview(prepared.data);
            setCanonicalReview(review);
            return true;
        } catch (error) {
            const message = submissionError(error);
            setPreparedPreview(null);
            setCanonicalReview(null);
            setErrors({ submission: message });
            toast.error(message);
            return false;
        } finally {
            setPreparingReview(false);
        }
    }, [
        branchId,
        businessDate,
        currentFingerprint,
        documentPolicy,
        isOnline,
        purchaseOrder,
        selectedSupplier,
        setErrors,
    ]);

    const handleSavePurchaseOrder = useCallback(async (): Promise<void> => {
        if (!preparedPreview || !canonicalReview) {
            const message = 'Prepare the authoritative backend review before approving this purchase order.';
            setErrors({ submission: message });
            toast.error(message);
            return;
        }
        setSaving(true);
        setErrors({});
        try {
            const attempt = prepareIdentityRef.current;
            if (!attempt) {
                throw new Error('Purchase-order submission identity was lost. Prepare the review again.');
            }
            let purchaseOrderId = attempt.executedResourceId;
            if (!purchaseOrderId) {
                const { execution } = await canonicalPurchaseOrdersApi.executePrepared(
                    preparedPreview,
                    attempt.lifecycleId,
                );
                purchaseOrderId = execution.resource_id!;
                // Persist the terminal server identity before detail readback so
                // a transient GET failure can never trigger a second approval.
                attempt.executedResourceId = purchaseOrderId;
                setExecutedResourceId(purchaseOrderId);
            }
            const readback = await canonicalPurchaseOrdersApi.readback(purchaseOrderId);
            const readbackTaxCents = [
                readback.cgst_amount, readback.sgst_amount,
                readback.igst_amount, readback.cess_amount,
            ].reduce<bigint>((sum, value) => sum + canonicalMoneyCents(value, 'readback GST'), 0n);
            if (
                readback.branch_id !== canonicalReview.branchId
                || readback.supplier_id !== canonicalReview.supplierId
                || canonicalMoneyCents(readback.total_amount, 'readback total')
                    !== canonicalMoneyCents(canonicalReview.supplierCommitment, 'approved total')
                || readbackTaxCents !== canonicalMoneyCents(canonicalReview.gstTotal, 'approved GST')
            ) {
                throw new Error('Canonical purchase-order readback does not match the approved backend preview.');
            }
            setPurchaseOrder(previous => ({
                ...previous,
                po_no: readback.purchase_order_number,
                status: readback.status,
            }));
            setCreatedPOData({
                poId: readback.purchase_order_id,
                poNumber: readback.purchase_order_number,
                supplierName: readback.supplier_name,
                totalAmount: canonicalMoneyString(readback.total_amount, 'readback total'),
            });
            setShowSuccessModal(true);
        } catch (error) {
            const message = submissionError(error);
            setErrors({ submission: message });
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }, [
        canonicalReview,
        preparedPreview,
        setCreatedPOData,
        setErrors,
        setPurchaseOrder,
        setShowSuccessModal,
    ]);

    return {
        saving,
        preparingReview,
        canonicalReview,
        executedResourceId,
        prepareForReview,
        handleSavePurchaseOrder,
    };
}

export default usePurchaseOrderSave;
