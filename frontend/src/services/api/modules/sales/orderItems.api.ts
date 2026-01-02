/**
 * Order Items API Module
 * Handles order item operations
 * 
 * ENDPOINTS: /order-items (backend: handled within orders routes)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/order-items',
    DETAILS: (id: number | string) => `/order-items/${id}`,
    BY_ORDER: (orderId: number | string) => `/orders/${orderId}/items`
};

export const orderItemsApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all order items
    getAll: (params: Record<string, any> = {}) => {
        return apiHelpers.get<any>(ENDPOINTS.BASE, { params });
    },

    // Get order item by ID
    getById: (id: number | string) => {
        return apiHelpers.get<any>(ENDPOINTS.DETAILS(id));
    },

    // Get items by order ID
    getByOrderId: (orderId: number | string) => {
        return apiHelpers.get<any>(ENDPOINTS.BY_ORDER(orderId));
    },

    // Create new order item
    create: (data: any) => {
        return apiHelpers.post<any>(ENDPOINTS.BASE, data);
    },

    // Update order item
    update: (id: number | string, data: any) => {
        return apiHelpers.put<any>(ENDPOINTS.DETAILS(id), data);
    },

    // Delete order item
    delete: (id: number | string) => {
        return apiHelpers.delete<void>(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    // Bulk create order items
    bulkCreate: (items: any[]) => {
        return apiHelpers.post<any>(`${ENDPOINTS.BASE}/bulk`, { items });
    },

    // Update multiple order items
    bulkUpdate: (updates: any[]) => {
        return apiHelpers.put<any>(`${ENDPOINTS.BASE}/bulk`, { updates });
    }
};
