/**
 * Organizations API Module
 * Handles all organization-related API calls including settings and features
 */

import apiClient from '../apiClient';
import authService from '../../auth/authService';

// Get org_id dynamically from auth service
const getOrgId = () => {
  const orgId = authService.getOrgId();
  if (!orgId) {
  }
  return orgId;
};

/**
 * Organization Profile APIs
 */
export const organizationsApi = {
  // Get organization profile
  getProfile: async (orgId = null) => {
    const organizationId = orgId || getOrgId();
    if (!organizationId) {
      throw new Error('No organization ID available');
    }
    try {
      const response = await apiClient.get(`/organizations/${organizationId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update organization profile
  updateProfile: async (profileData, orgId = null) => {
    const organizationId = orgId || getOrgId();
    if (!organizationId) {
      throw new Error('No organization ID available');
    }
    try {
      const response = await apiClient.put(`/organizations/${organizationId}`, profileData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Upload organization logo
  uploadLogo: async (file, orgId = null) => {
    const organizationId = orgId || getOrgId();
    if (!organizationId) {
      throw new Error('No organization ID available');
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post(
        `/organizations/${organizationId}/logo`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

/**
 * Feature Settings APIs
 */
export const featureSettingsApi = {
  // Get feature settings
  getFeatures: async (orgId = null) => {
    try {
      const effectiveOrgId = orgId || getOrgId();
      const response = await apiClient.get(`/organizations/${effectiveOrgId}/features`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update feature settings
  updateFeatures: async (features, orgId = null) => {
    try {
      const effectiveOrgId = orgId || getOrgId();
      const response = await apiClient.put(`/organizations/${effectiveOrgId}/features`, features);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

/**
 * Authentication APIs (for future use)
 */
export const authApi = {
  // Login
  login: async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', {
        username: email, // OAuth2 expects 'username'
        password
      });
      
      // Store token if login successful
      if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token);
        // Update apiClient with new token
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get current user info
  getCurrentUser: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Get user's organizations
  getUserOrganizations: async () => {
    try {
      const response = await apiClient.get('/auth/organizations');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Switch organization
  switchOrganization: async (orgId) => {
    try {
      const response = await apiClient.post('/auth/switch-organization', { org_id: orgId });
      
      // Update token with new org context
      if (response.data.access_token) {
        localStorage.setItem('token', response.data.access_token);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
      }
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Logout
  logout: () => {
    localStorage.removeItem('token');
    delete apiClient.defaults.headers.common['Authorization'];
  }
};

// Helper function to get current org_id from token or default
export const getCurrentOrgId = () => {
  return getOrgId();
};

export default {
  organizations: organizationsApi,
  features: featureSettingsApi,
  auth: authApi,
  getCurrentOrgId
};