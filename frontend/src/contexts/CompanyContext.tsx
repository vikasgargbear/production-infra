import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { companyApi } from '../services/api';

interface BankAccount {
    id?: number;
    account_number?: string;
    bank_name?: string;
    ifsc_code?: string;
    branch_name?: string;
}

interface BusinessSettings {
    [key: string]: any;
}

interface CompanyInfo {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gst: string;
    gst_number?: string;  // Alias for invoice preview
    drugLicense: string;
    drug_license_no?: string;  // Alias for invoice preview
    logo: string | null;
    bankAccounts: BankAccount[];
    paymentQR: string | null;
    business_settings?: BusinessSettings;
    fssai_no?: string | null;
    msme_no?: string | null;
}

interface CompanyContextValue {
    companyInfo: CompanyInfo | null;
    orgId: string | null;
    loading: boolean;
    error: Error | null;
    updateCompanyInfo: (updates: Partial<CompanyInfo>) => Promise<{ success: boolean; data?: CompanyInfo; error?: Error }>;
    refreshCompanyData: () => Promise<void>;
    getOrgId: () => string;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export const useCompany = (): CompanyContextValue => {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompany must be used within a CompanyProvider');
    }
    return context;
};

interface CompanyProviderProps {
    children: ReactNode;
}

export const CompanyProvider: React.FC<CompanyProviderProps> = ({ children }) => {
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Load company data on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            loadCompanyData();
        }, 100);

        const handleFocus = () => {
            loadCompanyData();
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const loadCompanyData = async () => {
        setLoading(true);
        setError(null);

        try {
            // PRIMARY: Load from localStorage immediately (synced during login)
            const cachedCompanyInfo: CompanyInfo = {
                name: localStorage.getItem('companyName') || '',
                address: localStorage.getItem('companyAddress') || '',
                city: localStorage.getItem('companyCity') || '',
                state: localStorage.getItem('companyState') || '',
                pincode: localStorage.getItem('companyPincode') || '',
                phone: localStorage.getItem('companyPhone') || '',
                email: localStorage.getItem('companyEmail') || '',
                gst: localStorage.getItem('companyGST') || '',
                gst_number: localStorage.getItem('companyGST') || '',
                drugLicense: localStorage.getItem('companyDrugLicense') || '',
                drug_license_no: localStorage.getItem('companyDrugLicense') || '',
                logo: localStorage.getItem('companyLogo') || null,
                bankAccounts: JSON.parse(localStorage.getItem('companyBankAccounts') || '[]'),
                paymentQR: localStorage.getItem('companyPaymentQR') || null,
                business_settings: JSON.parse(localStorage.getItem('companyBusinessSettings') || '{}'),
                fssai_no: localStorage.getItem('companyFssai') || null,
                msme_no: localStorage.getItem('companyMsme') || null,
            };

            const cachedOrgId = localStorage.getItem('orgId');

            // Set cached data immediately - this enables offline-first behavior
            if (cachedCompanyInfo.name) {
                setCompanyInfo(cachedCompanyInfo);
                setOrgId(cachedOrgId);
                setLoading(false); // Unblock UI immediately with cached data
            }

            // BACKGROUND: Try to refresh from API (don't block on this)
            try {
                const response = await companyApi.getCompanyInfo();
                const rawResponse = (response as any).data || response;

                // Handle both wrapped {success, data} and direct response formats
                const profileData = rawResponse.success && rawResponse.data
                    ? rawResponse.data
                    : rawResponse;

                // Check if we have valid profile data (must have name or company_name)
                if (profileData && (profileData.name || profileData.company_name)) {
                    const apiCompanyInfo: CompanyInfo = {
                        name: profileData.name || profileData.company_name || cachedCompanyInfo.name,
                        address: profileData.address || cachedCompanyInfo.address,
                        city: profileData.city || cachedCompanyInfo.city,
                        state: profileData.state || cachedCompanyInfo.state,
                        pincode: profileData.pincode || cachedCompanyInfo.pincode,
                        phone: profileData.phone || cachedCompanyInfo.phone,
                        email: profileData.email || cachedCompanyInfo.email,
                        gst: profileData.gst || profileData.gstin || cachedCompanyInfo.gst,
                        gst_number: profileData.gst || profileData.gstin || cachedCompanyInfo.gst,
                        drugLicense: profileData.drug_license_no || cachedCompanyInfo.drugLicense,
                        drug_license_no: profileData.drug_license_no || cachedCompanyInfo.drugLicense,
                        logo: profileData.logo || cachedCompanyInfo.logo,
                        bankAccounts: profileData.bank_accounts || [],
                        paymentQR: profileData.payment_qr_code || null,
                        business_settings: profileData.business_settings || {},
                        fssai_no: profileData.fssai_no || cachedCompanyInfo.fssai_no,
                        msme_no: profileData.msme_no || cachedCompanyInfo.msme_no,
                    };

                    setCompanyInfo(apiCompanyInfo);

                    // Update localStorage with fresh data
                    localStorage.setItem('companyName', apiCompanyInfo.name);
                    localStorage.setItem('companyAddress', apiCompanyInfo.address);
                    localStorage.setItem('companyCity', apiCompanyInfo.city);
                    localStorage.setItem('companyState', apiCompanyInfo.state);
                    localStorage.setItem('companyPincode', apiCompanyInfo.pincode);
                    localStorage.setItem('companyPhone', apiCompanyInfo.phone);
                    localStorage.setItem('companyEmail', apiCompanyInfo.email);
                    localStorage.setItem('companyGST', apiCompanyInfo.gst);
                    localStorage.setItem('companyDrugLicense', apiCompanyInfo.drugLicense);
                    localStorage.setItem('companyBankAccounts', JSON.stringify(apiCompanyInfo.bankAccounts));
                    if (apiCompanyInfo.logo) {
                        localStorage.setItem('companyLogo', apiCompanyInfo.logo);
                    }
                    if (apiCompanyInfo.paymentQR) {
                        localStorage.setItem('companyPaymentQR', apiCompanyInfo.paymentQR);
                    }
                    if (apiCompanyInfo.business_settings) {
                        localStorage.setItem('companyBusinessSettings', JSON.stringify(apiCompanyInfo.business_settings));
                    }
                    if (apiCompanyInfo.fssai_no) {
                        localStorage.setItem('companyFssai', apiCompanyInfo.fssai_no);
                    }
                    if (apiCompanyInfo.msme_no) {
                        localStorage.setItem('companyMsme', apiCompanyInfo.msme_no);
                    }
                    // Note: org_id is already in localStorage from login/sync, no need to fetch again
                }
            } catch (apiError) {
                console.error('Failed to fetch company profile:', apiError);
                // Continue with cached data
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setCompanyInfo({
                name: '',
                address: '',
                city: '',
                state: '',
                pincode: '',
                phone: '',
                email: '',
                gst: '',
                drugLicense: '',
                logo: null,
                bankAccounts: [],
                paymentQR: null,
                fssai_no: null,
                msme_no: null
            });
        } finally {
            setLoading(false);
        }
    };

    const updateCompanyInfo = async (updates: Partial<CompanyInfo>) => {
        try {
            setLoading(true);

            const updatedInfo: CompanyInfo = { ...companyInfo!, ...updates };
            setCompanyInfo(updatedInfo);

            // Update localStorage
            Object.entries(updates).forEach(([key, value]) => {
                if (key === 'gst') {
                    localStorage.setItem('companyGST', value as string);
                } else if (key === 'state') {
                    localStorage.setItem('companyState', value as string);
                } else if (key === 'business_settings') {
                    localStorage.setItem('companyBusinessSettings', JSON.stringify(value));
                } else {
                    localStorage.setItem(`company${key.charAt(0).toUpperCase() + key.slice(1)}`, String(value));
                }
            });

            // Try to update via API
            try {
                const response = await companyApi.updateCompanyInfo(updates);
                if (!response?.data?.success) {
                    throw new Error(response?.data?.message || 'Failed to update company info');
                }
            } catch (apiError) {
                // Continue with local update
            }

            return { success: true, data: updatedInfo };
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            return { success: false, error };
        } finally {
            setLoading(false);
        }
    };

    const getOrgId = (): string => {
        return orgId || localStorage.getItem('orgId') || 'default-org-id';
    };

    const value: CompanyContextValue = {
        companyInfo,
        orgId,
        loading,
        error,
        updateCompanyInfo,
        refreshCompanyData: loadCompanyData,
        getOrgId
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
};

export default CompanyProvider;
