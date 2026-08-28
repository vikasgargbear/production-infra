import {
  notationFromPackConversions,
  packConversionsFromNotation,
  parsePackNotation,
  parseSingleStrength,
} from './packNotation';

test.each(['1*10', '1x10', '1×10'])('parses familiar single-strip notation %s', notation => {
  expect(parsePackNotation(notation)).toEqual({ packsPerOuter: 1, baseUnitsPerPack: 10, unitSuffix: undefined });
});

test('turns 10*10 into exact strip and box conversions', () => {
  const parsed = parsePackNotation('10*10');
  expect(parsed && packConversionsFromNotation(parsed, 'STRIP', 'BX')).toEqual([
    { uom_code: 'STRIP', multiplier: '10' },
    { uom_code: 'BX', multiplier: '100' },
  ]);
  expect(notationFromPackConversions([
    { uom_code: 'STRIP', multiplier: '10' },
    { uom_code: 'BX', multiplier: '100' },
  ], 'STRIP', 'BX')).toBe('10*10');
});

test('supports liquid notation without replacing the selected canonical unit', () => {
  const parsed = parsePackNotation('1*100 ml');
  expect(parsed).toEqual({ packsPerOuter: 1, baseUnitsPerPack: 100, unitSuffix: 'ML' });
  expect(parsed && packConversionsFromNotation(parsed, 'BTL', 'BX')).toEqual([
    { uom_code: 'BTL', multiplier: '100' },
  ]);
});

test.each(['', 'abc', '1*', '0*10', '1*0', '1*2*3'])("rejects invalid notation '%s'", notation => {
  expect(parsePackNotation(notation)).toBeNull();
});

test('auto-fills only an unambiguous typed strength', () => {
  const units = [
    { code: 'EA', symbol: 'ea', name: 'Each' },
    { code: 'MG', symbol: 'mg', name: 'Milligram' },
    { code: 'ML', symbol: 'mL', name: 'Millilitre' },
  ];
  expect(parseSingleStrength('250 mg / 5 ml', 'EA', units)).toEqual({
    strengthValue: '250', strengthUnitCode: 'MG', basisQuantity: '5', basisUnitCode: 'ML',
  });
  expect(parseSingleStrength('500 mg', 'EA', units)).toEqual({
    strengthValue: '500', strengthUnitCode: 'MG', basisQuantity: '1', basisUnitCode: 'EA',
  });
  expect(parseSingleStrength('500 mg + 125 mg', 'EA', units)).toBeNull();
});
