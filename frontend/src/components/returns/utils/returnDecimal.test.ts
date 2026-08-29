import {
  formatReturnDisplayPercent,
  formatReturnDisplayQuantity,
  formatReturnDisplayRate,
} from './returnDecimal';

describe('return decimal presentation', () => {
  it('keeps exact command strings but presents no more than two decimals', () => {
    expect(formatReturnDisplayQuantity('6.500000', 'Quantity')).toBe('6.5');
    expect(formatReturnDisplayQuantity('1.234999', 'Quantity')).toBe('1.23');
    expect(formatReturnDisplayQuantity('1.235000', 'Quantity')).toBe('1.24');
    expect(formatReturnDisplayRate('125.500000', 'Rate')).toBe('₹125.50');
    expect(formatReturnDisplayPercent('12.000000', 'Tax')).toBe('12%');
  });
});
