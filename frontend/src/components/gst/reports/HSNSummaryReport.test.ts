import { normalizeHsnSummary } from './HSNSummaryReport';

jest.mock('../../global', () => ({ DataTable: () => null }));

describe('canonical HSN report projection', () => {
  it('maps the complete canonical decimal contract to UI numbers', () => {
    expect(normalizeHsnSummary([{
      hsn_code: '3004',
      description: 'Medicine',
      quantity: '2.000000',
      taxable_value: '100.00',
      tax_rate: '12.00',
      tax_amount: '12.00',
    }])).toEqual([{
      hsn_code: '3004',
      description: 'Medicine',
      quantity: 2,
      taxable_value: 100,
      tax_rate: 12,
      tax_amount: 12,
    }]);
  });

  it('rejects malformed rows instead of turning missing financial data into zero', () => {
    expect(() => normalizeHsnSummary([{ hsn_code: 'N/A' }])).toThrow(
      'HSN row 1 is missing identity fields',
    );
  });
});
