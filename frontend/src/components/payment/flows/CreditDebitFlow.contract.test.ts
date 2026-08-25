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

it('requires the actor to select the reviewed GST rule', () => {
  expect(source).toContain("setRuleId('')");
  expect(source).toContain('Select reviewed GST rule');
  expect(source).not.toContain('setRuleId(next.rule_choices[0]');
});

it('requires an explicit-offset evidence time without browser timezone conversion', () => {
  expect(source).toContain('RFC 3339 with offset');
  expect(source).toContain('2026-08-25T10:00:00+05:30');
  expect(source).not.toContain('type="datetime-local"');
  expect(source).not.toContain('new Date(event.target.value).toISOString()');
});
