import { useState, useEffect } from 'react';
import { companyAPI } from '../services/api';

/**
 * Custom hook to manage company information across the application
 * Provides cached company info and methods to update it
 */
export const useCompanyInfo = () => {
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load company info from cache or API
  const loadCompanyInfo = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Check localStorage cache first (unless forcing refresh)
      if (!forceRefresh) {
        const cachedInfo = localStorage.getItem('companyInfo');
        if (cachedInfo) {
          const parsed = JSON.parse(cachedInfo);
          setCompanyInfo(parsed);
          
          // Still fetch from API in background to ensure freshness
          companyAPI.getCompanyInfo()
            .then(freshData => {
              if (JSON.stringify(freshData) !== cachedInfo) {
                setCompanyInfo(freshData);
                localStorage.setItem('companyInfo', JSON.stringify(freshData));
              }
            })
            .catch(err => console.warn('Failed to refresh company info:', err));
          
          setLoading(false);
          return parsed;
        }
      }

      // Fetch from API
      const response = await companyAPI.getCompanyInfo();
      setCompanyInfo(response);
      localStorage.setItem('companyInfo', JSON.stringify(response));
      return response;

    } catch (err) {
      setError(err.message || 'Failed to load company information');
      
      // Fallback to default values
      const defaultInfo = {
        name: 'Your Company',
        address: 'Company Address',
        phone: '+91 00000 00000',
        email: 'info@company.com',
        gst: '',
        pan: '',
        website: '',
        logo: null,
        city: '',
        state: '',
        pincode: '',
        country: 'India'
      };
      
      setCompanyInfo(defaultInfo);
      return defaultInfo;
      
    } finally {
      setLoading(false);
    }
  };

  // Update company info
  const updateCompanyInfo = async (updatedInfo) => {
    try {
      setError(null);
      const response = await companyAPI.updateCompanyInfo(updatedInfo);
      setCompanyInfo(response);
      localStorage.setItem('companyInfo', JSON.stringify(response));
      return response;
    } catch (err) {
      setError(err.message || 'Failed to update company information');
      throw err;
    }
  };

  // Clear cached company info
  const clearCache = () => {
    localStorage.removeItem('companyInfo');
    setCompanyInfo(null);
  };

  // Load on mount
  useEffect(() => {
    loadCompanyInfo();
  }, []);

  return {
    companyInfo,
    loading,
    error,
    refreshCompanyInfo: () => loadCompanyInfo(true),
    updateCompanyInfo,
    clearCache
  };
};

/**
 * Get company info synchronously from cache
 * Useful for immediate access without hooks
 */
export const getCompanyInfoSync = () => {
  const cached = localStorage.getItem('companyInfo');
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Return default values if not cached
  return {
    name: 'Your Company',
    address: 'Company Address',
    phone: '+91 00000 00000',
    email: 'info@company.com',
    gst: '',
    pan: '',
    website: '',
    logo: null,
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  };
};

export default useCompanyInfo;