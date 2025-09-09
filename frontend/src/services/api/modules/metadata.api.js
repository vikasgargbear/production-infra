// Use the JavaScript apiClient that has proper interceptors
import { apiClient } from '../apiClientExports';

/**
 * Metadata API Service
 * Fetches various options and configurations for dropdowns and forms
 */
export const metadataApi = {
  // Pack Types
  getPackTypes: () => apiClient.get('/metadata/pack-types'),
  
  // Payment Terms
  getPaymentTerms: () => apiClient.get('/metadata/payment-terms'),
  
  // Payment Modes
  getPaymentModes: () => apiClient.get('/metadata/payment-modes'),
  
  // Document Statuses
  getDocumentStatuses: () => apiClient.get('/metadata/document-statuses'),
  
  // Units of Measure
  getUnitsOfMeasure: () => apiClient.get('/metadata/units-of-measure'),
  
  // Return Reasons
  getReturnReasons: () => apiClient.get('/metadata/return-reasons'),
  
  // Tax Types
  getTaxTypes: () => apiClient.get('/metadata/tax-types'),
  
  // Transport Modes
  getTransportModes: () => apiClient.get('/metadata/transport-modes'),
  
  // Credit Configuration
  getCreditPlans: () => apiClient.get('/metadata/credit-plans'),
  getCreditRatings: () => apiClient.get('/metadata/credit-ratings'),
  getCreditDays: () => apiClient.get('/metadata/credit-days'),
  
  // Get all metadata in one call (for caching)
  getAll: () => apiClient.get('/metadata/all'),
  
  // Cache helper - stores metadata in localStorage
  cacheMetadata: async () => {
    try {
      const response = await apiClient.get('/metadata/all');
      if (response.data) {
        localStorage.setItem('metadata_cache', JSON.stringify({
          data: response.data,
          timestamp: Date.now()
        }));
        return response.data;
      }
    } catch (error) {
      return null;
    }
  },
  
  // Get cached metadata (with 1 hour expiry)
  getCachedMetadata: () => {
    try {
      const cached = localStorage.getItem('metadata_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        const oneHour = 60 * 60 * 1000;
        
        if (age < oneHour) {
          return parsed.data;
        } else {
          // Cache expired, fetch fresh
          metadataApi.cacheMetadata();
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }
};