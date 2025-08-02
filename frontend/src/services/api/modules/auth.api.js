import { apiHelpers } from '../apiClient';
import { API_CONFIG, setAuthToken } from '../../../config/api.config';

const ENDPOINTS = API_CONFIG.ENDPOINTS.AUTH;

export const authApi = {
  // Login
  login: async (credentials) => {
    const response = await apiHelpers.post(ENDPOINTS.LOGIN, credentials);
    
    // Store token if login successful
    if (response.data.token) {
      setAuthToken(response.data.token);
      
      // Store user data if provided
      if (response.data.user) {
        localStorage.setItem(API_CONFIG.AUTH.USER_KEY, JSON.stringify(response.data.user));
      }
    }
    
    return response;
  },
  
  // Logout
  logout: async () => {
    try {
      await apiHelpers.post(ENDPOINTS.LOGOUT);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage
      localStorage.clear();
      // Redirect to login
      window.location.href = '/login';
    }
  },
  
  // Register
  register: (userData) => {
    return apiHelpers.post(ENDPOINTS.REGISTER, userData);
  },
  
  // Refresh token
  refreshToken: async () => {
    const refreshToken = localStorage.getItem(API_CONFIG.AUTH.REFRESH_TOKEN_KEY);
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const response = await apiHelpers.post(ENDPOINTS.REFRESH, {
      refresh_token: refreshToken
    });
    
    if (response.data.token) {
      setAuthToken(response.data.token);
    }
    
    return response;
  },
  
  // Verify token
  verify: () => {
    return apiHelpers.get(ENDPOINTS.VERIFY);
  },
  
  // Get current user
  getCurrentUser: () => {
    const userStr = localStorage.getItem(API_CONFIG.AUTH.USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  },
  
  // Update current user
  updateCurrentUser: (userData) => {
    localStorage.setItem(API_CONFIG.AUTH.USER_KEY, JSON.stringify(userData));
  },
  
  // Check if authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem(API_CONFIG.AUTH.TOKEN_KEY);
  },
  
  // Change password
  changePassword: (oldPassword, newPassword) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/change-password`, {
      old_password: oldPassword,
      new_password: newPassword
    });
  },
  
  // Request password reset
  requestPasswordReset: (email) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/reset-password`, { email });
  },
  
  // Confirm password reset
  confirmPasswordReset: (token, newPassword) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/reset-password/confirm`, {
      token,
      new_password: newPassword
    });
  },
};