import fs from 'fs';
import path from 'path';
import { invoiceOutputErrorMessage } from './invoiceOutputError';

test.each(['Loading chunk 188 failed.', 'Failed to fetch dynamically imported module'])('safe recovery for %s', message => {
    const result = invoiceOutputErrorMessage(new Error(message), 'PDF unavailable');
    expect(result).toContain('Save any unfinished draft');
    expect(result).toContain('entries have not been cleared');
    expect(result).not.toContain('188');
});

test('non-chunk validation errors remain actionable and unchanged', () => {
    expect(invoiceOutputErrorMessage(new Error('Invoice detail is unavailable'), 'PDF unavailable'))
        .toBe('Invoice detail is unavailable');
    expect(invoiceOutputErrorMessage(null, 'PDF unavailable')).toBe('PDF unavailable');
});

test('all invoice output entry points eagerly include the renderer and never reload or persist local business state', () => {
    const files = ['canonicalInvoiceOutput.ts', '../invoicelist/components/InvoiceTable.tsx'];
    for (const file of files) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        expect(source).toMatch(/import .* from ['"].*invoicePdfGenerator['"]/);
        expect(source).not.toMatch(/import\(['"].*invoicePdfGenerator/);
        expect(source).not.toMatch(/location\.reload|localStorage|sessionStorage|indexedDB/);
    }
});
