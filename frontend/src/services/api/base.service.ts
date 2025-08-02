/**
 * Base API Service
 * Provides core HTTP functionality with TypeScript support
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import { API_CONFIG } from '../../config/api.config';
import { ApiResponse, ApiError, ErrorResponse } from '../../types/api/responses';

// Create axios instance with default config
const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers,
});

// Request interceptor for auth
axiosInstance.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem(API_CONFIG.AUTH.TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add organization context if available
    const user = localStorage.getItem(API_CONFIG.AUTH.USER_KEY);
    if (user) {
      try {
        const userData = JSON.parse(user);
        if (userData.org_id) {
          config.headers['X-Organization-Id'] = userData.org_id;
        }
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ErrorResponse>) => {
    if (error.response?.status === 401) {
      // Handle token refresh or logout
      localStorage.removeItem(API_CONFIG.AUTH.TOKEN_KEY);
      localStorage.removeItem(API_CONFIG.AUTH.USER_KEY);
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

/**
 * Base API Service Class
 * Extend this for specific API services
 */
export class BaseApiService {
  protected http: AxiosInstance;
  
  constructor(baseURL?: string) {
    this.http = baseURL ? axios.create({
      ...axiosInstance.defaults,
      baseURL,
    }) : axiosInstance;
  }
  
  /**
   * Handle API errors consistently
   */
  protected handleError(error: AxiosError<ErrorResponse>): ApiError[] {
    if (error.response?.data?.errors) {
      return error.response.data.errors;
    }
    
    if (error.response) {
      return [{
        code: `HTTP_${error.response.status}`,
        message: error.response.statusText || 'An error occurred',
      }];
    }
    
    if (error.request) {
      return [{
        code: 'NETWORK_ERROR',
        message: API_CONFIG.ERROR_MESSAGES.NETWORK_ERROR,
      }];
    }
    
    return [{
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred',
    }];
  }
  
  /**
   * Make a GET request
   */
  protected async get<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.get<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: this.handleError(error as AxiosError<ErrorResponse>),
      };
    }
  }
  
  /**
   * Make a POST request
   */
  protected async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.post<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: this.handleError(error as AxiosError<ErrorResponse>),
      };
    }
  }
  
  /**
   * Make a PUT request
   */
  protected async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.put<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: this.handleError(error as AxiosError<ErrorResponse>),
      };
    }
  }
  
  /**
   * Make a PATCH request
   */
  protected async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.patch<ApiResponse<T>>(url, data, config);
      return response.data;
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: this.handleError(error as AxiosError<ErrorResponse>),
      };
    }
  }
  
  /**
   * Make a DELETE request
   */
  protected async delete<T = null>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.http.delete<ApiResponse<T>>(url, config);
      return response.data;
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: this.handleError(error as AxiosError<ErrorResponse>),
      };
    }
  }
  
  /**
   * Build query string from params object
   */
  protected buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, String(item)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }
}

// Export configured axios instance for direct use if needed
export { axiosInstance };