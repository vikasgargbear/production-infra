import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'InvoiceFlow.tsx'), 'utf8');

test('post-save print and download cannot use the mutable preview or raster PDF path', () => {
    expect(source).toContain('printCanonicalInvoiceById');
    expect(source).toContain('downloadCanonicalInvoiceById');
    expect(source).toContain('handleCanonicalPrint(createdInvoiceData.invoiceId)');
    expect(source).toContain('handlePDFDownload(createdInvoiceData.invoiceId)');
    expect(source).not.toContain('html2pdf');
    expect(source).not.toContain('invoice-preview');
    expect(source).not.toContain('createdInvoiceData.items');
});
