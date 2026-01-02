/**
 * API Client with proper authentication
 * Uses AuthContext as single source of truth
 */

import axios from 'axios';
import { getApiBaseUrl } from '../../config/apiBase';
import { API_CONFIG } from '../../config/api.config';
import { storageService, STORAGE_KEYS } from '../core/storageService';

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
    // Get token from storage
    const token = storageService.getItem<string>(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Get org_id from user data
    const user = storageService.getItem<{ org_id?: string }>(STORAGE_KEYS.USER);
    if (user?.org_id) {
      config.headers['X-Org-Id'] = user.org_id;
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
      // Token expired or invalid - redirect to login
      storageService.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      storageService.removeItem(STORAGE_KEYS.USER);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const apiHelpers = {
  get: <T = any>(url: string, config?: any) => {
    // Note: Don't add trailing slash for GET with params - causes redirect issues
    // FastAPI redirect_slashes + params creates /path/?x=1 -> /path?x=1 which breaks CORS
    // Only add trailing slash if no params
    let finalUrl = url;
    if (!config?.params && !url.endsWith('/')) {
      finalUrl = `${url}/`;
    }
    return apiClient.get<T>(finalUrl, config);
  },
  post: <T = any>(url: string, data?: any, config?: any) => {
    // CRITICAL FIX: Ensure trailing slash for FastAPI routes
    // FastAPI is strict about trailing slashes - /invoices != /invoices/
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    console.log('[API] POST to:', urlWithSlash);
    return apiClient.post<T>(urlWithSlash, data, config);
  },
  put: <T = any>(url: string, data?: any, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.put<T>(urlWithSlash, data, config);
  },
  patch: <T = any>(url: string, data?: any, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.patch<T>(urlWithSlash, data, config);
  },
  delete: <T = any>(url: string, config?: any) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.delete<T>(urlWithSlash, config);
  },
  download: (url: string, filename: string) => {
    const urlWithSlash = url.endsWith('/') ? url : `${url}/`;
    return apiClient.get(urlWithSlash, { responseType: 'blob' }).then((response) => {
      const href = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(href);
      return response;
    });
  },
};

export default apiClient;
