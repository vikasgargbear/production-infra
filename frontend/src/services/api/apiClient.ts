/**
 * API Client with proper authentication
 * Uses AuthContext as single source of truth
 */

import axios from 'axios';
import { getApiBaseUrl } from '../../config/apiBase';
import {
  clearErpSessionStorage,
  getErpAccessToken,
} from '../auth/erpSessionStorage';
import { normalizeMoneyResponse } from './utils/dataUtils';

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
 * Adds the ERP access token. Tenant identity is derived by the backend from it.
 */
apiClient.interceptors.request.use(
  (config) => {
    const token = getErpAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
  (response) => {
    // Canonical command/read clients validate exact decimal strings before
    // they enter UI state.  Those callers opt out of the legacy numeric-model
    // adapter so a wire value such as "150.00" is not silently converted to a
    // JavaScript number and then rejected (or rounded) downstream.
    const preserveExactDecimals = Boolean(
      (response.config as typeof response.config & { preserveExactDecimals?: boolean })
        .preserveExactDecimals
    );
    if (!preserveExactDecimals) {
      response.data = normalizeMoneyResponse(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 ||
        (error.response?.status === 403 &&
         typeof error.response?.data?.detail === 'string' &&
         error.response.data.detail.toLowerCase().includes('deactivated'))) {
      // Token expired, invalid, or account deactivated - redirect to login
      clearErpSessionStorage();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const apiHelpers = {
  get: <T = any>(url: string, config?: any) => {
    // Send URL exactly as passed - no trailing slash manipulation
    return apiClient.get<T>(url, config);
  },
  post: <T = any>(url: string, data?: any, config?: any) => {
    return apiClient.post<T>(url, data, config);
  },
  put: <T = any>(url: string, data?: any, config?: any) => {
    return apiClient.put<T>(url, data, config);
  },
  patch: <T = any>(url: string, data?: any, config?: any) => {
    return apiClient.patch<T>(url, data, config);
  },
  delete: <T = any>(url: string, config?: any) => {
    return apiClient.delete<T>(url, config);
  },
  download: (url: string, filename: string) => {
    return apiClient.get(url, { responseType: 'blob' }).then((response) => {
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
