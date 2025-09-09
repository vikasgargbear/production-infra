import apiClient from './apiClient';

/**
 * Company API Service
 * Handles company information, settings, and configuration
 */

export const companyAPI = {
  /**
   * Get company information
   */
  getCompanyInfo: async () => {
    try {
      const response = await apiClient.get('/company/info');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get complete company profile including bank accounts
   */
  getCompanyProfile: async () => {
    try {
      const response = await apiClient.get('/company/profile');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update company information
   */
  updateCompanyInfo: async (companyData) => {
    try {
      const response = await apiClient.put('/company/info', companyData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get organization ID
   */
  getOrganizationId: async () => {
    try {
      const response = await apiClient.get('/company/org-id');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get all bank accounts
   */
  getBankAccounts: async () => {
    try {
      const response = await apiClient.get('/company/bank-accounts');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Upload payment QR code
   */
  uploadQRCode: async (qrCodeBase64) => {
    try {
      const response = await apiClient.post('/company/qr-code', {
        qr_code: qrCodeBase64
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get company settings
   */
  getSettings: async () => {
    try {
      const response = await apiClient.get('/company/settings');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update company settings
   */
  updateSettings: async (settings) => {
    try {
      const response = await apiClient.put('/company/settings', settings);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

// Default company info as fallback
export const DEFAULT_COMPANY_INFO = {
  name: 'Your Company Name',
  address: 'Company Address',
  phone: '+91 00000 00000',
  email: 'info@company.com',
  gst: 'GST_NUMBER',
  logo: null
};

export default companyAPI;