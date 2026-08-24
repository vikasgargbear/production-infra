/**
 * Collection Center API Module
 * Handles collection center operations
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface CollectionParams {
    party_type?: 'customer' | 'supplier';
    status?: string;
    priority?: 'high' | 'medium' | 'low';
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
}

export interface ReminderData {
    reminder_date: string;
    reminder_note?: string;
    priority?: 'high' | 'medium' | 'low';
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/collection-center',
    PENDING: '/collection-center/pending',
    TODAY: '/collection-center/today',
    OVERDUE: '/collection-center/overdue',
    STATS: '/collection-center/stats',
    REMINDERS: '/collection-center/reminders'
} as const;

// ============================================
// API Module
// ============================================

export const collectionCenterApi = {
    // Get all collections
    getCollections: (params: CollectionParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get pending collections
    getPending: (params: CollectionParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PENDING, { params });
    },

    // Get today's collections
    getToday: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.TODAY);
    },

    // Get overdue collections
    getOverdue: (params: CollectionParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.OVERDUE, { params });
    },

    // Get collection stats
    getStats: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STATS);
    },

    // Get reminders
    getReminders: (params: { date?: string } = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.REMINDERS, { params });
    },

    // Set reminder
    setReminder: (_customerId: number, _data: ReminderData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Creating a collection reminder'),

    // Update collection status
    updateStatus: (_customerId: number, _status: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Changing collection status'),

    // Mark as collected
    markCollected: (_customerId: number, _amount: number, _notes?: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Recording a collection'),

    // Dismiss reminder
    dismissReminder: (_reminderId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Dismissing a collection reminder')
};
