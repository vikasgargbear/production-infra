import { prepareItemForInvoice } from './invoiceItemUtils';

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

    it('defaults newly selected products to excluded free-supply valuation', () => {
        const item = prepareItemForInvoice({
            product_id: '22222222-2222-4222-8222-222222222222',
            product_name: 'Canonical item',
            quantity: 1,
            unit_price: 100,
        });

        expect(item.free_supply_tax_treatment).toBe('excluded_from_taxable_value');
    });
});
