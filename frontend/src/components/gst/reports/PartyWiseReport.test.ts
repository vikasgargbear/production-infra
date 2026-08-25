import { normalizeCanonicalPartyRows } from './PartyWiseReport';

jest.mock('../../global', () => ({ DataTable: () => null }));

const exactRow = {
  gst_number: '27ABCDE1234F1Z5',
  name: 'Canonical Buyer',
  invoices: 2,
  taxableValue: '168.00',
  cgst: '10.08',
  sgst: '10.08',
  igst: '0.00',
  totalTax: '20.16',
};

test('party GST consumes exact canonical GSTR-1 B2B facts', () => {
  expect(normalizeCanonicalPartyRows({ b2b: [exactRow] })).toEqual([{
    row_key: '27ABCDE1234F1Z5:Canonical Buyer',
    gst_number: '27ABCDE1234F1Z5',
    party_name: 'Canonical Buyer',
    invoice_count: 2,
    total_taxable_value: '168.00',
    total_cgst: '10.08',
    total_sgst: '10.08',
    total_igst: '0.00',
    total_tax: '20.16',
  }]);
});

test('party GST rejects missing identity and number coercion', () => {
  expect(() => normalizeCanonicalPartyRows({ b2b: [{ ...exactRow, name: '' }] })).toThrow('party name');
  expect(() => normalizeCanonicalPartyRows({ b2b: [{ ...exactRow, taxableValue: 168 }] })).toThrow(
    'must remain an exact decimal string',
  );
});
