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
import type { CanonicalChallanImportDetail } from './canonicalSalesDocuments.types';
import { canonicalDocumentHistoryApi } from '../history/canonicalDocumentHistory.api';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
    addExactDecimals,
    compareExactDecimals,
    normalizeAuthoritativeDecimal,
} from '../../../../utils/exactDecimal';

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

export interface CanonicalSalesDispatchReadbackLine {
    dispatch_line_id: string;
    sales_order_line_id: string;
    product_id: string;
    batch_id: string;
    from_location_id: string;
    billed_quantity: string;
    free_quantity: string;
    base_billed_quantity: string;
    base_free_quantity: string;
    inventory_document_line_id: string;
    ledger_entry_id: string;
    ledger_base_quantity: string;
}

export interface CanonicalSalesDispatchReadback {
    dispatch_id: string;
    challan_number: string;
    sales_order_id: string;
    status: 'posted';
    customer_name: string;
    inventory_document_id: string;
    inventory_base_quantity: string;
    lines: CanonicalSalesDispatchReadbackLine[];
}

const dispatchRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
    return value as Record<string, unknown>;
};

const dispatchString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is unavailable.`);
    return value;
};

const dispatchUuid = (value: unknown, label: string): string => {
    const result = dispatchString(value, label);
    if (!isCanonicalUuid(result)) throw new Error(`${label} must be a canonical UUID.`);
    return result;
};

export const normalizeCanonicalSalesDispatchReadback = (value: unknown): CanonicalSalesDispatchReadback => {
    const source = dispatchRecord(value, 'Posted dispatch readback');
    if (source.status !== 'posted') throw new Error('Posted dispatch readback has not reached posted status.');
    if (!Array.isArray(source.lines) || source.lines.length === 0) {
        throw new Error('Posted dispatch readback has no authoritative lines.');
    }
    const lines = source.lines.map((raw, index): CanonicalSalesDispatchReadbackLine => {
        const line = dispatchRecord(raw, `Posted dispatch line ${index + 1}`);
        const quantity = (field: string) => normalizeAuthoritativeDecimal(
            line[field], `Posted dispatch line ${index + 1} ${field.replace(/_/g, ' ')}`,
            { scale: 6, maximumWholeDigits: 14 },
        );
        return {
            dispatch_line_id: dispatchUuid(line.dispatch_line_id, 'Dispatch line id'),
            sales_order_line_id: dispatchUuid(line.sales_order_line_id, 'Sales-order line id'),
            product_id: dispatchUuid(line.product_id, 'Dispatch product id'),
            batch_id: dispatchUuid(line.batch_id, 'Dispatch batch id'),
            from_location_id: dispatchUuid(line.from_location_id, 'Dispatch location id'),
            billed_quantity: quantity('billed_quantity'),
            free_quantity: quantity('free_quantity'),
            base_billed_quantity: quantity('base_billed_quantity'),
            base_free_quantity: quantity('base_free_quantity'),
            inventory_document_line_id: dispatchUuid(line.inventory_document_line_id, 'Inventory document line id'),
            ledger_entry_id: dispatchUuid(line.ledger_entry_id, 'Stock ledger entry id'),
            ledger_base_quantity: quantity('ledger_base_quantity'),
        };
    });
    const inventoryBaseQuantity = normalizeAuthoritativeDecimal(
        source.inventory_base_quantity, 'Dispatch inventory base quantity',
        { scale: 6, maximumWholeDigits: 14 },
    );
    const lineBaseQuantity = addExactDecimals(
        lines.map(line => line.ledger_base_quantity), 'Dispatch line base quantity',
        { scale: 6, maximumWholeDigits: 14 },
    );
    for (const [index, line] of lines.entries()) {
        const expectedBase = addExactDecimals(
            [line.base_billed_quantity, line.base_free_quantity],
            `Posted dispatch line ${index + 1} base quantity`, { scale: 6 },
        );
        if (compareExactDecimals(expectedBase, line.ledger_base_quantity, `Posted dispatch line ${index + 1} ledger quantity`, { scale: 6 }) !== 0) {
            throw new Error(`Posted dispatch line ${index + 1} does not reconcile to its stock ledger quantity.`);
        }
    }
    if (compareExactDecimals(lineBaseQuantity, inventoryBaseQuantity, 'Dispatch base quantity reconciliation', { scale: 6 }) !== 0) {
        throw new Error('Posted dispatch line quantities do not reconcile to the inventory document.');
    }
    return {
        dispatch_id: dispatchUuid(source.dispatch_id, 'Dispatch id'),
        challan_number: dispatchString(source.challan_number, 'Dispatch number'),
        sales_order_id: dispatchUuid(source.sales_order_id, 'Dispatch sales-order id'),
        status: 'posted',
        customer_name: dispatchString(source.customer_name, 'Dispatch customer name'),
        inventory_document_id: dispatchUuid(source.inventory_document_id, 'Inventory document id'),
        inventory_base_quantity: inventoryBaseQuantity,
        lines,
    };
};

const crud = createCrudApi({ basePath: '/challan/' });

export const challansApi = {
    ...crud,
    getById: (id: ChallanId) => apiHelpers.get<CanonicalChallanImportDetail>(
        `/canonical/challans/${id}/import-detail`,
        { preserveExactDecimals: true },
    ),
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
    getCanonical: async (id: string) => {
        const response = await apiHelpers.get(`/canonical/sales-dispatches/${id}/acceptance-readback`, {
            preserveExactDecimals: true,
        });
        return { ...response, data: normalizeCanonicalSalesDispatchReadback(response.data) };
    },

    /** Canonical posted dispatches eligible for invoice allocation import. */
    listPostedForInvoice: async (search = '', pageSize = 50) => {
        const response = await canonicalDocumentHistoryApi.get({
            document_kind: 'sales_dispatch', status: 'posted', search, page: 1, page_size: pageSize,
        });
        return response.items.map(row => {
            if (row.document_kind !== 'sales_dispatch' || row.status !== 'posted') {
                throw new Error('Invoice allocation returned a document that is not a posted sales dispatch.');
            }
            return {
                challan_id: row.document_id,
                challan_number: row.document_number,
                challan_date: row.document_date,
                customer_id: row.party_account_id,
                customer_name: row.party_name,
                delivery_status: 'posted' as const,
            };
        });
    },

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
