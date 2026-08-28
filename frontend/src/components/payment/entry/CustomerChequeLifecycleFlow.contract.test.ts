import fs from 'fs';
import path from 'path';

const read = (name: string) => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('customer cheque visible lifecycle', () => {
  it('keeps source resolution, distinct approval, requester execution, and readback visible', () => {
    const flow = read('CustomerChequeLifecycleFlow.tsx');
    const api = fs.readFileSync(path.join(
      __dirname,
      '../../../services/api/modules/finance/customerChequeActions.api.ts',
    ), 'utf8');
    const hub = fs.readFileSync(path.join(__dirname, '../FinancialHub.tsx'), 'utf8');

    expect(hub).toContain("id: 'cheque-actions'");
    expect(flow).toContain('Exact posted cheque receipt UUID');
    expect(flow).toContain('Resolve exact cheque receipt');
    expect(flow).toContain('Prepare terminal action');
    expect(flow).toContain('Approve as distinct reviewer');
    expect(flow).toContain('Execute as requester');
    expect(flow).toContain('canonical-posted-resource-id');
    expect(flow).toContain('sourceResolutionSequence');
    expect(flow).toContain('reviewResolutionSequence');
    expect(api).toContain('getCustomerReceiptReadback(paymentId)');
    expect(api).toContain("review.approval_policy !== 'separate_approver'");
    expect(api).toContain('getCustomerChequeActionReadback(paymentId)');
    expect(api).not.toContain('approveAndExecuteCanonicalAction');
  });
});
