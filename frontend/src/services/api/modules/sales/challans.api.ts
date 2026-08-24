/**
 * Challans API Module
 * Handles delivery challan operations
 *
 * ENDPOINTS: /challan (backend: app/api/routes/sales/challans/routes.py)
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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
    create: (_data: any) => rejectCanonicalWrite('Legacy delivery-challan creation'),
    update: (_id: ChallanId, _data: any) => rejectCanonicalWrite('Legacy delivery-challan editing'),
    delete: (_id: ChallanId) => rejectCanonicalWrite('Legacy delivery-challan deletion'),

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
    createFromOrder: (_orderId: number | string, _data: any) =>
        rejectCanonicalWrite('Legacy order-to-challan creation'),

    // Queries
    getByOrder: (orderId: number | string) => {
        return apiHelpers.get(`/challan/order/${orderId}`);
    },

    getByCustomer: (customerId: number | string) => {
        return apiHelpers.get(`/challan/customer/${customerId}`);
    },

    // Actions
    convertToInvoice: (_id: ChallanId, _data: any = {}) =>
        rejectCanonicalWrite('Legacy challan-to-invoice conversion'),

    updateStatus: (_id: ChallanId, _status: string) =>
        rejectCanonicalWrite('Legacy delivery-challan status changes')
};

export default challansApi;
