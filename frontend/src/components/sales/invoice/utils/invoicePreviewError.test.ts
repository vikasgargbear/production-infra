import { DEFAULT_INVOICE_PREVIEW_ERROR, invoicePreviewError, isInvoicePreviewError } from './invoicePreviewError';

it('explains missing customer address instead of reporting broken arithmetic', () => {
    const message = invoicePreviewError({ response: { status: 422, data: {
        detail: 'customer has no effective primary sales address',
    } } });
    expect(message).toContain('active primary sales address');
    expect(message).toContain('invoice date');
    expect(isInvoicePreviewError(message)).toBe(true);
});

it.each([null, new Error('Network Error'), { response: { status: 500, data: { detail: 'private SQL' } } },
    { response: { status: 422, data: { detail: [{ msg: 'unknown failure' }] } } }])(
    'does not expose arbitrary failure details: %p', error => {
        expect(invoicePreviewError(error)).toBe(DEFAULT_INVOICE_PREVIEW_ERROR);
    });

it('recognizes recoverable preview messages without clearing unrelated errors', () => {
    expect(isInvoicePreviewError(DEFAULT_INVOICE_PREVIEW_ERROR)).toBe(true);
    expect(isInvoicePreviewError('Company setup is incomplete')).toBe(false);
    expect(isInvoicePreviewError(null)).toBe(false);
});
