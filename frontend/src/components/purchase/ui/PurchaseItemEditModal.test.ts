import { calculatePurchaseItemTotal, getPurchaseItemErrors } from './purchaseItemValidation';

describe('purchase item validation and totals', () => {
    it('never renders NaN for an empty item and blocks Add Item', () => {
        expect(calculatePurchaseItemTotal({})).toBe(0);
        expect(getPurchaseItemErrors({})).toEqual(expect.arrayContaining([
            'Product', 'Expiry date', 'Quantity', 'MRP', 'Purchase Price/Cost', 'Selling Price', 'GST %',
        ]));
    });

    it('calculates a finite canonical draft total once mandatory fields are present', () => {
        const item = {
            product_name: 'Test Product', expiry_date: '2028-12-01', quantity: 2,
            mrp: 160, unit_price: 100, selling_price: 150, tax_percent: 12, discount_percent: 5,
        };
        expect(getPurchaseItemErrors(item)).toEqual([]);
        expect(calculatePurchaseItemTotal(item)).toBeCloseTo(212.8);
    });
});
