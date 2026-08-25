import { useCallback, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import type { Challan, CreatedChallanData, CustomerDetails } from '../types/challanTypes';
import { challansApi } from '../../../../services/api/modules/sales/challans.api';
import { buildCanonicalSalesDispatchCommand } from '../../utils/canonicalSalesChainCommand';
import { clientUuid } from '../../../../utils/clientUuid';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';
import { normalizeAuthoritativeDecimal } from '../../../../utils/exactDecimal';

export interface UseChallanSaveProps {
    challan: Challan;
    selectedCustomer: CustomerDetails | null;
    companyInfo: unknown;
    isOnline: boolean;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    setCreatedChallanData: React.Dispatch<React.SetStateAction<CreatedChallanData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    generateChallanNumber: () => Promise<void>;
}

export interface UseChallanSaveReturn {
    saving: boolean;
    submissionUnavailableReason: string;
    preparedPreview: CanonicalCommandPreview | null;
    reviewOpen: boolean;
    handleSaveChallan: () => Promise<void>;
    confirmPreparedChallan: () => Promise<void>;
    closeChallanReview: () => void;
}

export function useChallanSave(props: UseChallanSaveProps): UseChallanSaveReturn {
    const { challan, selectedCustomer, isOnline, setCreatedChallanData, setShowSuccessModal } = props;
    const [saving, setSaving] = useState(false);
    const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const executedResourceId = useRef<string | null>(null);
    const idempotencyKey = useRef(`erp-web-sales-dispatch:${clientUuid()}`);
    const lifecycleId = useRef(clientUuid());
    const preparedFingerprint = useRef<string | null>(null);
    const handleSaveChallan = useCallback(async () => {
        if (saving) return;
        try {
            if (!isOnline) throw new Error('Cloud API is unavailable. Nothing was saved or queued.');
            if (!selectedCustomer) throw new Error('Select a customer before preparing the dispatch');
            setSaving(true);
            let payload = buildCanonicalSalesDispatchCommand(challan, idempotencyKey.current);
            let fingerprint = JSON.stringify(payload);
            if (preparedFingerprint.current && preparedFingerprint.current !== fingerprint) {
                idempotencyKey.current = `erp-web-sales-dispatch:${clientUuid()}`;
                lifecycleId.current = clientUuid(); executedResourceId.current = null;
                setPreparedPreview(null);
                payload = buildCanonicalSalesDispatchCommand(challan, idempotencyKey.current);
                fingerprint = JSON.stringify(payload);
            }
            if (!preparedPreview || preparedFingerprint.current !== fingerprint) {
                const prepared = await challansApi.prepareCanonical(payload);
                preparedFingerprint.current = fingerprint; setPreparedPreview(prepared.data);
            }
            setReviewOpen(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to prepare the delivery challan');
        } finally { setSaving(false); }
    }, [challan, isOnline, preparedPreview, saving, selectedCustomer]);

    const confirmPreparedChallan = useCallback(async () => {
        if (!preparedPreview || saving) return;
        if (!selectedCustomer) {
            toast.error('The selected customer changed after review. Return and prepare the dispatch again.');
            return;
        }
        setSaving(true);
        try {
            if (!executedResourceId.current) {
                const executed = await challansApi.executePreparedCanonical(preparedPreview, lifecycleId.current);
                executedResourceId.current = String(executed.data.resource_id);
            }
            const resourceId = executedResourceId.current;
            const detail = (await challansApi.getCanonical(resourceId)).data;
            if (!detail || String(detail.dispatch_id ?? detail.challan_id ?? detail.id) !== resourceId) {
                throw new Error('Dispatch posted, but authoritative readback could not be verified. Refresh history before retrying.');
            }
            setCreatedChallanData({
                challan_id: String(detail.dispatch_id ?? detail.challan_id ?? detail.id),
                challan_number: String(detail.challan_number),
                customer_name: String(detail.customer_name),
                customer_details: selectedCustomer,
                items: detail.items ?? challan.items,
                total_amount: normalizeAuthoritativeDecimal(detail.total_amount, 'Posted dispatch total', {
                    scale: 2, maximumWholeDigits: 20,
                }),
            });
            setShowSuccessModal(true);
            executedResourceId.current = null;
            preparedFingerprint.current = null;
            idempotencyKey.current = `erp-web-sales-dispatch:${clientUuid()}`;
            lifecycleId.current = clientUuid();
            setPreparedPreview(null); setReviewOpen(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to post the delivery challan');
        } finally {
            setSaving(false);
        }
    }, [challan, preparedPreview, saving, selectedCustomer, setCreatedChallanData, setShowSuccessModal]);

    return {
        saving,
        submissionUnavailableReason: '',
        preparedPreview,
        reviewOpen,
        handleSaveChallan,
        confirmPreparedChallan,
        closeChallanReview: () => setReviewOpen(false),
    };
}

export default useChallanSave;
