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
});

it('keeps statement import fail closed without compatibility writes', () => {
  expect(source).toContain('Statement import unavailable');
  expect(source).toContain('No “all reconciled” claim is made');
  expect(source).not.toContain('paymentsApi.startBankReconciliation');
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('indexedDB');
});
