/**
 * Documents API Module
 * Handles generic document operations like number reservation
 */
import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    GENERATE_NUMBER: '/documents/generate-number'
};

export const documentsApi = {
    /**
     * Reserve the next server-backed document number for a supported type.
     * @param type Document type code (INV, PO, DC, etc.)
     */
    reserveNumber: (type: string) => {
        return apiHelpers.post(`${ENDPOINTS.GENERATE_NUMBER}?type=${encodeURIComponent(type)}`, {});
    }
};
