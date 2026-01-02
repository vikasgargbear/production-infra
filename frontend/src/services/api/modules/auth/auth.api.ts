import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import { storageService, STORAGE_KEYS } from '../../../../services/core/storageService';
import {
    LoginCredentials,
    LoginResponse,
    User,
    ApiResponse,
    PasswordUpdate
} from '../../../../types/api.types';

const ENDPOINTS = API_CONFIG.ENDPOINTS.AUTH;

export const authApi = {
    // Login
    login: async (credentials: LoginCredentials) => {
        const response = await apiHelpers.post<LoginResponse>(ENDPOINTS.LOGIN, credentials);

        // Store token if login successful
        // Support both 'token' and 'access_token' based on discrepancies found in legacy code
        const token = response.data.token || response.data.access_token;

        if (token) {
            storageService.setItem(STORAGE_KEYS.AUTH_TOKEN, token);

            // Store user data if provided
            if (response.data.user) {
                storageService.setItem(STORAGE_KEYS.USER, response.data.user);
            }
        }

        return response;
    },

    // Logout
    logout: async () => {
        try {
            await apiHelpers.post<void>(ENDPOINTS.LOGOUT);
        } catch (error) {
            // Ignore error on logout
        } finally {
            // Clear local storage
            storageService.clear();
            // Redirect to login
            window.location.href = '/login';
        }
    },

    // Register
    register: (userData: any) => {
        // Return typing loose here as RegisterResponse isn't defined
        return apiHelpers.post<ApiResponse<User>>(ENDPOINTS.REGISTER, userData);
    },

    // Refresh token
    refreshToken: async () => {
        const refreshToken = storageService.getItem<string>(STORAGE_KEYS.REFRESH_TOKEN);

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await apiHelpers.post<LoginResponse>(ENDPOINTS.REFRESH, {
            refresh_token: refreshToken
        });

        const token = response.data.token || response.data.access_token;
        if (token) {
            storageService.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
        }

        return response;
    },

    // Verify token
    verify: () => {
        return apiHelpers.get<ApiResponse<User>>(ENDPOINTS.VERIFY);
    },

    // Get current user
    getCurrentUser: () => {
        return storageService.getItem<User>(STORAGE_KEYS.USER);
    },

    // Update current user
    updateCurrentUser: (userData: User) => {
        storageService.setItem(STORAGE_KEYS.USER, userData);
    },

    // Check if authenticated
    isAuthenticated: () => {
        return !!storageService.getItem<string>(STORAGE_KEYS.AUTH_TOKEN);
    },

    // Change password
    changePassword: (oldPassword: string, newPassword: string) => {
        return apiHelpers.post<ApiResponse<void>>(`${ENDPOINTS.BASE}/change-password`, {
            old_password: oldPassword,
            new_password: newPassword
        });
    },

    // Request password reset
    requestPasswordReset: (email: string) => {
        return apiHelpers.post<ApiResponse<{ message: string }>>(`${ENDPOINTS.BASE}/reset-password`, { email });
    },

    // Confirm password reset
    confirmPasswordReset: (token: string, newPassword: string) => {
        return apiHelpers.post<ApiResponse<{ message: string }>>(`${ENDPOINTS.BASE}/reset-password/confirm`, {
            token,
            new_password: newPassword
        });
    },

    // =========================================================================
    // OAuth / Google Login
    // =========================================================================

    // Get Google OAuth URL (redirects user to Google)
    getGoogleOAuthUrl: async () => {
        const response = await apiHelpers.get<{ url: string }>(ENDPOINTS.OAUTH_GOOGLE_URL);
        return response.data;
    },

    // Handle Google OAuth callback
    googleCallback: async (userData: any) => {
        const response = await apiHelpers.post<LoginResponse>(ENDPOINTS.OAUTH_GOOGLE_CALLBACK, userData);

        const token = response.data.access_token || response.data.token;
        if (token) {
            storageService.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
            if (response.data.user) {
                storageService.setItem(STORAGE_KEYS.USER, response.data.user);
            }
        }

        return response;
    },

    // Get available OAuth providers
    getOAuthProviders: async () => {
        const response = await apiHelpers.get<any>(ENDPOINTS.OAUTH_PROVIDERS);
        return response.data;
    },

    // Check OAuth configuration status
    getOAuthStatus: async () => {
        const response = await apiHelpers.get<any>(ENDPOINTS.OAUTH_STATUS);
        return response.data;
    },
};
