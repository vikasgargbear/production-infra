/**
 * Utils API Module
 * File upload, import/export, search, validation utilities
 * 
 * ENDPOINTS: /utils
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/utils',
  UPLOAD: '/utils/upload',
  DOWNLOAD: (id) => `/utils/download/${id}`,
  IMPORT: '/utils/import',
  EXPORT: '/utils/export',
  SEARCH: '/utils/search',
  VALIDATE: '/utils/validate'
};

export const utilsApi = {
  // =========================================================================
  // FILE UPLOAD/DOWNLOAD
  // =========================================================================

  upload: (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return apiHelpers.post(ENDPOINTS.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  download: (fileId) => {
    return apiHelpers.get(ENDPOINTS.DOWNLOAD(fileId), { responseType: 'blob' });
  },

  // =========================================================================
  // IMPORT/EXPORT
  // =========================================================================

  import: {
    validate: (file, type) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      return apiHelpers.post(`${ENDPOINTS.IMPORT}/validate`, formData);
    },
    process: (fileId, options = {}) => {
      return apiHelpers.post(`${ENDPOINTS.IMPORT}/process`, { fileId, ...options });
    },
    getStatus: (importId) => {
      return apiHelpers.get(`${ENDPOINTS.IMPORT}/status/${importId}`);
    }
  },

  export: {
    generate: (type, filters = {}) => {
      return apiHelpers.post(`${ENDPOINTS.EXPORT}/generate`, { type, filters });
    },
    download: (exportId) => {
      return apiHelpers.get(`${ENDPOINTS.EXPORT}/download/${exportId}`, { responseType: 'blob' });
    }
  },

  // =========================================================================
  // SEARCH
  // =========================================================================

  search: {
    global: (query) => apiHelpers.get(ENDPOINTS.SEARCH, { params: { q: query } }),
    products: (query) => apiHelpers.get(`${ENDPOINTS.SEARCH}/products`, { params: { q: query } }),
    parties: (query) => apiHelpers.get(`${ENDPOINTS.SEARCH}/parties`, { params: { q: query } })
  },

  // =========================================================================
  // VALIDATION
  // =========================================================================

  validate: {
    gst: (gstin) => apiHelpers.post(`${ENDPOINTS.VALIDATE}/gst`, { gstin }),
    pan: (pan) => apiHelpers.post(`${ENDPOINTS.VALIDATE}/pan`, { pan }),
    email: (email) => apiHelpers.post(`${ENDPOINTS.VALIDATE}/email`, { email }),
    phone: (phone) => apiHelpers.post(`${ENDPOINTS.VALIDATE}/phone`, { phone })
  },

  // =========================================================================
  // MISCELLANEOUS
  // =========================================================================

  generateBarcode: (data) => apiHelpers.post(`${ENDPOINTS.BASE}/barcode`, data),
  getStates: () => apiHelpers.get(`${ENDPOINTS.BASE}/states`),
  getCurrencies: () => apiHelpers.get(`${ENDPOINTS.BASE}/currencies`),
  getTimezones: () => apiHelpers.get(`${ENDPOINTS.BASE}/timezones`)
};

// Removed apiUtils - aggregation logic should be in service layer, not API module

export default utilsApi;