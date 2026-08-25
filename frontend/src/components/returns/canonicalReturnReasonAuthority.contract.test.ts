import fs from 'fs';
import path from 'path';

const read = (relativePath: string) => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

const sales = read('SalesReturnFlow.tsx');
const purchase = read('PurchaseReturnFlow.tsx');
const builder = read('utils/canonicalReturnCommand.ts');
const api = read('../../services/api/modules/returns/canonicalReturns.api.ts');

it('loads exact reason and GST-treatment choices from each invoice context', () => {
  for (const source of [sales, purchase]) {
    expect(source).toContain('context.return_reason_choices');
    expect(source).toContain('choice.reason_code === returnData.return_reason');
    expect(source).toContain('supported_gst_treatments');
    expect(source).not.toContain('metadataApi');
    expect(source).not.toContain('getReturnReasons');
  }
  expect(api).toContain('return_reason_choices: CanonicalReturnReasonChoice[]');
  expect(api.match(/^\s{2}supported_gst_treatments:/gm)).toHaveLength(1);
});

it('validates exact reason and treatment membership without a translation map', () => {
  expect(builder).toContain('candidate?.reason_code === reasonCode');
  expect(builder).toContain('choice.supported_gst_treatments.includes(treatment)');
  expect(builder).not.toContain('SALES_REASON_CODES');
  expect(builder).not.toContain('PURCHASE_REASON_CODES');
  expect(builder).not.toMatch(/DAMAGED:\s*['"]damage/);
  expect(builder).not.toMatch(/EXCESS_QUANTITY:\s*['"]excess_supply/);
});

it('invalidates invoice-bound authority when the return date changes', () => {
  for (const source of [sales, purchase]) {
    expect(source).toContain('return_reason_choices: []');
    expect(source).toContain("gst_tax_treatment: ''");
  }
  expect(sales).toContain("type: 'SET_SELECTED_INVOICE', invoice: null");
  expect(purchase).toContain('setSelectedInvoice(null)');
});
