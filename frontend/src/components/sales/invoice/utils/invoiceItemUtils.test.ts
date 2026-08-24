import {
    prepareImportedItemsForInvoice,
    prepareItemForInvoice,
    prepareSelectedProductForInvoice,
} from './invoiceItemUtils';

describe('prepareItemForInvoice free-supply treatment', () => {
    it.each([
        'included_at_unit_rate',
        'excluded_from_taxable_value',
    ] as const)('preserves %s from an imported product line', treatment => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Canonical item',
            batch_id: '33333333-3333-4333-8333-333333333333',
            batch_number: 'BATCH-1',
            quantity: 2,
            free_quantity: 1,
            free_supply_tax_treatment: treatment,
            unit_price: 100,
            gst_percent: 18,
        });

        expect(item).toEqual(expect.objectContaining({
            product_id: '22222222-2222-4222-8222-222222222222',
            batch_id: '33333333-3333-4333-8333-333333333333',
            quantity: 2,
            free_quantity: 1,
            free_supply_tax_treatment: treatment,
            unit_price: 100,
            gst_percent: 18,
        }));
    });

    it('defaults quantities only at the explicit new-product selection boundary', () => {
        const item = prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Canonical item',
            unit_price: 100,
        });

        expect(item.quantity).toBe(1);
        expect(item.free_quantity).toBe(0);
        expect(item.free_supply_tax_treatment).toBe('excluded_from_taxable_value');
    });

    it('does not replace explicit selection quantities with defaults', () => {
        const item = prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Explicit selection quantity',
            quantity: 0,
            free_quantity: 0.5,
            unit_price: 100,
        });

        expect(item.quantity).toBe(0);
        expect(item.free_quantity).toBe(0.5);
    });

    it.each([
        'included_at_unit_rate',
        'excluded_from_taxable_value',
    ] as const)('preserves a free-only %s canonical line', treatment => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Free-only canonical item',
            batch_id: '33333333-3333-4333-8333-333333333333',
            batch_number: 'BATCH-FREE',
            quantity: 0,
            free_quantity: 2.5,
            free_supply_tax_treatment: treatment,
            unit_price: 100,
            gst_percent: 18,
        });

        expect(item).toEqual(expect.objectContaining({
            quantity: 0,
            free_quantity: 2.5,
            free_supply_tax_treatment: treatment,
        }));
    });

    it('preserves fractional billed and free quantities exactly', () => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Fractional canonical item',
            batch_id: '33333333-3333-4333-8333-333333333333',
            batch_number: 'BATCH-FRACTIONAL',
            quantity: 0.375,
            free_quantity: 1.625,
            unit_price: 100,
        });

        expect(item.quantity).toBe(0.375);
        expect(item.free_quantity).toBe(1.625);
    });

    it.each([
        ['negative billed quantity', -1, 0],
        ['negative free quantity', 1, -1],
        ['non-finite billed quantity', Number.POSITIVE_INFINITY, 0],
        ['non-finite free quantity', 1, Number.NaN],
        ['blank billed quantity', '', 0],
        ['non-numeric free quantity', 1, 'not-a-number'],
    ])('fails closed for canonical import with %s', (_case, quantity, freeQuantity) => {
        expect(() => prepareImportedItemsForInvoice([{
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Invalid canonical item',
            quantity,
            free_quantity: freeQuantity,
            unit_price: 100,
        } as any])).toThrow('must be a finite non-negative number');
    });

    it.each([
        ['absent billed quantity', { free_quantity: 0 }],
        ['null billed quantity', { quantity: null, free_quantity: 0 }],
        ['absent free quantity', { quantity: 1 }],
        ['null free quantity', { quantity: 1, free_quantity: null }],
    ])('fails closed for canonical import with %s', (_case, quantities) => {
        expect(() => prepareImportedItemsForInvoice([{
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Incomplete canonical import',
            unit_price: 100,
            ...quantities,
        } as any])).toThrow('must be a finite non-negative number');
    });
});
