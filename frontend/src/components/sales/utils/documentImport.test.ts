import {
    extractDocumentCollection,
    extractDocumentDetail,
    projectCanonicalImportLines as projectCanonicalImportLinesFromWire,
} from './documentImport';

const QUANTITY_FIELDS = new Set([
    'quantity', 'free_quantity', 'base_quantity', 'entered_quantity',
    'base_billed_quantity', 'base_free_quantity', 'billed_quantity',
]);
const RATE_FIELDS = new Set(['unit_price', 'mrp']);
const PERCENT_FIELDS = new Set(['tax_rate', 'gst_percent', 'discount_percent']);
const MONEY_FIELDS = new Set([
    'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount', 'cess_amount', 'line_total',
]);

const exactWireValue = (key: string, value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(entry => exactWireValue('', entry));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => (
            [childKey, exactWireValue(childKey, childValue)]
        )));
    }
    if (typeof value !== 'number') return value;
    if (QUANTITY_FIELDS.has(key)) return value.toFixed(6);
    if (RATE_FIELDS.has(key)) return value.toFixed(4);
    if (PERCENT_FIELDS.has(key)) return value.toFixed(6);
    if (MONEY_FIELDS.has(key)) return value.toFixed(2);
    return value;
};

const projectCanonicalImportLines = (lines: Array<Record<string, unknown>>) => (
    projectCanonicalImportLinesFromWire(exactWireValue('', lines) as Array<Record<string, unknown>>)
);

describe('Sales document import envelope normalization', () => {
    const allocation = (overrides: Record<string, unknown> = {}) => ({
        source_kind: 'direct_issue',
        allocation_id: 'inventory-line-1',
        command_request_id: 'command-1',
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
            free_quantity: 0,
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            unit_price: '150.25',
            tax_rate: '12',
        }])).toEqual([expect.objectContaining({
            product_id: '10000000-0000-7000-8000-000000000001',
            batch_id: '20000000-0000-7000-8000-000000000001',
            batch_number: 'BATCH-1',
            quantity: '2.000000',
            unit_price: '150.2500',
            gst_percent: '12.000000',
        })]);
    });

    it('rejects JSON numbers at the canonical decimal wire boundary', () => {
        expect(() => projectCanonicalImportLinesFromWire([{
            product_id: 'product-1', product_name: 'Product',
            quantity: 1, free_quantity: '0.000000', unit_price: '10.0000',
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            batch_id: 'batch-1', batch_number: 'BATCH-1',
        }])).toThrow('exact decimal string from the canonical API');
    });

    it('accepts one evidenced direct allocation, including null expiry, without scalar batch fields', () => {
        const result = projectCanonicalImportLines([{
            id: 'invoice-line-1', product_id: 'product-1', product_name: 'Product',
            quantity: 1, free_quantity: 0, unit_price: 150, tax_rate: 12,
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            batch_id: null, batch_number: null,
            batch_allocations: [allocation()],
        }]);

        expect(result).toEqual([expect.objectContaining({
            source_line_id: 'invoice-line-1',
            source_allocation_kind: 'direct_issue',
            allocation_id: 'inventory-line-1',
            inventory_document_line_id: 'inventory-line-1',
            batch_id: 'batch-1', batch_number: 'BATCH-1', expiry_date: null,
            quantity: '1.000000', free_quantity: '0.000000',
            unit_price: '150.0000', gst_percent: '12.000000',
            base_billed_quantity: '1.000000', base_free_quantity: '0.000000',
        })]);
    });

    it('expands evidenced multi-batch direct allocations and preserves quantities and money', () => {
        const result = projectCanonicalImportLines([{
            id: 'invoice-line-1', product_id: 'product-1', product_name: 'Product',
            quantity: 3, free_quantity: 1, unit_price: 100, tax_rate: 12,
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            taxable_amount: 100, cgst_amount: 6, sgst_amount: 6, cess_amount: 1,
            line_total: 113,
            batch_allocations: [
                allocation({
                    base_quantity: 2, base_billed_quantity: 1, base_free_quantity: 1,
                    billed_quantity: 1, free_quantity: 1,
                }),
                allocation({
                    allocation_id: 'inventory-line-2',
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
            .toEqual([['batch-1', '1.000000', '1.000000'], ['batch-2', '2.000000', '0.000000']]);
        expect(result.map(item => item.line_total)).toEqual(['37.67', '75.33']);
        expect(result.map(item => item.taxable_amount)).toEqual(['33.33', '66.67']);
        expect(result.map(item => item.cgst_amount)).toEqual(['2.00', '4.00']);
        expect(result.map(item => item.sgst_amount)).toEqual(['2.00', '4.00']);
        expect(result.map(item => item.cess_amount)).toEqual(['0.33', '0.67']);
    });

    it('preserves distinct dispatch allocation and custody identities', () => {
        const result = projectCanonicalImportLines([{
            product_id: 'product-1', product_name: 'Product', quantity: 1,
            free_quantity: 0, unit_price: 10,
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            batch_allocations: [allocation({
                source_kind: 'dispatch_allocation', command_request_id: null,
                allocation_id: 'invoice-dispatch-allocation-1',
                invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-1',
                dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
            })],
        }]);

        expect(result[0]).toEqual(expect.objectContaining({
            allocation_id: 'invoice-dispatch-allocation-1',
            invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-1',
            dispatch_id: 'dispatch-1', dispatch_line_id: 'dispatch-line-1',
        }));
    });

    it.each([
        ['excluded_from_taxable_value', [1, 1], ['0.01', '0.01', '0.00', '0.00']],
        ['included_at_unit_rate', [1, 1], ['0.01', '0.01', '0.00', '0.00']],
    ])('apportions ₹0.02 across four %s allocations without negative residuals', (
        freeSupplyTaxTreatment, billedAndFree, expected,
    ) => {
        const [billed, free] = billedAndFree;
        const allocations = Array.from({ length: 4 }, (_, index) => allocation({
            allocation_id: `inventory-line-${index + 1}`,
            inventory_document_line_id: `inventory-line-${index + 1}`,
            batch_id: `batch-${index + 1}`, batch_number: `BATCH-${index + 1}`,
            base_quantity: billed + free, base_billed_quantity: billed,
            base_free_quantity: free, billed_quantity: billed, free_quantity: free,
        }));
        const result = projectCanonicalImportLines([{
            product_id: 'product-1', product_name: 'Product', quantity: billed * 4,
            free_quantity: free * 4, unit_price: 1,
            free_supply_tax_treatment: freeSupplyTaxTreatment,
            taxable_amount: '0.02', line_total: '0.02', batch_allocations: allocations,
        }]);

        expect(result.map(item => item.line_total)).toEqual(expected);
        expect(result.every(item => !String(item.line_total).startsWith('-'))).toBe(true);
    });

    it('uses free quantity in the valuation basis only when canonical treatment includes it', () => {
        const shared = {
            product_id: 'product-1', product_name: 'Product', quantity: 2,
            free_quantity: 2, unit_price: 10, taxable_amount: 40, line_total: 40,
            batch_allocations: [
                allocation({ billed_quantity: 2, free_quantity: 0, base_quantity: 2,
                    base_billed_quantity: 2, base_free_quantity: 0 }),
                allocation({ allocation_id: 'inventory-line-2',
                    inventory_document_line_id: 'inventory-line-2',
                    batch_id: 'batch-2', batch_number: 'BATCH-2', billed_quantity: 0,
                    free_quantity: 2, base_quantity: 2, base_billed_quantity: 0,
                    base_free_quantity: 2 }),
            ],
        };

        expect(projectCanonicalImportLines([{
            ...shared, free_supply_tax_treatment: 'included_at_unit_rate',
        }]).map(item => item.line_total)).toEqual(['20.00', '20.00']);
        expect(projectCanonicalImportLines([{
            ...shared, free_supply_tax_treatment: 'excluded_from_taxable_value',
            taxable_amount: 20, line_total: 20,
        }]).map(item => item.line_total)).toEqual(['20.00', '0.00']);
    });

    it('supports a free-only included-at-unit-rate line with exact allocation evidence', () => {
        const freeOnlyLine = {
            product_id: 'product-1', product_name: 'Product', quantity: 0,
            free_quantity: 2, unit_price: 10,
            batch_allocations: [
                allocation({ billed_quantity: 0, free_quantity: 1, base_billed_quantity: 0,
                    base_free_quantity: 1 }),
                allocation({ allocation_id: 'inventory-line-2',
                    inventory_document_line_id: 'inventory-line-2',
                    batch_id: 'batch-2', batch_number: 'BATCH-2', billed_quantity: 0,
                    free_quantity: 1, base_billed_quantity: 0, base_free_quantity: 1 }),
            ],
        };
        const result = projectCanonicalImportLines([{
            ...freeOnlyLine,
            free_supply_tax_treatment: 'included_at_unit_rate', line_total: 20,
        }]);

        expect(result.map(item => [item.quantity, item.free_quantity, item.line_total]))
            .toEqual([['0.000000', '1.000000', '10.00'], ['0.000000', '1.000000', '10.00']]);
        expect(projectCanonicalImportLines([{
            ...freeOnlyLine,
            free_supply_tax_treatment: 'excluded_from_taxable_value', line_total: 0,
        }]).map(item => item.line_total)).toEqual(['0.00', '0.00']);
    });

    it.each([
        [[], 'no executed canonical batch allocations'],
        [[allocation({ inventory_document_line_id: undefined })], 'inventory document line identity'],
        [[allocation({ source_kind: 'dispatch_allocation' })], 'dispatch lineage identities'],
        [[allocation(), allocation({
            source_kind: 'dispatch_allocation', command_request_id: null,
            allocation_id: 'invoice-dispatch-allocation-2',
            invoice_dispatch_allocation_id: 'invoice-dispatch-allocation-2',
            dispatch_id: 'dispatch-2', dispatch_line_id: 'dispatch-line-2',
            inventory_document_line_id: 'inventory-line-2',
        })], 'mixes incompatible execution sources'],
        [[allocation(), allocation()], 'duplicates a canonical allocation identity'],
        [[allocation(), allocation({
            allocation_id: 'inventory-line-2', inventory_document_line_id: 'inventory-line-2',
            batch_id: 'batch-2', batch_number: 'BATCH-2', billed_quantity: null,
        })], 'does not identify billed and free quantities separately'],
        [[allocation({ billed_quantity: '0.500000', base_quantity: '0.500000',
            base_billed_quantity: '0.500000' }), allocation({
            allocation_id: 'inventory-line-2', inventory_document_line_id: 'inventory-line-2',
            command_request_id: 'command-2', batch_id: 'batch-2', batch_number: 'BATCH-2',
            billed_quantity: '0.500000', base_quantity: '0.500000', base_billed_quantity: '0.500000',
        })], 'different canonical commands'],
        [[allocation({ allocation_id: 'wrong-direct-id' })], 'direct-issue lineage identities'],
        [[allocation({ billed_quantity: 2 })], 'do not reconcile'],
        [[allocation({ base_quantity: 2 })], 'contradictory executed base quantities'],
    ])('fails closed for invalid executed allocation set %#', (batchAllocations, message) => {
        expect(() => projectCanonicalImportLines([{
            product_id: 'product-1', product_name: 'Product', quantity: 1,
            free_quantity: 0, unit_price: 10,
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            batch_allocations: batchAllocations,
        }])).toThrow(message);
    });

    it.each([
        [{ product_id: 'p', product_name: 'Product', quantity: 1, free_quantity: 0, unit_price: 10 }, 'batch allocation'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 0, free_quantity: 0, unit_price: 10 }, 'positive billed or free quantity'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B', quantity: 1, free_quantity: 0 }, 'canonical rate'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            quantity: 1, free_quantity: 0, unit_price: 10, free_supply_tax_treatment: 'unknown' },
        'invalid free-supply tax treatment'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            quantity: 1, free_quantity: 0, unit_price: 10 },
        'missing its canonical free-supply tax treatment'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            quantity: 1, unit_price: 10 }, 'billed and free quantities separately'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            quantity: 1, free_quantity: null, unit_price: 10 }, 'billed and free quantities separately'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            free_quantity: 1, unit_price: 10 }, 'billed and free quantities separately'],
        [{ product_id: 'p', product_name: 'Product', batch_id: 'b', batch_number: 'B',
            quantity: null, free_quantity: 1, unit_price: 10 }, 'billed and free quantities separately'],
    ])('fails closed for incomplete canonical line %#', (line, message) => {
        expect(() => projectCanonicalImportLines([line])).toThrow(message);
    });
});
