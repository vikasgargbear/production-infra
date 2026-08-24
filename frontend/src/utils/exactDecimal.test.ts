import {
  addExactDecimals,
  compareExactDecimals,
  exactDecimalString,
  exactDecimalUnits,
  normalizeExactDecimal,
} from './exactDecimal';

const money = { scale: 2, maximumWholeDigits: 18 } as const;
const quantity = { scale: 6, maximumWholeDigits: 14 } as const;

describe('exact decimal arithmetic', () => {
  it('preserves values beyond JavaScript safe integers', () => {
    const units = exactDecimalUnits('9007199254740993.01', 'Money', money);
    expect(units).toBe(900719925474099301n);
    expect(exactDecimalString(units, 2)).toBe('9007199254740993.01');
  });

  it('adds and compares fractional values without binary drift', () => {
    expect(addExactDecimals(['0.10', '0.20'], 'Money', money)).toBe('0.30');
    expect(addExactDecimals(['0.123456', '0.000001'], 'Quantity', quantity)).toBe('0.123457');
    expect(compareExactDecimals('0.300000', '0.3', 'Quantity', quantity)).toBe(0);
    expect(normalizeExactDecimal('2.12', 'Quantity', quantity)).toBe('2.120000');
  });

  it.each(['1e3', '1,000', '', 'not-a-decimal'])('rejects malformed %s', value => {
    expect(() => exactDecimalUnits(value, 'Quantity', quantity)).toThrow(/plain decimal string/);
  });

  it('rejects excess scale and inexact JavaScript numbers', () => {
    expect(() => exactDecimalUnits('0.1234567', 'Quantity', quantity)).toThrow(/precision/);
    expect(() => exactDecimalUnits(0.1, 'Money', money)).toThrow(/exact decimal string/);
    expect(() => exactDecimalUnits(Number.MAX_SAFE_INTEGER + 1, 'Money', money))
      .toThrow(/exact decimal string/);
  });
});
