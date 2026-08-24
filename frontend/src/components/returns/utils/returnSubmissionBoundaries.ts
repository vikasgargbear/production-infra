export const SALES_RETURN_SUBMIT_UNAVAILABLE_REASON =
    'Sales return submission is unavailable until the original invoice line, dispatch allocation, exact batch allocation, quarantine location, condition, and GST treatment are canonically mapped.';

export interface SalesReturnSubmissionBoundary {
    saving: false;
    handleSaveReturn?: undefined;
    unavailableReason: string;
}

export function getSalesReturnSubmissionBoundary(): SalesReturnSubmissionBoundary {
    return {
        saving: false,
        handleSaveReturn: undefined,
        unavailableReason: SALES_RETURN_SUBMIT_UNAVAILABLE_REASON
    };
}
