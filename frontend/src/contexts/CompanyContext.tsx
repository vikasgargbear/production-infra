import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { companyApi } from '../services/api';
import type { CompanyContextInfo as CompanyInfo } from '../types/common/company.types';
import { useAuth } from './AuthContext';

interface CompanyContextValue {
    companyInfo: CompanyInfo | null;
    orgId: string | null;
    loading: boolean;
    error: Error | null;
    updateCompanyInfo: (updates: Partial<CompanyInfo>) => Promise<{ success: boolean; data?: CompanyInfo; error?: Error }>;
    refreshCompanyData: () => Promise<void>;
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
    const { user } = useAuth();
    const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
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
                gst_number: localStorage.getItem('companyGST') || '',
                pan_number: localStorage.getItem('companyPan') || '',
                drug_license_number: localStorage.getItem('companyDrugLicense') || '',
                fssai_number: localStorage.getItem('companyFssai') || '',
                msme_number: localStorage.getItem('companyMsme') || '',
                logo: localStorage.getItem('companyLogo') || null,
                bankAccounts: JSON.parse(localStorage.getItem('companyBankAccounts') || '[]'),
                paymentQR: localStorage.getItem('companyPaymentQR') || null,
                business_settings: JSON.parse(localStorage.getItem('companyBusinessSettings') || '{}'),
            };

            // Set cached data immediately - this enables offline-first behavior
            if (cachedCompanyInfo.name) {
                setCompanyInfo(cachedCompanyInfo);
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
                        gst_number: profileData.gst_number || cachedCompanyInfo.gst_number,
                        pan_number: profileData.pan_number || cachedCompanyInfo.pan_number,
                        drug_license_number: profileData.drug_license_number || cachedCompanyInfo.drug_license_number,
                        fssai_number: profileData.fssai_number || cachedCompanyInfo.fssai_number,
                        msme_number: profileData.msme_number || cachedCompanyInfo.msme_number,
                        logo: profileData.logo || cachedCompanyInfo.logo,
                        bankAccounts: profileData.bank_accounts || [],
                        paymentQR: profileData.payment_qr_code || null,
                        business_settings: profileData.business_settings || {},
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
                    localStorage.setItem('companyGST', apiCompanyInfo.gst_number);
                    localStorage.setItem('companyPan', apiCompanyInfo.pan_number);
                    localStorage.setItem('companyDrugLicense', apiCompanyInfo.drug_license_number);
                    localStorage.setItem('companyFssai', apiCompanyInfo.fssai_number);
                    localStorage.setItem('companyMsme', apiCompanyInfo.msme_number);
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
                gst_number: '',
                pan_number: '',
                drug_license_number: '',
                fssai_number: '',
                msme_number: '',
                logo: null,
                bankAccounts: [],
                paymentQR: null,
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

    const value: CompanyContextValue = {
        companyInfo,
        orgId: user?.org_id || null,
        loading,
        error,
        updateCompanyInfo,
        refreshCompanyData: loadCompanyData,
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
};

export default CompanyProvider;
