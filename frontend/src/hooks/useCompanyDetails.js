import { useState, useEffect } from 'react';
import { settingsApi } from '../services/api/modules/settings.api';

const useCompanyDetails = () => {
  const [companyDetails, setCompanyDetails] = useState({
    company_name: 'AASO Pharmaceuticals',
    company_address: '',
    company_gstin: '',
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
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCompanyDetails = async () => {
      // First check localStorage cache
      const cached = localStorage.getItem('company_details_cache');
      const cacheTime = localStorage.getItem('company_details_cache_time');
      
      // Use cache if less than 1 hour old
      if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < 3600000) {
        try {
          setCompanyDetails(JSON.parse(cached));
          setLoading(false);
          return;
        } catch (e) {
          console.warn('Failed to parse cached company details:', e);
        }
      }

      try {
        // Try to fetch company info first (more structured)
        let response = await settingsApi.getCompanyInfo();
        let details = {};
        
        if (response?.data?.success && response.data.data) {
          const info = response.data.data;
          details = {
            company_name: info.org_name || info.legal_name || 'AASO Pharmaceuticals',
            company_address: info.registered_address || info.correspondence_address || '',
            company_gstin: info.gst_number || '',
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
          // Fallback to settings endpoint
          response = await settingsApi.getSettings();
          if (response?.data?.success && response.data.data) {
            const settings = response.data.data;
            
            // Map settings to company details
            details = {
              company_name: settings.company_name || 'AASO Pharmaceuticals',
              company_address: settings.company_address || settings.billing_address || '',
              company_gstin: settings.gstin || settings.gst_number || '',
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
          setCompanyDetails(details);
          
          // Cache the details
          localStorage.setItem('company_details_cache', JSON.stringify(details));
          localStorage.setItem('company_details_cache_time', Date.now().toString());
          
          // Also set individual items for backward compatibility
          Object.keys(details).forEach(key => {
            if (typeof details[key] === 'string') {
              localStorage.setItem(key, details[key]);
            }
          });
        }
      } catch (err) {
        console.error('Error fetching company details:', err);
        setError(err);
        
        // Fall back to localStorage individual items
        const fallbackDetails = {};
        Object.keys(companyDetails).forEach(key => {
          const value = localStorage.getItem(key);
          if (value) {
            fallbackDetails[key] = value;
          }
        });
        
        if (Object.keys(fallbackDetails).length > 0) {
          setCompanyDetails({ ...companyDetails, ...fallbackDetails });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyDetails();
  }, []);

  const refreshCompanyDetails = () => {
    // Clear cache
    localStorage.removeItem('company_details_cache');
    localStorage.removeItem('company_details_cache_time');
    
    // Force re-render to re-fetch
    window.location.reload();
  };

  return { companyDetails, loading, error, refreshCompanyDetails };
};

export default useCompanyDetails;