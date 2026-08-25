import fs from 'fs';
import path from 'path';
import { updateSalesReturnItem } from './salesReturnProjection';

const line = (overrides: Record<string, unknown> = {}) => ({
    product_id: '10000000-0000-7000-8000-000000000001',
    product_name: 'Test Product',
    batch_number: 'B1',
    quantity: '3.000000',
    paid_quantity: '2.000000',
    free_quantity: '1.000000',
    return_paid_qty: '',
    return_free_qty: '',
    return_quantity: '',
    max_returnable_qty: '3.000000',
    unit_price: '100.000000',
    discount_percent: '',
    tax_percent: '12.000000',
    selected: false,
    ...overrides,
} as any);

describe('sales return quantity projection', () => {
    it('does not infer the missing side of a billed/free split', () => {
        const paidOnly = updateSalesReturnItem(line(), 'return_paid_qty', '1');
        expect(paidOnly.return_paid_qty).toBe('1');
        expect(paidOnly.return_free_qty).toBe('');
        expect(paidOnly.return_quantity).toBe('');

        const complete = updateSalesReturnItem(paidOnly, 'return_free_qty', '0');
        expect(complete.return_free_qty).toBe('0');
        expect(complete.return_quantity).toBe('1.000000');
    });

    it('preserves explicit fractional and zero inputs exactly', () => {
        const paid = updateSalesReturnItem(line(), 'return_paid_qty', '0.123456');
        const complete = updateSalesReturnItem(paid, 'return_free_qty', '0.000001');
        expect(complete.return_paid_qty).toBe('0.123456');
        expect(complete.return_free_qty).toBe('0.000001');
        expect(complete.return_quantity).toBe('0.123457');
    });

    it('clears the derived quantity when either explicit input is malformed', () => {
        const complete = line({ return_paid_qty: '1', return_free_qty: '0', return_quantity: '1.000000' });
        expect(updateSalesReturnItem(complete, 'return_free_qty', 'not-a-number').return_quantity).toBe('');
    });

    it('contains no legacy mapper that auto-selects or guesses a disposition', () => {
        const source = fs.readFileSync(path.resolve(__dirname, './salesReturnProjection.ts'), 'utf8');
        expect(source).not.toContain('projectInvoiceLineToSalesReturn');
        expect(source).not.toContain("disposition: 'RESTOCK'");
        expect(source).not.toContain('selected: true');
    });
});
