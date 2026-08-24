import { projectInvoiceLineToSalesReturn, updateSalesReturnItem } from './salesReturnProjection';

describe('sales return canonical projection', () => {
    it('uses canonical GST and keeps paid/free quantities coherent', () => {
        const item = projectInvoiceLineToSalesReturn({
            id: 'line-1',
            product_id: '10000000-0000-7000-8000-000000000001',
            product_name: 'Test Product',
            batch_id: '20000000-0000-7000-8000-000000000001',
            batch_number: 'B1',
            quantity: 2,
            free_quantity: 1,
            unit_price: 100,
            gst_percent: 12,
        });

        expect(item).toEqual(expect.objectContaining({
            paid_quantity: 2,
            free_quantity: 1,
            return_paid_qty: 2,
            return_free_qty: 1,
            return_quantity: 3,
            max_returnable_qty: 3,
            tax_percent: 12,
        }));

        const paidEdited = updateSalesReturnItem(item, 'return_paid_qty', 1);
        expect(paidEdited).toEqual(expect.objectContaining({
            return_paid_qty: 1,
            return_free_qty: 1,
            return_quantity: 2,
        }));
        expect(updateSalesReturnItem(paidEdited, 'return_free_qty', 0).return_quantity).toBe(1);
    });

    it('falls back to component GST rates only when canonical aggregate aliases are absent', () => {
        const item = projectInvoiceLineToSalesReturn({
            product_id: 'p', product_name: 'P', quantity: 1,
            cgst_rate: 6, sgst_rate: 6, igst_rate: 0,
        });
        expect(item.tax_percent).toBe(12);
    });
});
