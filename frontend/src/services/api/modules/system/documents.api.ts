/**
 * Documents API Module
 * Handles generic document operations like number generation
 */
import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    GENERATE_NUMBER: '/documents/generate-number'
};

export const documentsApi = {
    /**
     * Generate next document number for any type
     * @param type Document type code (INV, PO, DC, etc.)
     */
    generateNumber: (type: string) => {
        return apiHelpers.get(ENDPOINTS.GENERATE_NUMBER, {
            params: { type }
        });
    }
};
