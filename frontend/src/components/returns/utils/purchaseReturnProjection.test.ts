import { readFileSync } from 'fs';
import { updatePurchaseReturnItem } from './purchaseReturnProjection';

describe('purchase return lineage projection', () => {
  const line = {
    id: 'd3000000-0000-7000-8000-000000000001',
    return_paid_qty: '',
    return_free_qty: '',
    return_quantity: '',
  };

  it('keeps billed and free quantities separate and reconciles only explicit values', () => {
    const billedOnly = updatePurchaseReturnItem([line], 0, 'return_paid_qty', '0.123456');
    expect(billedOnly[0]).toMatchObject({ return_paid_qty: '0.123456', return_quantity: '' });

    const complete = updatePurchaseReturnItem(billedOnly, 0, 'return_free_qty', '0.876544');
    expect(complete[0]).toMatchObject({
      return_paid_qty: '0.123456',
      return_free_qty: '0.876544',
      return_quantity: '1.000000',
    });
  });

  it('preserves invalid edits and clears derived total so prepare fails closed', () => {
    const complete = { ...line, return_paid_qty: '1', return_free_qty: '0', return_quantity: '1.000000' };
    const invalid = updatePurchaseReturnItem([complete], 0, 'return_paid_qty', '1e3');
    expect(invalid[0]).toMatchObject({ return_paid_qty: '1e3', return_quantity: '' });
  });

  it('contains no manual return constructor or guessed quantity/rate/tax facts', () => {
    const source = readFileSync(__filename.replace(/\.test\.ts$/, '.ts'), 'utf8');
    expect(source).not.toContain('manualPurchaseReturnItem');
    expect(source).not.toMatch(/\?\?\s*['"]0['"]/);
    expect(source).not.toMatch(/return_quantity\s*:\s*['"]1/);
  });
});
