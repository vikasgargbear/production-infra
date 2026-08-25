import { formatCurrency, formatNumber, formatPercentage } from './formatters';

test('missing or invalid business facts never render as numeric zero', () => {
  for (const missing of [null, undefined, '', 'not-a-number'] as const) {
    expect(formatCurrency(missing)).toBe('—');
    expect(formatNumber(missing)).toBe('—');
    expect(formatPercentage(missing)).toBe('—');
  }
});

test('an explicit canonical zero remains a visible zero', () => {
  expect(formatCurrency('0')).toBe('₹0.00');
  expect(formatNumber(0)).toBe('0');
  expect(formatPercentage('0')).toBe('0.00%');
});
