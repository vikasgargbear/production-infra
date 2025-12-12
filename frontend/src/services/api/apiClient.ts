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
        }
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }

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
  get: (url: string, config?: any) => {
    // CRITICAL FIX: Ensure trailing slash for FastAPI routes
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.get(urlWithSlash, config);
  },
  post: (url: string, data?: any, config?: any) => {
    // CRITICAL FIX: Ensure trailing slash for FastAPI routes
    // FastAPI is strict about trailing slashes - /invoices != /invoices/
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    console.log('[API] POST to:', urlWithSlash);
    return apiClient.post(urlWithSlash, data, config);
  },
  put: (url: string, data?: any, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.put(urlWithSlash, data, config);
  },
  patch: (url: string, data?: any, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.patch(urlWithSlash, data, config);
  },
  delete: (url: string, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.delete(urlWithSlash, config);
  },
};

export default apiClient;
