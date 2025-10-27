/**
 * API Client with proper authentication
 * Uses AuthContext as single source of truth
 */

import axios from 'axios';
import { getApiBaseUrl } from '../../config/apiBase';

const apiClient = axios.create({
  baseURL: `${getApiBaseUrl()}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

/**
 * Request Interceptor
 * Adds token and org_id to all requests
 */
apiClient.interceptors.request.use(
  (config) => {
    // Get token from localStorage (set by AuthContext)
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Get org_id from user data (set by AuthContext)
    const userStr = localStorage.getItem('pharma_user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.org_id) {
          config.headers['X-Org-Id'] = user.org_id;
          console.log('[API Interceptor] Added X-Org-Id:', user.org_id);
        } else {
          console.warn('[API Interceptor] No org_id in user data:', user);
        }
      } catch (error) {
        console.error('[API Interceptor] Failed to parse user data:', error);
      }
    } else {
      console.warn('[API Interceptor] No pharma_user in localStorage');
    }

    console.log('[API Interceptor] Request headers:', {
      url: config.url,
      'X-Org-Id': config.headers['X-Org-Id'],
      'Authorization': config.headers.Authorization ? 'Bearer ***' : 'None'
    });

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response Interceptor
 * Handle 401 unauthorized
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('authToken');
      localStorage.removeItem('pharma_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Export apiHelpers for modules that use them
export const apiHelpers = {
  get: (url: string, config?: any) => apiClient.get(url, config),
  post: (url: string, data?: any, config?: any) => apiClient.post(url, data, config),
  put: (url: string, data?: any, config?: any) => apiClient.put(url, data, config),
  patch: (url: string, data?: any, config?: any) => apiClient.patch(url, data, config),
  delete: (url: string, config?: any) => apiClient.delete(url, config),
};

export default apiClient;
