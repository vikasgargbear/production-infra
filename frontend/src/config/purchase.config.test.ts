import { validatePDFFile } from './purchase.config';

describe('purchase PDF client validation', () => {
    test('accepts a PDF within the configured size limit', () => {
        const file = new File(['%PDF-1.7'], 'invoice.pdf', { type: 'application/pdf' });
        expect(validatePDFFile(file)).toEqual({ valid: true });
    });

    test('rejects a wrong MIME type or extension before upload', () => {
        expect(validatePDFFile(new File(['hello'], 'invoice.txt', { type: 'text/plain' })))
            .toEqual({ valid: false, error: 'Only PDF files are allowed' });
        expect(validatePDFFile(new File(['%PDF-1.7'], 'invoice.bin', { type: 'application/pdf' })))
            .toEqual({ valid: false, error: 'Invalid file extension' });
    });

    test('rejects oversized PDFs before upload', () => {
        const file = new File(
            [new Uint8Array((10 * 1024 * 1024) + 1)],
            'oversized.pdf',
            { type: 'application/pdf' },
        );
        expect(validatePDFFile(file)).toEqual({
            valid: false,
            error: 'File size must be less than 10MB',
        });
    });
});
