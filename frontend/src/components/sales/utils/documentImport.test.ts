import {
    extractDocumentCollection,
    extractDocumentDetail,
    projectCanonicalImportLines,
} from './documentImport';

describe('Sales document import envelope normalization', () => {
    it('extracts canonical and legacy-shaped collections without treating wrappers as rows', () => {
        expect(extractDocumentCollection({ data: { orders: [{ order_id: 'o-1' }] } }, ['orders']))
            .toEqual([{ order_id: 'o-1' }]);
        expect(extractDocumentCollection({ data: { data: [{ invoice_id: 'i-1' }] } }, ['invoices']))
            .toEqual([{ invoice_id: 'i-1' }]);
        expect(extractDocumentCollection({ data: { total: 3 } }, ['challans']))
            .toEqual([]);
    });

    it('unwraps a document detail used to import line items', () => {
        expect(extractDocumentDetail(
            { data: { delivery_challan: { challan_id: 'c-1', items: [{ product_id: 'p-1' }] } } },
            ['challan', 'delivery_challan'],
        )).toEqual({ challan_id: 'c-1', items: [{ product_id: 'p-1' }] });
    });

    it('preserves canonical UUID batch identity, quantity, rate, and tax', () => {
        expect(projectCanonicalImportLines([{
            product_id: '10000000-0000-7000-8000-000000000001',
            product_name: 'Test Product',
            batch_id: '20000000-0000-7000-8000-000000000001',
            batch_number: 'BATCH-1',
            quantity: 2,
            unit_price: '150.25',
            tax_rate: '12',
        }])).toEqual([expect.objectContaining({
            product_id: '10000000-0000-7000-8000-000000000001',
            batch_id: '20000000-0000-7000-8000-000000000001',
            batch_number: 'BATCH-1',
            quantity: 2,
            unit_price: 150.25,
            gst_percent: 12,
        })]);
    });

    it.each([
        [{ product_id: 'p', product_name: 'Product', quantity: 1, unit_price: 10 }, 'batch allocation'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 0, unit_price: 10 }, 'positive quantity'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 1 }, 'canonical rate'],
    ])('fails closed for incomplete canonical line %#', (line, message) => {
        expect(() => projectCanonicalImportLines([line])).toThrow(message);
    });
});
