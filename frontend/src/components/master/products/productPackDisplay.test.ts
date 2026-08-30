import { productPackDisplay } from './productPackDisplay';

test.each([
  ['Medicine 500 MG 1*10', { name: 'Medicine 500 MG', pack: '1*10', importedHint: true }],
  ['Suture 2-0 1*12', { name: 'Suture 2-0', pack: '1*12', importedHint: true }],
  ['Device T 1*36 1*36', { name: 'Device T', pack: '1*36', importedHint: true }],
  ['3336 FILAMIDE(NYLON)2-0 1*1', { name: '3336 FILAMIDE(NYLON) 2-0', pack: '1*1', importedHint: true }],
  ['Product without pack', { name: 'Product without pack', pack: null, importedHint: false }],
])('separates an unambiguous imported pack suffix from %s', (name, expected) => {
  expect(productPackDisplay(name, null)).toEqual(expected);
});

test('prefers reviewed canonical packing without rewriting the product name', () => {
  expect(productPackDisplay('Reviewed product', '1 Strip = 10 Each')).toEqual({
    name: 'Reviewed product', pack: '1 Strip = 10 Each', importedHint: false,
  });
});
