/**
 * Organizations API Module
 * Handles all organization-related API calls including settings and features
 */

import apiClient from '../apiClient';

// For now, use hardcoded org_id until we implement proper auth
const DEFAULT_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

/**
 * Organization Profile APIs
 */
export const organizationsApi = {
  // Get organization profile
  getProfile: async (orgId = DEFAULT_ORG_ID) => {
    try {
      const response = await apiClient.get(`/organizations/${orgId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching organization profile:', error);
      throw error;
    }
  },

  // Update organization profile
  updateProfile: async (profileData, orgId = DEFAULT_ORG_ID) => {
    try {
      const response = await apiClient.put(`/organizations/${orgId}`, profileData);
      return response.data;
    } catch (error) {
      console.error('Error updating organization profile:', error);
      throw error;
    }
  },

  // Upload organization logo
  uploadLogo: async (file, orgId = DEFAULT_ORG_ID) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiClient.post(
        `/organizations/${orgId}/logo`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  }
};

/**
 * Feature Settings APIs
 */
export const featureSettingsApi = {
  // Get feature settings
  getFeatures: async (orgId = DEFAULT_ORG_ID) => {
    try {
      const response = await apiClient.get(`/organizations/${orgId}/features`);
      return response.data;
    } catch (error) {
      console.error('Error fetching feature settings:', error);
      throw error;
    }
  },

  // Update feature settings
  updateFeatures: async (features, orgId = DEFAULT_ORG_ID) => {
    try {
      const response = await apiClient.put(`/organizations/${orgId}/features`, features);
      return response.data;
    } catch (error) {
      console.error('Error updating feature settings:', error);
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
      console.error('Login error:', error);
      throw error;
    }
  },

  // Get current user info
  getCurrentUser: async () => {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  },

  // Get user's organizations
  getUserOrganizations: async () => {
    try {
      const response = await apiClient.get('/auth/organizations');
      return response.data;
    } catch (error) {
      console.error('Error fetching user organizations:', error);
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
      console.error('Error switching organization:', error);
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
  // In future, decode JWT token to get org_id
  // For now, return default
  return DEFAULT_ORG_ID;
};

export default {
  organizations: organizationsApi,
  features: featureSettingsApi,
  auth: authApi,
  getCurrentOrgId
};