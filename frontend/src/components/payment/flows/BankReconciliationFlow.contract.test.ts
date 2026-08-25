import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, 'BankReconciliationFlow.tsx'), 'utf8');

it('uses canonical organization date and exact decimal money without demo reconciliation identities', () => {
  expect(source).toContain('useCanonicalBusinessDate');
  expect(source).toContain('normalizeAuthoritativeDecimal');
  expect(source).toContain('exactDecimalUnits');
  expect(source).not.toContain("new Date().toISOString().split('T')[0]");
  expect(source).not.toContain('Date.now()');
  expect(source).not.toMatch(/REC-\$\{/);
});

it('fails closed until the canonical candidate projection exists', () => {
  expect(source).toContain('Start Reconciliation (Unavailable)');
  expect(source).toContain('disabled: true');
  expect(source).toContain('No “all reconciled” claim is made');
  expect(source).not.toContain('paymentsApi.startBankReconciliation');
  expect(source).not.toContain('localStorage');
  expect(source).not.toContain('indexedDB');
});
