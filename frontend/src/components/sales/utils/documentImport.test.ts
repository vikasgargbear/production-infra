import { extractDocumentCollection, extractDocumentDetail } from './documentImport';

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
});
