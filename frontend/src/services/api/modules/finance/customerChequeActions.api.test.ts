import {
  executeCustomerChequeAction,
  prepareCustomerChequeAction,
} from './customerChequeActions.api';
import {
  approveAndExecuteCanonicalAction,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { paymentAllocationApi } from './paymentAllocation.api';

jest.mock('../../canonicalOperatorActions', () => ({
  approveAndExecuteCanonicalAction: jest.fn(),
  canonicalExecutionCompleted: (result: any) => result.status === 'executed',
  prepareCanonicalAction: jest.fn(),
}));
jest.mock('./paymentAllocation.api', () => ({ paymentAllocationApi: {
  getCustomerChequeActionReadback: jest.fn(),
} }));

const branchId = '0198ea37-2b30-7c8d-9123-123456789abc';
const receiptId = '0198ea37-2b31-7c8d-9123-123456789abc';
const actionId = '0198ea37-2b32-7c8d-9123-123456789abc';
const evidenceId = '0198ea37-2b33-7c8d-9123-123456789abc';
const bankId = '0198ea37-2b34-7c8d-9123-123456789abc';

describe('customer cheque terminal action adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prepares clearance only with the selected canonical bank and exact receipt version', async () => {
    (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: {
      operation: 'finance.customer_cheque_clearance.post',
      command_request_id: actionId,
      preview_hash: `sha256:${'a'.repeat(64)}`,
      branch_id: branchId,
      target_resource_type: 'payment',
      target_resource_id: actionId,
    } });

    await prepareCustomerChequeAction('clearance', {
      branch_id: branchId,
      original_payment_id: receiptId,
      original_payment_row_version: 3,
      action_date: '2026-08-27',
      evidence_attachment_id: evidenceId,
      bank_account_id: bankId,
      clearance_reference: ' CLR-900 ',
    }, 'clearance:one');

    expect(prepareCanonicalAction).toHaveBeenCalledWith(
      'finance.customer_cheque_clearance.prepare',
      expect.objectContaining({
        original_payment_id: receiptId,
        original_payment_row_version: '3',
        bank_account_id: bankId,
        clearance_reference: 'CLR-900',
      }),
    );
  });

  it('keeps bounce bank-free and returns the exact compensating payment readback identity', async () => {
    const preview = {
      operation: 'finance.customer_cheque_bounce.post',
      command_request_id: actionId,
      preview_hash: `sha256:${'b'.repeat(64)}`,
      branch_id: branchId,
      target_resource_type: 'payment',
      target_resource_id: actionId,
    };
    (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: preview });
    (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({ executed: {
      data: { status: 'executed', resource_id: actionId },
    } });
    (paymentAllocationApi.getCustomerChequeActionReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: receiptId, payment_method: 'cheque', status: 'posted', amount: '168.00',
      allocation_reconciled: true, journal_balanced: true,
      terminal_actions: [{ action_payment_id: actionId, action: 'cheque_bounce',
        journal_debit_total: '168.00', journal_credit_total: '168.00' }],
    } });

    const prepared = await prepareCustomerChequeAction('bounce', {
      branch_id: branchId,
      original_payment_id: receiptId,
      original_payment_row_version: 3,
      action_date: '2026-08-27',
      evidence_attachment_id: evidenceId,
      reason_code: 'funds_insufficient',
    }, 'bounce:one');
    await expect(executeCustomerChequeAction('bounce', prepared, 'bounce:lifecycle'))
      .resolves.toBe(actionId);

    const payload = (prepareCanonicalAction as jest.Mock).mock.calls[0][1];
    expect(payload).toEqual(expect.objectContaining({
      original_payment_id: receiptId,
      reason_code: 'funds_insufficient',
    }));
    expect(payload).not.toHaveProperty('bank_account_id');
    expect(approveAndExecuteCanonicalAction).toHaveBeenCalledWith(
      'finance.customer_cheque_bounce.prepare', preview, 'bounce:lifecycle',
    );
    expect(paymentAllocationApi.getCustomerChequeActionReadback).toHaveBeenCalledWith(actionId);
  });
});
