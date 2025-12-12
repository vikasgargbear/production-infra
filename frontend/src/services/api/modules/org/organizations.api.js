/**
 * Organizations API Module
 * Handles organization profile and features
 * 
 * ENDPOINTS: /organizations (backend: app/api/routes/org/*)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/organizations',
  FEATURES: '/features',
  LOGO: '/logo'
};

export const organizationsApi = {
  // =========================================================================
  // ORGANIZATION PROFILE
  // =========================================================================

  // Get organization profile
  getProfile: (orgId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${orgId}`);
  },

  // Update organization profile
  updateProfile: (orgId, profileData) => {
    return apiHelpers.put(`${ENDPOINTS.BASE}/${orgId}`, profileData);
  },

  // Upload organization logo
  uploadLogo: (orgId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHelpers.post(`${ENDPOINTS.BASE}/${orgId}${ENDPOINTS.LOGO}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  // =========================================================================
  // FEATURE SETTINGS
  // =========================================================================

  // Get feature settings for organization
  getFeatures: (orgId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${orgId}${ENDPOINTS.FEATURES}`);
  },

  // Update feature settings
  updateFeatures: (orgId, features) => {
    return apiHelpers.put(`${ENDPOINTS.BASE}/${orgId}${ENDPOINTS.FEATURES}`, features);
  }
};

export default organizationsApi;