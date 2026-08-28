import { useCallback, useMemo } from 'react';
import { useCompany } from '../contexts/CompanyContext';

/** Print-facing projection of the canonical organization profile. */
export interface CompanyDetails {
    company_name: string;
    company_address: string;
    company_state: string;
    company_gst_number: string;
    company_drug_license: string;
    company_phone: string;
    company_alternate_phone: string;
    company_email: string;
    company_logo: string;
}

interface UseCompanyDetailsReturn {
    companyDetails: CompanyDetails | null;
    loading: boolean;
    error: Error | null;
    refreshCompanyDetails: () => Promise<void>;
}

/**
 * Exposes the already-loaded canonical company context to print previews.
 * It deliberately has no second cache, IndexedDB read, or fallback profile.
 */
const useCompanyDetails = (): UseCompanyDetailsReturn => {
    const { companyInfo, loading, error, refreshCompanyData } = useCompany();

    const companyDetails = useMemo<CompanyDetails | null>(() => {
        if (!companyInfo) return null;
        return {
            company_name: companyInfo.name,
            company_address: [
                companyInfo.address,
                companyInfo.city,
                companyInfo.state,
                companyInfo.pincode,
            ].filter(Boolean).join(', '),
            company_state: companyInfo.state,
            company_gst_number: companyInfo.gst_number,
            company_drug_license: companyInfo.drug_license_number,
            company_phone: companyInfo.phone,
            company_alternate_phone: '',
            company_email: companyInfo.email,
            company_logo: companyInfo.logo || '',
        };
    }, [companyInfo]);

    const refreshCompanyDetails = useCallback(async () => {
        await refreshCompanyData();
    }, [refreshCompanyData]);

    return { companyDetails, loading, error, refreshCompanyDetails };
};

export default useCompanyDetails;
