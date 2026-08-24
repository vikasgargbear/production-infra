/**
 * Users API Module
 * Handles user CRUD operations
 * 
 * ENDPOINTS: /users (backend: app/api/routes/auth/users.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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
    create: (_data: CreateUserRequest) => rejectCanonicalWrite('Creating a user'),

    // Update user
    update: (_id: number | string, _data: UpdateUserRequest) => rejectCanonicalWrite('Editing a user'),

    // Delete user
    delete: (_id: number | string) => rejectCanonicalWrite('Deleting a user'),

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
    updatePassword: (_id: number | string, _passwords: PasswordUpdate) =>
        rejectCanonicalWrite('Updating a user password'),

    // Reset password
    resetPassword: (_email: string) => rejectCanonicalWrite('Resetting a user password')
};

export default usersApi;
