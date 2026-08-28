import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('GST desktop reports never substitute local documents or literal policy facts', () => {
  const gstr1 = read('frontend/src/components/gst/reports/GSTR1Report.tsx');
  const gstr2b = read('frontend/src/components/gst/reports/GSTR2BReport.tsx');
  const party = read('frontend/src/components/gst/reports/PartyWiseReport.tsx');
  const hsn = read('frontend/src/components/gst/reports/HSNSummaryReport.tsx');
  const api = read('frontend/src/services/api/modules/compliance/gst.api.ts');
  const taxAnalytics = read('frontend/src/components/reports/TaxAnalytics.tsx');

  expect(gstr1).not.toContain('₹2.5L');
  expect(gstr1).toContain('per reporting rule');
  expect(gstr2b).toContain('Local purchase invoices are not shown as a substitute');
  expect(gstr2b).not.toContain('purchasesApi');
  expect(gstr2b).not.toContain('gstr2a');
  expect(party).toContain('gstApi.reports.gstr1');
  expect(party).toContain('normalizeAuthoritativeDecimal');
  expect(party).not.toContain('Unknown Party');
  expect(hsn).toContain('Current product-master values are not shown as a substitute');
  expect(hsn).not.toContain('gstApi');
  expect(api).not.toContain('gstr2a:');
  expect(api).not.toContain('hsnSummary:');
  expect(api).not.toContain('getMetrics');
  expect(api).not.toContain('creditDebitNotes');
  expect(api).not.toContain('getTaxAmount');
  expect(api).not.toContain('reconciliation:');
  expect(taxAnalytics).toContain('Tax analytics unavailable');
  expect(taxAnalytics).toContain('Draft document totals');
  expect(taxAnalytics).not.toContain('/tax-entries/analytics/summary');
  expect(taxAnalytics).not.toContain('/tax-entries/gstr1/summary');
});

test('dead browser GST reconstructions and invented collection source stay deleted', () => {
  [
    'frontend/src/components/gst/utils/gstTransforms.ts',
    'frontend/src/components/gst/hooks/useGSTData.ts',
    'backend/app/api/routes/reports/collection.py',
    'backend/app/api/routes/compliance/gst.py',
    'backend/app/api/routes/compliance/gstr2b.py',
    'backend/app/api/routes/compliance/compliance.py',
    'frontend/src/services/api/modules/compliance/compliance.api.ts',
  ].forEach(relative => expect(fs.existsSync(path.join(root, relative))).toBe(false));
});
