import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'CreditDebitFlow.tsx'), 'utf8');

it('uses one canonical maker-checker-execute lifecycle for standalone notes', () => {
  expect(source).toContain('canonicalDocumentHistoryApi.get');
  expect(source).toContain('canonicalAdjustmentNotesApi.getContext');
  expect(source).toContain('prepareAdjustmentNote');
  expect(source).toContain('getCanonicalCommandReview');
  expect(source).toContain('approveCanonicalAction');
  expect(source).toContain('getCanonicalCommandStatus');
  expect(source).toContain('executeApprovedAdjustmentNote');
  expect(source).toContain('reconcileAdjustmentNote');
  expect(source).toContain('Independent checker approval');
});

it('does not retain or submit adjustment notes through a legacy/offline fallback', () => {
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('sessionStorage');
  expect(source).not.toContain('indexedDB');
  expect(source).not.toContain('offline');
  expect(source).not.toMatch(/notesApi\.|createCreditNote|createDebitNote/);
  expect(source).not.toMatch(/toast\.success/);
});
