/** Canonical GST read projections. */

import { apiHelpers } from '../../apiClient';

// Type definitions
interface GSTFilters {
    period?: string;
    from_date?: string;
    to_date?: string;
    [key: string]: unknown;
}

const ENDPOINTS = {
    DASHBOARD: '/gst/dashboard',
    GSTR1: '/gst/reports/gstr1',
    GSTR3B: '/gst/reports/gstr3b',
};

export const gstApi = {
    dashboard: {
        getSummary: (period: string) => {
            return apiHelpers.get(ENDPOINTS.DASHBOARD, {
                params: { period },
                preserveExactDecimals: true,
            });
        },
    },
    reports: {
        gstr1: (filters: GSTFilters = {}) => {
            return apiHelpers.get(ENDPOINTS.GSTR1, {
                params: filters,
                preserveExactDecimals: true,
            });
        },

        gstr3b: (filters: GSTFilters = {}) => {
            return apiHelpers.get(ENDPOINTS.GSTR3B, {
                params: filters,
                preserveExactDecimals: true,
            });
        },
    },
};

export default gstApi;
