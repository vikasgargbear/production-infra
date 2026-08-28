import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'BankReconciliationFlow.tsx'), 'utf8');

it('selects authoritative exact candidates and uses the reviewed lifecycle', () => {
  expect(source).toContain('canonicalControlledOperationsApi.bankContext');
  expect(source).toContain("prepareCanonicalAction('finance.bank_reconciliation.prepare'");
  expect(source).toContain('getCanonicalCommandReview(commandId.trim())');
  expect(source).toContain("approveCanonicalAction('finance.bank_reconciliation.prepare'");
  expect(source).toContain("executeApprovedCanonicalAction('finance.bank_reconciliation.prepare'");
  expect(source).toContain('canonicalControlledOperationsApi.bankReadback');
  expect(source).toContain('compareExactDecimals');
  expect(source).toContain('data-testid="bank-reconciliation-review-command"');
  expect(source).toContain('{review.command_request_id}');
  expect(source).toContain('htmlFor="bank-reconciliation-candidate"');
  expect(source).toContain('id="bank-reconciliation-candidate"');
  expect(source).toContain('htmlFor="bank-reconciliation-match-method"');
  expect(source).toContain('id="bank-reconciliation-match-method"');
});

it('keeps statement import fail closed without compatibility writes', () => {
  expect(source).toContain('Statement import unavailable');
  expect(source).toContain('No “all reconciled” claim is made');
  expect(source).not.toContain('paymentsApi.startBankReconciliation');
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('indexedDB');
});

it('requires an explicit server-offered match method', () => {
  expect(source).toContain("useState<'' | 'manual' | 'reference_exact'>('')");
  expect(source).toContain('Select reviewed match method');
  expect(source).toContain('selected.match_methods.includes(matchMethod)');
  expect(source).not.toContain('match_methods[0]');
  expect(source).not.toContain("|| 'manual'");
});
