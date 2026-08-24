import {
    extractDocumentCollection,
    extractDocumentDetail,
    projectCanonicalImportLines,
} from './documentImport';

describe('Sales document import envelope normalization', () => {
    const allocation = (overrides: Record<string, unknown> = {}) => ({
        source_kind: 'direct_issue',
        allocation_id: 'allocation-1',
        inventory_document_id: 'inventory-document-1',
        inventory_document_line_id: 'inventory-line-1',
        batch_id: 'batch-1',
        batch_number: 'BATCH-1',
        expiry_date: null,
        base_quantity: 1,
        base_billed_quantity: 1,
        base_free_quantity: 0,
        billed_quantity: 1,
        free_quantity: 0,
        ...overrides,
    });

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

    it('accepts one direct executed allocation, including null expiry, without scalar batch fields', () => {
        const result = projectCanonicalImportLines([{
            id: 'invoice-line-1', product_id: 'product-1', product_name: 'Product',
            quantity: 1, free_quantity: 0, unit_price: 150, tax_rate: 12,
            batch_id: null, batch_number: null,
            batch_allocations: [allocation({
                billed_quantity: null, free_quantity: null,
                base_billed_quantity: null, base_free_quantity: null,
            })],
        }]);

        expect(result).toEqual([expect.objectContaining({
            source_line_id: 'invoice-line-1',
            source_allocation_kind: 'direct_issue',
            allocation_id: 'allocation-1',
            inventory_document_line_id: 'inventory-line-1',
            batch_id: 'batch-1', batch_number: 'BATCH-1', expiry_date: null,
            quantity: 1, free_quantity: 0, unit_price: 150, gst_percent: 12,
        })]);
    });

    it('expands many direct/dispatch allocations and preserves quantities, free stock, and money', () => {
        const result = projectCanonicalImportLines([{
            id: 'invoice-line-1', product_id: 'product-1', product_name: 'Product',
            quantity: 3, free_quantity: 1, unit_price: 100, tax_rate: 12,
            taxable_amount: 100, cgst_amount: 6, sgst_amount: 6, cess_amount: 1,
            line_total: 113,
            batch_allocations: [
                allocation({
                    base_quantity: 2, base_billed_quantity: 1, base_free_quantity: 1,
                    billed_quantity: 1, free_quantity: 1,
                }),
                allocation({
                    source_kind: 'dispatch_allocation', allocation_id: 'allocation-2',
                    invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
                    inventory_document_id: 'inventory-document-2',
                    inventory_document_line_id: 'inventory-line-2',
                    batch_id: 'batch-2', batch_number: 'BATCH-2',
                    expiry_date: '2028-09-01', base_quantity: 2,
                    base_billed_quantity: 2, base_free_quantity: 0,
                    billed_quantity: 2, free_quantity: 0,
                }),
            ],
        }]);

        expect(result).toHaveLength(2);
        expect(result.map(item => [item.batch_id, item.quantity, item.free_quantity]))
            .toEqual([['batch-1', 1, 1], ['batch-2', 2, 0]]);
        expect(result[1].invoice_dispatch_allocation_id).toBe('invoice-dispatch-allocation-2');
        expect(result.map(item => item.line_total)).toEqual([37.67, 75.33]);
        expect(result.reduce((sum, item) => sum + Number(item.taxable_amount), 0)).toBe(100);
        expect(result.reduce((sum, item) => sum + Number(item.cgst_amount), 0)).toBe(6);
        expect(result.reduce((sum, item) => sum + Number(item.sgst_amount), 0)).toBe(6);
        expect(result.reduce((sum, item) => sum + Number(item.cess_amount), 0)).toBe(1);
        expect(result.reduce((sum, item) => sum + Number(item.line_total), 0)).toBe(113);
    });

    it.each([
        [[], 'no executed canonical batch allocations'],
        [[allocation({ inventory_document_line_id: undefined })], 'inventory document line identity'],
        [[allocation({ source_kind: 'dispatch_allocation' })], 'invoice dispatch allocation identity'],
        [[allocation(), allocation({ allocation_id: 'allocation-2' })], 'duplicates an executed inventory line'],
        [[allocation(), allocation({
            allocation_id: 'allocation-2', inventory_document_line_id: 'inventory-line-2',
            batch_id: 'batch-2', batch_number: 'BATCH-2', billed_quantity: null,
        })], 'does not identify billed and free quantities separately'],
        [[allocation({ billed_quantity: 2 })], 'do not reconcile'],
        [[allocation({ base_quantity: 2 })], 'contradictory executed base quantities'],
    ])('fails closed for invalid executed allocation set %#', (batchAllocations, message) => {
        expect(() => projectCanonicalImportLines([{
            product_id: 'product-1', product_name: 'Product', quantity: 1,
            free_quantity: 0, unit_price: 10, batch_allocations: batchAllocations,
        }])).toThrow(message);
    });

    it.each([
        [{ product_id: 'p', product_name: 'Product', quantity: 1, unit_price: 10 }, 'batch allocation'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 0, unit_price: 10 }, 'positive billed or free quantity'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 1 }, 'canonical rate'],
    ])('fails closed for incomplete canonical line %#', (line, message) => {
        expect(() => projectCanonicalImportLines([line])).toThrow(message);
    });
});
