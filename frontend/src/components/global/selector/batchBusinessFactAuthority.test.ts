import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../../../');

test('batch selection uses backend facts and no invented invoice configuration', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/global/selector/BatchSelector.tsx'), 'utf8');
  expect(source).not.toContain('Date.now()');
  expect(source).not.toContain("quantity_available, '10'");
  expect(source).not.toContain("product_type || 'medicine'");
  expect(source).not.toContain('INVOICE_CONFIG');
  expect(source).toContain('batch.days_to_expiry');
  expect(fs.existsSync(path.join(root, 'frontend/src/config/invoice.config.ts'))).toBe(false);
});
