/**
 * Departments API Module
 * Handles department management
 * 
 * ENDPOINTS: /departments (backend: app/api/routes/master/departments.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/departments',
    DETAILS: (id) => `/departments/${id}`,
    EMPLOYEES: (id) => `/departments/${id}/employees`,
    HEAD: (id) => `/departments/${id}/head`
};

export const departmentsApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all departments
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get department by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create new department
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update department
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete department
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // EMPLOYEES
    // =========================================================================

    // Get employees in department
    getEmployees: (departmentId) => {
        return apiHelpers.get(ENDPOINTS.EMPLOYEES(departmentId));
    },

    // Assign employee to department
    assignEmployee: (departmentId, employeeId) => {
        return apiHelpers.post(ENDPOINTS.EMPLOYEES(departmentId), { employee_id: employeeId });
    },

    // =========================================================================
    // DEPARTMENT HEAD
    // =========================================================================

    // Set department head
    setHead: (departmentId, employeeId) => {
        return apiHelpers.put(ENDPOINTS.HEAD(departmentId), { employee_id: employeeId });
    },

    // Get department head
    getHead: (departmentId) => {
        return apiHelpers.get(ENDPOINTS.HEAD(departmentId));
    }
};
