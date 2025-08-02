import axios from 'axios';
import { API_CONFIG, getAuthToken } from '../../config/api.config';

// Create axios instance with base configuration
const baseURL = API_CONFIG.BASE_URL + API_CONFIG.API_VERSION;

// Debug: Log the base URL being used
console.log('[API Client] Base URL:', baseURL);
console.log('[API Client] ENV API_BASE_URL:', process.env.REACT_APP_API_BASE_URL);

const apiClient = axios.create({
  baseURL,
  timeout: API_CONFIG.TIMEOUT,
  headers: API_CONFIG.DEFAULT_HEADERS,
  withCredentials: false, // Don't send cookies for cross-origin requests
  maxRedirects: 0, // Prevent automatic redirects to handle them manually
});

// Request interceptor for authentication and logging
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Debug: Log the full URL being called
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and logging
apiClient.interceptors.response.use(
  (response) => {
    
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Handle network errors that might be caused by CORS redirect issues
    if (!error.response && (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED')) {
      console.log('[API] Network error:', error.code, error.message);
      
      // Check if we need to retry with different URL format
      if (!originalRequest._retry) {
        originalRequest._retry = true;
        
        // If URL doesn't end with / and has no query params, add trailing slash
        const hasQueryParams = originalRequest.url.includes('?');
        if (!originalRequest.url.endsWith('/') && !hasQueryParams) {
          console.log('[API] Retrying with trailing slash...');
          originalRequest.url = originalRequest.url + '/';
          return apiClient(originalRequest);
        }
      }
    }
    
    // Log error
    console.error('[API Error]', {
      url: error.config?.url,
      status: error.response?.status,
      data: error.response?.data,
    });
    
    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Try to refresh token
      try {
        // TODO: Implement token refresh logic
        // const newToken = await refreshToken();
        // setAuthToken(newToken);
        // return apiClient(originalRequest);
      } catch (refreshError) {
        // Redirect to login if refresh fails
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    // Handle network errors
    if (!error.response) {
      error.message = API_CONFIG.ERROR_MESSAGES.NETWORK_ERROR;
    }
    
    // Handle timeout
    if (error.code === 'ECONNABORTED') {
      error.message = API_CONFIG.ERROR_MESSAGES.TIMEOUT_ERROR;
    }
    
    // Handle server errors
    if (error.response?.status >= 500) {
      error.message = error.response?.data?.detail || API_CONFIG.ERROR_MESSAGES.SERVER_ERROR;
    }
    
    // Handle validation errors
    if (error.response?.status === 422 || error.response?.status === 400) {
      // Log detailed validation error
      console.error('[API Validation Error]', error.response?.data);
      error.message = error.response?.data?.detail || API_CONFIG.ERROR_MESSAGES.VALIDATION_ERROR;
    }
    
    return Promise.reject(error);
  }
);

// Helper functions for common operations
export const apiHelpers = {
  // GET request
  get: (url, config = {}) => apiClient.get(url, config),
  
  // POST request
  post: (url, data = {}, config = {}) => apiClient.post(url, data, config),
  
  // PUT request
  put: (url, data = {}, config = {}) => apiClient.put(url, data, config),
  
  // PATCH request
  patch: (url, data = {}, config = {}) => apiClient.patch(url, data, config),
  
  // DELETE request
  delete: (url, config = {}) => apiClient.delete(url, config),
  
  // Upload file
  upload: (url, formData, onProgress) => {
    return apiClient.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
  },
  
  // Download file
  download: (url, filename) => {
    return apiClient.get(url, {
      responseType: 'blob',
    }).then((response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });
  },
};

// Export the client instance
export { apiClient };
export default apiClient;

// Re-export APIs for backward compatibility
export * from './apiExports';