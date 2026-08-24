/** Fail-closed delivery-challan submission until a canonical command exists. */

import { useCallback } from 'react';
import { toast } from 'react-toastify';
import type { Challan, CreatedChallanData, CustomerDetails } from '../types/challanTypes';

export const CHALLAN_SUBMISSION_UNAVAILABLE =
    'Delivery Challan submission is temporarily unavailable while the canonical API command is being completed. Nothing was saved or queued.';

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
    handleSaveChallan: () => Promise<void>;
}

export function useChallanSave(_props: UseChallanSaveProps): UseChallanSaveReturn {
    const handleSaveChallan = useCallback(async () => {
        toast.error(CHALLAN_SUBMISSION_UNAVAILABLE);
    }, []);

    return {
        saving: false,
        submissionUnavailableReason: CHALLAN_SUBMISSION_UNAVAILABLE,
        handleSaveChallan,
    };
}

export default useChallanSave;
