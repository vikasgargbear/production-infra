import { getPurchaseItemErrors } from './purchaseItemValidation';

describe('purchase item validation and totals', () => {
    it('never renders NaN for an empty item and blocks Add Item', () => {
        expect(getPurchaseItemErrors({})).toEqual(expect.arrayContaining([
            'Product', 'Batch number', 'Pack type', 'Pack size', 'Units per pack',
            'Expiry date', 'Quantity', 'MRP', 'Purchase Price/Cost', 'Selling Price', 'GST %',
        ]));
    });

    it('accepts explicit mandatory facts without browser-owned totals', () => {
        const item = {
            product_name: 'Test Product', batch_number: 'BATCH-EXPLICIT', pack_type: 'STRIP',
            pack_size: 10, units_per_pack: 10, expiry_date: '2028-12-01', quantity: 2,
            mrp: 160, unit_price: 100, selling_price: 150, tax_percent: 12, discount_percent: 5,
        };
        expect(getPurchaseItemErrors(item)).toEqual([]);
    });
});
