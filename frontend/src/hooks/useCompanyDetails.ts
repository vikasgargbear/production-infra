import { useState, useEffect } from 'react';
import { settingsApi } from '../services/api';
import { storageService, STORAGE_KEYS } from '../services/core/storageService';

interface BankDetails {
    [key: string]: string | number | boolean | undefined;
}

interface CompanyDetails {
    company_name: string;
    company_address: string;
    company_gst_number: string;
    company_drug_license: string;
    company_phone: string;
    company_email: string;
    company_website: string;
    company_pan: string;
    company_cin: string;
    company_fssai: string;
    billing_address: string;
    shipping_address: string;
    bank_details: BankDetails;
}

interface UseCompanyDetailsReturn {
    companyDetails: CompanyDetails;
    loading: boolean;
    error: Error | null;
    refreshCompanyDetails: () => void;
}

const defaultCompanyDetails: CompanyDetails = {
    company_name: 'AASO Pharmaceuticals',
    company_address: '',
    company_gst_number: '',
    company_drug_license: '',
    company_phone: '',
    company_email: '',
    company_website: '',
    company_pan: '',
    company_cin: '',
    company_fssai: '',
    billing_address: '',
    shipping_address: '',
    bank_details: {}
};

const useCompanyDetails = (): UseCompanyDetailsReturn => {
    const [companyDetails, setCompanyDetails] = useState<CompanyDetails>(defaultCompanyDetails);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchCompanyDetails = async () => {
            const cached = storageService.getItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE);
            const cacheTime = storageService.getItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE_TIME);

            if (cached && cacheTime && (Date.now() - parseInt(cacheTime as string)) < 3600000) {
                try {
                    setCompanyDetails(cached as CompanyDetails);
                    setLoading(false);
                    return;
                } catch {
                    // Continue to fetch
                }
            }

            try {
                let response = await settingsApi.getCompanyInfo();
                let details: Partial<CompanyDetails> = {};

                if (response?.data?.success && response.data.data) {
                    const info = response.data.data;
                    details = {
                        company_name: info.org_name || info.legal_name || 'AASO Pharmaceuticals',
                        company_address: info.registered_address || info.correspondence_address || '',
                        company_gst_number: info.gst_number || '',
                        company_drug_license: info.drug_license_number || '',
                        company_phone: info.contact_numbers?.[0] || '',
                        company_email: info.email_addresses?.[0] || '',
                        company_website: info.website || '',
                        company_pan: info.pan_number || '',
                        company_cin: info.cin_number || '',
                        company_fssai: info.fssai_number || '',
                        billing_address: info.registered_address || '',
                        shipping_address: info.correspondence_address || info.registered_address || '',
                        bank_details: info.bank_details || {}
                    };
                } else {
                    response = await settingsApi.getSettings();
                    if (response?.data?.success && response.data.data) {
                        const settings = response.data.data;
                        details = {
                            company_name: settings.company_name || 'AASO Pharmaceuticals',
                            company_address: settings.company_address || settings.billing_address || '',
                            company_gst_number: settings.gst_number || settings.gst_number || '',
                            company_drug_license: settings.drug_license || settings.drug_license_number || '',
                            company_phone: settings.phone || settings.contact_phone || '',
                            company_email: settings.email || settings.contact_email || '',
                            company_website: settings.website || '',
                            company_pan: settings.pan_number || '',
                            company_cin: settings.cin_number || '',
                            company_fssai: settings.fssai_number || '',
                            billing_address: settings.billing_address || settings.company_address || '',
                            shipping_address: settings.shipping_address || settings.company_address || '',
                            bank_details: settings.bank_details || {}
                        };
                    }
                }

                if (Object.keys(details).length > 0) {
                    const fullDetails = { ...defaultCompanyDetails, ...details };
                    setCompanyDetails(fullDetails);
                    storageService.setItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE, fullDetails);
                    storageService.setItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE_TIME, Date.now().toString());
                }
            } catch (err) {
                setError(err as Error);
            } finally {
                setLoading(false);
            }
        };

        fetchCompanyDetails();
    }, []);

    const refreshCompanyDetails = (): void => {
        storageService.removeItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE);
        storageService.removeItem(STORAGE_KEYS.COMPANY_DETAILS_CACHE_TIME);
        window.location.reload();
    };

    return { companyDetails, loading, error, refreshCompanyDetails };
};

export default useCompanyDetails;
