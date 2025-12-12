/**
 * Role Management API Module
 * Handles roles and permissions for RBAC
 * 
 * ENDPOINTS: /roles (backend: app/api/routes/auth/roles.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/roles',
    DETAILS: (id) => `/roles/${id}`,
    PERMISSIONS: (id) => `/roles/${id}/permissions`,
    ASSIGN: '/roles/assign',
    USER_PERMISSIONS: (userId) => `/roles/user/${userId}/permissions`,
    VALIDATE: '/roles/validate-permission',
    DEFAULT: '/roles/setup-defaults'
};

export const roleManagementApi = {
    // =========================================================================
    // ROLE CRUD
    // =========================================================================

    // Get all roles
    getAll: () => {
        return apiHelpers.get(ENDPOINTS.BASE);
    },

    // Get role by ID
    getById: (roleId) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(roleId));
    },

    // Create custom role
    create: (data) => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    // Update role
    update: (roleId, data) => {
        return apiHelpers.put(ENDPOINTS.DETAILS(roleId), data);
    },

    // Delete role
    delete: (roleId, reassignTo = null) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(roleId), {
            params: reassignTo ? { reassign_to: reassignTo } : {}
        });
    },

    // =========================================================================
    // PERMISSIONS
    // =========================================================================

    // Get role permissions
    getPermissions: (roleId) => {
        return apiHelpers.get(ENDPOINTS.PERMISSIONS(roleId));
    },

    // Update role permissions
    updatePermissions: (roleId, permissions) => {
        return apiHelpers.put(ENDPOINTS.PERMISSIONS(roleId), { permissions });
    },

    // Get user's effective permissions
    getUserPermissions: (userId) => {
        return apiHelpers.get(ENDPOINTS.USER_PERMISSIONS(userId));
    },

    // Validate if user has specific permission
    validatePermission: (module, action) => {
        return apiHelpers.post(ENDPOINTS.VALIDATE, { module, action });
    },

    // =========================================================================
    // ROLE ASSIGNMENT
    // =========================================================================

    // Assign role to users
    assignToUsers: (roleId, userIds) => {
        return apiHelpers.post(ENDPOINTS.ASSIGN, { role_id: roleId, user_ids: userIds });
    },

    // =========================================================================
    // SETUP
    // =========================================================================

    // Setup default roles (Admin only)
    setupDefaults: () => {
        return apiHelpers.post(ENDPOINTS.DEFAULT);
    }
};
