import { readFileSync } from 'fs';
import { join } from 'path';

const source = (relativePath: string) => readFileSync(
  join(__dirname, '..', '..', relativePath),
  'utf8',
);

describe('active canonical desktop flows do not infer business choices', () => {
  it('requires explicit supplier-payment branch, bank, and method', () => {
    const payment = source('components/payment/entry/PaymentMade.tsx');
    expect(payment).toContain("useState<'upi' | 'bank_transfer' | ''>('')");
    expect(payment).toContain('Select payment method');
    expect(payment).not.toContain('next.bank_accounts[0]');
    expect(payment).not.toContain('selected?.open_items[0]');
  });

  it('requires explicit expense period, branch, and reimbursement account', () => {
    const expense = source('components/payment/flows/ExpenseClaimsFlow.tsx');
    expect(expense).toContain("setPeriodStart('')");
    expect(expense).toContain("setPeriodEnd('')");
    expect(expense).not.toContain('next[0].branch_id');
    expect(expense).not.toContain('reimbursement_accounts[0]');
  });

  it('does not silently select the only settlement account', () => {
    const receipt = source('components/payment/shared/PaymentFlowOptimized.tsx');
    expect(receipt).not.toContain('accounts[0].bank_account_id');
    expect(receipt).not.toContain('accounts[0].settlement_account_id');
  });

  it('requires an explicit server-offered bank match method', () => {
    const reconciliation = source('components/payment/flows/BankReconciliationFlow.tsx');
    expect(reconciliation).toContain('Select reviewed match method');
    expect(reconciliation).not.toContain('match_methods[0]');
    expect(reconciliation).not.toContain("|| 'manual'");
  });

  it('starts a goods receipt without inferred operational facts', () => {
    const receipt = source('components/purchase/grn/canonicalReceiptCommand.ts');
    expect(receipt).toContain("receivedAt: ''");
    expect(receipt).toContain('included: false');
    expect(receipt).toContain("qcStatus: ''");
    expect(receipt).not.toContain('line.mrp_conversions[0]');
    expect(receipt).not.toContain('line.eligible_locations[0]');
    expect(receipt).not.toContain('includeRemainingQuantities');
  });
});
