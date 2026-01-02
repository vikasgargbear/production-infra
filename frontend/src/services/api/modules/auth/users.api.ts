/**
 * Users API Module
 * Handles user CRUD operations
 * 
 * ENDPOINTS: /users (backend: app/api/routes/auth/users.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import {
    User,
    CreateUserRequest,
    UpdateUserRequest,
    PasswordUpdate,
    ApiResponse,
    ApiListResponse
} from '../../../../types/api.types';

const ENDPOINTS = {
    BASE: '/users',
    DETAILS: (id: number | string) => `/users/${id}`,
    CURRENT: '/users/current',
    PASSWORD: (id: number | string) => `/users/${id}/password`,
    RESET_PASSWORD: '/users/reset-password'
};

export const usersApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all users
    getAll: (params: Record<string, any> = {}) => {
        return apiHelpers.get<ApiListResponse<User>>(ENDPOINTS.BASE, { params });
    },

    // Get user by ID
    getById: (id: number | string) => {
        return apiHelpers.get<ApiResponse<User>>(ENDPOINTS.DETAILS(id));
    },

    // Create new user
    create: (data: CreateUserRequest) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post<ApiResponse<User>>(ENDPOINTS.BASE, cleanedData);
    },

    // Update user
    update: (id: number | string, data: UpdateUserRequest) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put<ApiResponse<User>>(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete user
    delete: (id: number | string) => {
        return apiHelpers.delete<ApiResponse<void>>(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // CURRENT USER
    // =========================================================================

    // Get current user
    getCurrent: () => {
        return apiHelpers.get<ApiResponse<User>>(ENDPOINTS.CURRENT);
    },

    // =========================================================================
    // PASSWORD
    // =========================================================================

    // Update password
    updatePassword: (id: number | string, passwords: PasswordUpdate) => {
        return apiHelpers.post<ApiResponse<void>>(ENDPOINTS.PASSWORD(id), passwords);
    },

    // Reset password
    resetPassword: (email: string) => {
        return apiHelpers.post<ApiResponse<{ message: string }>>(ENDPOINTS.RESET_PASSWORD, { email });
    }
};

export default usersApi;
