import {
    cleanItemForBackend,
    generateTempId,
    prepareItemForGRN,
    prepareItemForPurchaseOrder,
} from './productItemTransform';

const product = {
    product_id: 'd3000000-0000-7000-8000-000000000001',
    product_name: 'Authoritative product',
    hsn_code: '481910',
    quantity: '2',
    free_quantity: '0',
    unit_price: '100.25',
    discount_percent: '0',
    gst_percent: '12',
    mrp: '150',
    selling_price: '140',
};

describe('purchase item transformation authority', () => {
    it('creates unique monotonic draft-row identities without random values', () => {
        const first = generateTempId();
        const second = generateTempId();

        expect(first).toMatch(/^temp_\d+$/);
        expect(Number(second.slice(5))).toBe(Number(first.slice(5)) + 1);
    });

    it('uses only supplied facts and does not derive jurisdictional tax splits', () => {
        const order = prepareItemForPurchaseOrder(product);
        expect(order).toMatchObject({
            quantity: 2, free_quantity: 0, unit_price: 100.25,
            discount_percent: 0, tax_percent: 12,
        });
        expect(order).not.toHaveProperty('cgst_rate');
        expect(order).not.toHaveProperty('sgst_rate');

    });

    it.each([
        ['quantity', { quantity: undefined }],
        ['unit price', { unit_price: undefined }],
        ['GST', { gst_percent: undefined }],
        ['discount', { discount_percent: undefined }],
    ])('fails closed when %s is absent', (_label, override) => {
        expect(() => prepareItemForPurchaseOrder({ ...product, ...override })).toThrow(/authoritative source|explicit user entry/i);
    });

    it('requires explicit PO-line receipt quantities and tax facts for a GRN', () => {
        expect(() => prepareItemForGRN(product, { quantity: 2 })).toThrow(/received quantity/i);
        expect(prepareItemForGRN(product, {
            id: 'd3000000-0000-7000-8000-000000000002',
            quantity: 2, received_quantity: 2, rejected_quantity: 0,
            free_quantity: 0, unit_price: 100.25, discount_percent: 0, tax_percent: 12,
        })).toMatchObject({ quantity: 2, received_quantity: 2, rejected_quantity: 0 });
    });

    it('never normalizes a missing submission number to zero', () => {
        expect(() => cleanItemForBackend({
            product_id: product.product_id,
            product_name: product.product_name,
            quantity: 1,
            unit_price: undefined as any,
            discount_percent: 0,
            tax_percent: 12,
        })).toThrow(/unit price.*authoritative source/i);
    });
});
