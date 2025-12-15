import React, { createContext, useContext, useState, useEffect } from 'react';
import { companyAPI } from '../services/api';

const CompanyContext = createContext();

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

export const CompanyProvider = ({ children }) => {
  const [companyInfo, setCompanyInfo] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load company data on mount
  useEffect(() => {
    // Wait a bit to ensure org_id is set in localStorage/sessionStorage
    const timer = setTimeout(() => {
      loadCompanyData();
    }, 100);
    
    // Also reload when focus returns to window (in case settings changed)
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
      const cachedCompanyInfo = {
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
      
      // Try to fetch latest data from API (but only if org_id exists)
      const currentOrgId = sessionStorage.getItem('pharma_org_id') || localStorage.getItem('pharma_org_id');
      if (currentOrgId) {
        try {
          // Fetch complete profile with bank accounts
          const profileResponse = await companyAPI.getCompanyProfile();
        
          if (profileResponse.success && profileResponse.data) {
            const profileData = profileResponse.data;
            
            const apiCompanyInfo = {
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
            const orgResponse = await companyAPI.getOrganizationId();
            if (orgResponse.org_id) {
              setOrgId(orgResponse.org_id);
              localStorage.setItem('orgId', orgResponse.org_id);
            }
          } else {
            // Fallback to old API if new one fails
            const [companyResponse, orgResponse] = await Promise.all([
              companyAPI.getCompanyInfo(),
              companyAPI.getOrganizationId()
            ]);
            
            if (companyResponse) {
              const apiCompanyInfo = {
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
          // Continue with cached data - don't throw error
        }
      }
      
    } catch (error) {
      setError(error);
      // Set empty values if everything fails
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
        fssaiLicense: null
      });
    } finally {
      setLoading(false);
    }
  };

  const updateCompanyInfo = async (updates) => {
    try {
      setLoading(true);
      
      // Update local state immediately
      const updatedInfo = { ...companyInfo, ...updates };
      setCompanyInfo(updatedInfo);
      
      // Update localStorage
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'gst') {
          localStorage.setItem('companyGST', value);
        } else if (key === 'state') {
          localStorage.setItem('companyState', value);
        } else if (key === 'business_settings') {
          localStorage.setItem('companyBusinessSettings', JSON.stringify(value));
        } else {
          localStorage.setItem(`company${key.charAt(0).toUpperCase() + key.slice(1)}`, value);
        }
      });
      
      // Try to update via API
      try {
        const response = await companyAPI.updateCompanyInfo(updates);
        if (!response.success) {
          throw new Error(response.message || 'Failed to update company info');
        }
      } catch (apiError) {
        // Continue with local update - don't revert
      }
      
      return { success: true, data: updatedInfo };
    } catch (error) {
      setError(error);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  };

  const getOrgId = () => {
    return orgId || localStorage.getItem('orgId') || 'default-org-id';
  };

  const value = {
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