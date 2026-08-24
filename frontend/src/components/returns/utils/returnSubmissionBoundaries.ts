import { buildSalesReturnPreparePayload } from './canonicalReturnCommand';

export const SALES_RETURN_SUBMIT_UNAVAILABLE_REASON =
    'Select a posted dispatch-allocated invoice and complete exact billed/free quantity, quarantine, condition, and GST evidence.';

export interface SalesReturnSubmissionBoundary {
    canPrepare: boolean;
    unavailableReason: string;
}

export function getSalesReturnSubmissionBoundary(returnData: Record<string, unknown>): SalesReturnSubmissionBoundary {
    try {
        buildSalesReturnPreparePayload(
            returnData,
            'erp-web-sales-return-prepare:boundary-probe',
        );
        return { canPrepare: true, unavailableReason: '' };
    } catch (error) {
        return {
            canPrepare: false,
            unavailableReason: error instanceof Error
                ? `Canonical sales return is blocked: ${error.message}`
                : SALES_RETURN_SUBMIT_UNAVAILABLE_REASON,
        };
    }
}
