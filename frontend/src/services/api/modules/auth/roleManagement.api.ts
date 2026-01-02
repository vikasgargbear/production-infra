/**
 * Role Management API Module
 * Handles roles and permissions for RBAC
 * 
 * ENDPOINTS: /roles (backend: app/api/routes/auth/roles.py)
 */

import { apiHelpers } from '../../apiClient';
import { Role, ApiResponse, ApiListResponse } from '../../../../types/api.types';

const ENDPOINTS = {
    BASE: '/roles',
    DETAILS: (id: number | string) => `/roles/${id}`,
    PERMISSIONS: (id: number | string) => `/roles/${id}/permissions`,
    ASSIGN: '/roles/assign',
    USER_PERMISSIONS: (userId: number | string) => `/roles/user/${userId}/permissions`,
    VALIDATE: '/roles/validate-permission',
    DEFAULT: '/roles/setup-defaults'
};

export const roleManagementApi = {
    // =========================================================================
    // ROLE CRUD
    // =========================================================================

    // Get all roles
    getAll: () => {
        return apiHelpers.get<ApiListResponse<Role>>(ENDPOINTS.BASE);
    },

    // Get role by ID
    getById: (roleId: number | string) => {
        return apiHelpers.get<ApiResponse<Role>>(ENDPOINTS.DETAILS(roleId));
    },

    // Create custom role
    create: (data: Partial<Role>) => {
        return apiHelpers.post<ApiResponse<Role>>(ENDPOINTS.BASE, data);
    },

    // Update role
    update: (roleId: number | string, data: Partial<Role>) => {
        return apiHelpers.put<ApiResponse<Role>>(ENDPOINTS.DETAILS(roleId), data);
    },

    // Delete role
    delete: (roleId: number | string, reassignTo: number | string | null = null) => {
        return apiHelpers.delete<ApiResponse<void>>(ENDPOINTS.DETAILS(roleId), {
            params: reassignTo ? { reassign_to: reassignTo } : {}
        });
    },

    // =========================================================================
    // PERMISSIONS
    // =========================================================================

    // Get role permissions
    getPermissions: (roleId: number | string) => {
        return apiHelpers.get<ApiResponse<string[]>>(ENDPOINTS.PERMISSIONS(roleId));
    },

    // Update role permissions
    updatePermissions: (roleId: number | string, permissions: string[]) => {
        return apiHelpers.put<ApiResponse<Role>>(ENDPOINTS.PERMISSIONS(roleId), { permissions });
    },

    // Get user's effective permissions
    getUserPermissions: (userId: number | string) => {
        return apiHelpers.get<ApiResponse<string[]>>(ENDPOINTS.USER_PERMISSIONS(userId));
    },

    // Validate if user has specific permission
    validatePermission: (module: string, action: string) => {
        return apiHelpers.post<ApiResponse<{ has_permission: boolean }>>(ENDPOINTS.VALIDATE, { module, action });
    },

    // =========================================================================
    // ROLE ASSIGNMENT
    // =========================================================================

    // Assign role to users
    assignToUsers: (roleId: number | string, userIds: (number | string)[]) => {
        return apiHelpers.post<ApiResponse<void>>(ENDPOINTS.ASSIGN, { role_id: roleId, user_ids: userIds });
    },

    // =========================================================================
    // SETUP
    // =========================================================================

    // Setup default roles (Admin only)
    setupDefaults: () => {
        return apiHelpers.post<ApiResponse<{ message: string }>>(ENDPOINTS.DEFAULT);
    }
};
