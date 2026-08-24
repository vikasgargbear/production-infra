/**
 * Challans API Module
 * Handles delivery challan operations
 *
 * ENDPOINTS: /challan (backend: app/api/routes/sales/challans/routes.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { createCrudApi } from '../../utils/createCrudApi';
import {
    approveAndExecuteCanonicalAction,
    canonicalExecutionCompleted,
    prepareCanonicalAction,
    type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';

// Type definitions
type ChallanId = number | string;

interface ChallanParams {
    skip?: number;
    limit?: number;
    customer_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    [key: string]: unknown;
}

const crud = createCrudApi({ basePath: '/challan/' });

export const challansApi = {
    ...crud,

    prepareCanonical: (payload: Record<string, unknown>) =>
        prepareCanonicalAction('sales.dispatch.prepare', payload),

    executePreparedCanonical: async (preview: CanonicalCommandPreview, lifecycleId: string) => {
        const { executed } = await approveAndExecuteCanonicalAction('sales.dispatch.prepare', preview, lifecycleId);
        if (!canonicalExecutionCompleted(executed.data) || !executed.data.resource_id) {
            throw new Error('Canonical dispatch execution did not return a completed resource identity.');
        }
        return executed;
    },
    getCanonical: (id: string) => apiHelpers.get(`/canonical/sales-dispatches/${id}/acceptance-readback`),

    /** Search challans */
    search: (params: ChallanParams = {}) => {
        return apiHelpers.get('/challan/', { params });
    },

    /** Create challan from order */
    createFromOrder: (orderId: number | string, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post('/challan/', { order_id: orderId, ...cleanedData });
    },

    // Queries
    getByOrder: (orderId: number | string) => {
        return apiHelpers.get(`/challan/order/${orderId}`);
    },

    getByCustomer: (customerId: number | string) => {
        return apiHelpers.get(`/challan/customer/${customerId}`);
    },

    // Actions
    convertToInvoice: (id: ChallanId, data: any = {}) => {
        return apiHelpers.post(`/challan/${id}/convert-to-invoice`, data);
    },

    updateStatus: (id: ChallanId, status: string) => {
        return apiHelpers.patch(`/challan/${id}/status`, { status });
    }
};

export default challansApi;
