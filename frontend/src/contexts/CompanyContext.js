import React, { createContext, useContext, useState, useEffect } from 'react';
import { companyAPI, DEFAULT_COMPANY_INFO } from '../services/api';

const CompanyContext = createContext();

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};

export const CompanyProvider = ({ children }) => {
  const [companyInfo, setCompanyInfo] = useState(DEFAULT_COMPANY_INFO);
  const [orgId, setOrgId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load company data on mount
  useEffect(() => {
    loadCompanyData();
  }, []);

  const loadCompanyData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load from localStorage first (for offline support)
      const cachedCompanyInfo = {
        name: localStorage.getItem('companyName') || DEFAULT_COMPANY_INFO.name,
        address: localStorage.getItem('companyAddress') || DEFAULT_COMPANY_INFO.address,
        phone: localStorage.getItem('companyPhone') || DEFAULT_COMPANY_INFO.phone,
        email: localStorage.getItem('companyEmail') || DEFAULT_COMPANY_INFO.email,
        gst: localStorage.getItem('companyGST') || DEFAULT_COMPANY_INFO.gst,
        state: localStorage.getItem('companyState') || 'Gujarat',
        logo: localStorage.getItem('companyLogo') || null
      };
      
      const cachedOrgId = localStorage.getItem('orgId');
      
      setCompanyInfo(cachedCompanyInfo);
      setOrgId(cachedOrgId);
      
      // Try to fetch latest data from API
      try {
        const [companyResponse, orgResponse] = await Promise.all([
          companyAPI.getCompanyInfo(),
          companyAPI.getOrganizationId()
        ]);
        
        if (companyResponse.success) {
          const apiCompanyInfo = {
            name: companyResponse.data.name || cachedCompanyInfo.name,
            address: companyResponse.data.address || cachedCompanyInfo.address,
            phone: companyResponse.data.phone || cachedCompanyInfo.phone,
            email: companyResponse.data.email || cachedCompanyInfo.email,
            gst: companyResponse.data.gst_number || cachedCompanyInfo.gst,
            state: companyResponse.data.state || cachedCompanyInfo.state,
            logo: companyResponse.data.logo || cachedCompanyInfo.logo
          };
          
          setCompanyInfo(apiCompanyInfo);
          
          // Update localStorage with fresh data
          localStorage.setItem('companyName', apiCompanyInfo.name);
          localStorage.setItem('companyAddress', apiCompanyInfo.address);
          localStorage.setItem('companyPhone', apiCompanyInfo.phone);
          localStorage.setItem('companyEmail', apiCompanyInfo.email);
          localStorage.setItem('companyGST', apiCompanyInfo.gst);
          localStorage.setItem('companyState', apiCompanyInfo.state);
          if (apiCompanyInfo.logo) {
            localStorage.setItem('companyLogo', apiCompanyInfo.logo);
          }
        }
        
        if (orgResponse.success && orgResponse.data.org_id) {
          setOrgId(orgResponse.data.org_id);
          localStorage.setItem('orgId', orgResponse.data.org_id);
        }
        
      } catch (apiError) {
        console.warn('Failed to fetch latest company data from API, using cached data:', apiError);
        // Continue with cached data - don't throw error
      }
      
    } catch (error) {
      console.error('Error loading company data:', error);
      setError(error);
      // Set default values if everything fails
      setCompanyInfo(DEFAULT_COMPANY_INFO);
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
        console.warn('Failed to update company info via API:', apiError);
        // Continue with local update - don't revert
      }
      
      return { success: true, data: updatedInfo };
    } catch (error) {
      console.error('Error updating company info:', error);
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