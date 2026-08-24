/**
 * Role Management API Module
 * Handles roles and permissions for RBAC
 * 
 * ENDPOINTS: /roles (backend: app/api/routes/auth/roles.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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
    create: (_data: Partial<Role>) => rejectCanonicalWrite('Creating a role'),

    // Update role
    update: (_roleId: number | string, _data: Partial<Role>) => rejectCanonicalWrite('Editing a role'),

    // Delete role
    delete: (_roleId: number | string, _reassignTo: number | string | null = null) =>
        rejectCanonicalWrite('Deleting a role'),

    // =========================================================================
    // PERMISSIONS
    // =========================================================================

    // Get role permissions
    getPermissions: (roleId: number | string) => {
        return apiHelpers.get<ApiResponse<string[]>>(ENDPOINTS.PERMISSIONS(roleId));
    },

    // Update role permissions
    updatePermissions: (_roleId: number | string, _permissions: string[]) =>
        rejectCanonicalWrite('Editing role permissions'),

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
    assignToUsers: (_roleId: number | string, _userIds: (number | string)[]) =>
        rejectCanonicalWrite('Assigning a role to users'),

    // =========================================================================
    // SETUP
    // =========================================================================

    // Setup default roles (Admin only)
    setupDefaults: () => rejectCanonicalWrite('Creating default roles')
};
