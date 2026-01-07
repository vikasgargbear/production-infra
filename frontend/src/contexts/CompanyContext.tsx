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
    phone: string;
    email: string;
    gst: string;
    drugLicense: string;
    state: string;
    logo: string | null;
    bankAccounts: BankAccount[];
    paymentQR: string | null;
    business_settings?: BusinessSettings;
    fssaiLicense?: string | null;
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
            // Load from localStorage first (for offline support)
            const cachedCompanyInfo: CompanyInfo = {
                name: localStorage.getItem('companyName') || '',
                address: localStorage.getItem('companyAddress') || '',
                phone: localStorage.getItem('companyPhone') || '',
                email: localStorage.getItem('companyEmail') || '',
                gst: localStorage.getItem('companyGST') || '',
                drugLicense: localStorage.getItem('companyDrugLicense') || '',
                state: localStorage.getItem('companyState') || '',
                logo: localStorage.getItem('companyLogo') || null,
                bankAccounts: JSON.parse(localStorage.getItem('companyBankAccounts') || '[]'),
                paymentQR: localStorage.getItem('companyPaymentQR') || null,
                business_settings: JSON.parse(localStorage.getItem('companyBusinessSettings') || '{}')
            };

            const cachedOrgId = localStorage.getItem('orgId');

            setCompanyInfo(cachedCompanyInfo);
            setOrgId(cachedOrgId);

            // Try to fetch latest data from API
            const currentOrgId = sessionStorage.getItem('pharma_org_id') || localStorage.getItem('pharma_org_id');
            if (currentOrgId) {
                try {
                    const response = await companyApi.getCompanyProfile();
                    const profileResponse = (response as any).data || response;

                    if (profileResponse.success && profileResponse.data) {
                        const profileData = profileResponse.data;

                        const apiCompanyInfo: CompanyInfo = {
                            name: profileData.name || cachedCompanyInfo.name,
                            address: profileData.address || cachedCompanyInfo.address,
                            phone: profileData.phone || cachedCompanyInfo.phone,
                            email: profileData.email || cachedCompanyInfo.email,
                            gst: profileData.gst || cachedCompanyInfo.gst,
                            drugLicense: profileData.drug_license_no || cachedCompanyInfo.drugLicense,
                            state: profileData.state || cachedCompanyInfo.state,
                            logo: profileData.logo || cachedCompanyInfo.logo,
                            bankAccounts: profileData.bank_accounts || [],
                            paymentQR: profileData.payment_qr_code || null,
                            business_settings: profileData.business_settings || {}
                        };

                        setCompanyInfo(apiCompanyInfo);

                        // Update localStorage with fresh data
                        localStorage.setItem('companyName', apiCompanyInfo.name);
                        localStorage.setItem('companyAddress', apiCompanyInfo.address);
                        localStorage.setItem('companyPhone', apiCompanyInfo.phone);
                        localStorage.setItem('companyEmail', apiCompanyInfo.email);
                        localStorage.setItem('companyGST', apiCompanyInfo.gst);
                        localStorage.setItem('companyDrugLicense', apiCompanyInfo.drugLicense);
                        localStorage.setItem('companyState', apiCompanyInfo.state);
                        localStorage.setItem('companyBankAccounts', JSON.stringify(apiCompanyInfo.bankAccounts));
                        if (apiCompanyInfo.logo) {
                            localStorage.setItem('companyLogo', apiCompanyInfo.logo);
                        }
                        if (apiCompanyInfo.paymentQR) {
                            localStorage.setItem('companyPaymentQR', apiCompanyInfo.paymentQR);
                        }

                        // Also get org ID
                        const orgRes = await companyApi.getOrganizationId();
                        const orgResponse = (orgRes as any).data || orgRes;
                        if (orgResponse.org_id) {
                            setOrgId(orgResponse.org_id);
                            localStorage.setItem('orgId', orgResponse.org_id);
                        }
                    } else {
                        // Fallback to old API
                        const [companyRes, orgRes] = await Promise.all([
                            companyApi.getCompanyInfo(),
                            companyApi.getOrganizationId()
                        ]);
                        const companyResponse = (companyRes as any).data || companyRes;
                        const orgResponse = (orgRes as any).data || orgRes;

                        if (companyResponse) {
                            const apiCompanyInfo: CompanyInfo = {
                                name: companyResponse.name || cachedCompanyInfo.name,
                                address: companyResponse.address || cachedCompanyInfo.address,
                                phone: companyResponse.phone || cachedCompanyInfo.phone,
                                email: companyResponse.email || cachedCompanyInfo.email,
                                gst: companyResponse.gst || cachedCompanyInfo.gst,
                                drugLicense: companyResponse.drug_license_no || cachedCompanyInfo.drugLicense,
                                state: companyResponse.state || cachedCompanyInfo.state,
                                logo: companyResponse.logo || cachedCompanyInfo.logo,
                                bankAccounts: cachedCompanyInfo.bankAccounts,
                                paymentQR: cachedCompanyInfo.paymentQR
                            };

                            setCompanyInfo(apiCompanyInfo);
                        }

                        if (orgResponse && orgResponse.org_id) {
                            setOrgId(orgResponse.org_id);
                            localStorage.setItem('orgId', orgResponse.org_id);
                        }
                    }
                } catch (apiError) {
                    // Continue with cached data
                }
            }

        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
            setCompanyInfo({
                name: '',
                address: '',
                phone: '',
                email: '',
                gst: '',
                drugLicense: '',
                state: '',
                logo: null,
                bankAccounts: [],
                paymentQR: null,
                fssaiLicense: null
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
                if (!response.success) {
                    throw new Error(response.message || 'Failed to update company info');
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
