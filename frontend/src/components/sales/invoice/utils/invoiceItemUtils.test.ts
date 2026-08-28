import {
    prepareImportedItemsForInvoice,
    prepareItemForInvoice,
    prepareSelectedProductForInvoice,
} from './invoiceItemUtils';

const selectedBatch = {
    batch_id: '33333333-3333-4333-8333-333333333333',
    batch_number: 'BATCH-1',
    quantity_available: '99999999999999.123456',
    sale_price_per_unit: '9007199254740993.1250',
    unit_price: '9007199254740993.1250',
    mrp_per_unit: '9007199254740993.2500',
    mrp: '9007199254740993.2500',
    gst_percent: '12.000000',
};

describe('prepareItemForInvoice free-supply treatment', () => {
    it.each([
        'included_at_unit_rate',
        'excluded_from_taxable_value',
    ] as const)('preserves %s from an imported product line', treatment => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Canonical item',
            ...selectedBatch,
            quantity: '2.000000',
            free_quantity: '1.000000',
            free_supply_tax_treatment: treatment,
        });

        expect(item).toEqual(expect.objectContaining({
            product_id: '22222222-2222-4222-8222-222222222222',
            batch_id: '33333333-3333-4333-8333-333333333333',
            quantity: '2.000000',
            free_quantity: '1.000000',
            free_supply_tax_treatment: treatment,
            unit_price: '9007199254740993.1250',
            gst_percent: '12.000000',
        }));
    });

    it('rejects a selected product without explicit billed and free quantities', () => {
        expect(() => prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Canonical item',
            ...selectedBatch,
            quantity: undefined,
            free_quantity: undefined,
        } as any)).toThrow(/exact decimal strings/);
    });

    it('does not replace explicit selection quantities with defaults', () => {
        const item = prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Explicit selection quantity',
            ...selectedBatch,
            quantity: '0.100000',
            free_quantity: '0.200000',
            free_supply_tax_treatment: 'included_at_unit_rate',
        });

        expect(item.quantity).toBe('0.100000');
        expect(item.free_quantity).toBe('0.200000');
    });

    it.each([
        ['selected batch', {
            batch_id: '33333333-3333-4333-8333-333333333333',
            quantity_available: '2.750000',
            sale_price_per_unit: '100.1250',
            mrp_per_unit: '120.2500',
        }, '2.750000'],
        ['best batch', {
            best_batch: {
                batch_id: '33333333-3333-4333-8333-333333333333',
                quantity_available: '4.125000',
                sale_price_per_unit: '100.1250',
                mrp_per_unit: '120.2500',
            },
        }, '4.125000'],
    ])('preserves exact fractional availability from the %s', (_label, source, expected) => {
        const item = prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Fractional stock item',
            gst_percent: '12.000000',
            quantity: '0.100000',
            free_quantity: '0.000000',
            ...source,
        });

        expect(item.available_quantity).toBe(expected);
    });

    it('rejects invalid selected-batch availability instead of truncating/defaulting it', () => {
        expect(() => prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Invalid stock item',
            batch_id: '33333333-3333-4333-8333-333333333333',
            quantity_available: '-0.250000',
            sale_price_per_unit: '100.0000',
            mrp_per_unit: '120.0000',
            gst_percent: '12.000000',
            quantity: '0.100000',
            free_quantity: '0.000000',
        })).toThrow(/plain decimal string/);
    });

    it('rejects a JSON-number batch decimal at the authoritative selection boundary', () => {
        expect(() => prepareSelectedProductForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Unsafe numeric stock item',
            ...selectedBatch,
            quantity_available: 0.1,
            quantity: '0.100000',
            free_quantity: '0.000000',
        })).toThrow(/must remain an exact decimal string/);
    });

    it.each([
        'included_at_unit_rate',
        'excluded_from_taxable_value',
    ] as const)('preserves a free-only %s canonical line', treatment => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Free-only canonical item',
            ...selectedBatch,
            batch_number: 'BATCH-FREE',
            quantity: '0.000000',
            free_quantity: '2.500000',
            free_supply_tax_treatment: treatment,
        });

        expect(item).toEqual(expect.objectContaining({
            quantity: '0.000000',
            free_quantity: '2.500000',
            free_supply_tax_treatment: treatment,
        }));
    });

    it('preserves fractional billed and free quantities exactly', () => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Fractional canonical item',
            ...selectedBatch,
            batch_number: 'BATCH-FRACTIONAL',
            quantity: '0.123456',
            free_quantity: '1.625000',
            free_supply_tax_treatment: 'included_at_unit_rate',
        });

        expect(item.quantity).toBe('0.123456');
        expect(item.free_quantity).toBe('1.625000');
        expect(item.unit_price).toBe('9007199254740993.1250');
    });

    it('preserves imported dispatch fractional strings without a Number boundary', () => {
        const [item] = prepareImportedItemsForInvoice([{
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Fractional dispatch item',
            batch_id: '33333333-3333-4333-8333-333333333333',
            batch_number: 'BATCH-FRACTIONAL',
            source_line_id: '44444444-4444-4444-8444-444444444444',
            quantity: '1.125000',
            free_quantity: '0.250000',
            base_billed_quantity: '11.250000',
            base_free_quantity: '2.500000',
            source_billed_quantity: '1.125000',
            source_free_quantity: '0.250000',
            unit_price: '84.1250',
            sale_price: '84.1250',
            gst_percent: '12.000000',
            discount_percent: '0.000000',
            free_supply_tax_treatment: 'excluded_from_taxable_value',
        }]);
        expect(item).toEqual(expect.objectContaining({
            quantity: '1.125000', free_quantity: '0.250000',
            base_billed_quantity: '11.250000', base_free_quantity: '2.500000',
            source_billed_quantity: '1.125000', source_free_quantity: '0.250000',
            unit_price: '84.1250', discount_percent: '0.000000',
        }));
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
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            unit_price: 100,
        } as any])).toThrow(/plain decimal string|exact decimal string/);
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
            free_supply_tax_treatment: 'excluded_from_taxable_value',
            ...quantities,
        } as any])).toThrow(/exact decimal string/);
    });

    it('fails closed when a canonical import omits free-supply tax treatment', () => {
        expect(() => prepareImportedItemsForInvoice([{
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Incomplete canonical treatment',
            quantity: 1,
            free_quantity: 0,
            unit_price: 100,
        }])).toThrow('missing its canonical free-supply tax treatment');
    });
});
