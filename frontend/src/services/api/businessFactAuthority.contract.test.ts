import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../..');
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('live reports and documents never present invented business facts', () => {
  const financialReport = read('frontend/src/components/reports/FinancialReport.tsx');
  const customerAnalytics = read('frontend/src/components/reports/CustomerAnalytics.tsx');
  const invoicePdf = read('frontend/src/utils/invoicePdfGenerator.ts');
  const orderReview = read('frontend/src/components/sales/order/steps/OrderReviewStep.tsx');

  [
    '₹3,60,000', '₹4,20,000', '₹3,21,450', '₹1,87,650',
    'Healthy cash generation', '32 days',
  ].forEach(value => expect(financialReport).not.toContain(value));
  expect(customerAnalytics).not.toContain('<p className="text-xl font-bold">87%</p>');
  expect(invoicePdf).not.toMatch(/Interest\s*@\s*36%/);
  expect(orderReview).not.toMatch(/Interest\s*@\s*18%/);

  expect(financialReport).toContain('canonical reporting API');
  expect(customerAnalytics).toContain('Not published by the canonical API');
});

test('retired browser spreadsheet parsers cannot invent product master facts', () => {
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/components/global/upload/BulkProductUpload.tsx',
  ))).toBe(false);
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/components/purchase/BulkUploadInline.tsx',
  ))).toBe(false);

  const packageJson = JSON.parse(read('frontend/package.json'));
  expect(packageJson.dependencies?.xlsx).toBeUndefined();
  expect(read('frontend/src/components/purchase/purchase-entry/PurchaseEntryFlow.tsx'))
    .not.toContain('BulkUploadInline');
});
