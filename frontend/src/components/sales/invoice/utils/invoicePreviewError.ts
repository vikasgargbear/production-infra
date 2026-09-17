export const DEFAULT_INVOICE_PREVIEW_ERROR =
    'Unable to calculate invoice totals. Please review the entries and try again.';

const ADDRESS_ERROR =
    'This customer has no active primary sales address for the invoice date. Complete the customer address before continuing.';

export function invoicePreviewError(error: unknown): string {
    const response = (error as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response;
    // Only expose a known validation failure, never arbitrary server details.
    if (response?.status === 422
        && response.data?.detail === 'customer has no effective primary sales address') {
        return ADDRESS_ERROR;
    }
    return DEFAULT_INVOICE_PREVIEW_ERROR;
}

export function isInvoicePreviewError(message: string | null): boolean {
    return message === DEFAULT_INVOICE_PREVIEW_ERROR || message === ADDRESS_ERROR;
}
