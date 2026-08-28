import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../../../..');
const source = fs.readFileSync(
  path.join(root, 'frontend/src/components/payment/flows/FinancialJournalFlow.tsx'),
  'utf8',
);

test('unsupported general journal fails closed without browser business facts', () => {
  expect(source).toContain('authoritative canonical command');
  expect(source).toContain('exact journal readback');
  expect(source).not.toContain('journalApi');
  expect(source).not.toContain('Date.now()');
  expect(source).not.toContain('<input');
  expect(source).not.toContain('onSaveDraft={() => { }}');
  expect(fs.existsSync(path.join(
    root,
    'frontend/src/services/api/modules/finance/journal.api.ts',
  ))).toBe(false);
});
