import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { companyApi } from '../services/api';
import type { CompanyContextInfo as CompanyInfo } from '../types/common/company.types';
import { useAuth } from './AuthContext';
import { normalizeCompanyProfile, unwrapCompanyProfileResponse } from '../utils/companyProfile';

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
            const response = await companyApi.getCompanyInfo();
            const profileData = unwrapCompanyProfileResponse(response);
            const apiCompanyInfo = profileData ? normalizeCompanyProfile(profileData) : null;
            if (!apiCompanyInfo) {
                throw new Error('The canonical company profile response is invalid');
            }
            setCompanyInfo(apiCompanyInfo);
        } catch (err) {
            const failure = err instanceof Error ? err : new Error(String(err));
            setError(failure);
            setCompanyInfo(null);
        } finally {
            setLoading(false);
        }
    };

    const updateCompanyInfo = async (updates: Partial<CompanyInfo>) => {
        void updates;
        const updateError = new Error('Canonical company profile updates are not available');
        setError(updateError);
        return { success: false, error: updateError };
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
