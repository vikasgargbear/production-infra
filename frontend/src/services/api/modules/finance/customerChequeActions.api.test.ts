import {
  approveCustomerChequeAction,
  executeCustomerChequeAction,
  loadCustomerChequeReceiptSource,
  prepareCustomerChequeAction,
  reviewCustomerChequeAction,
} from './customerChequeActions.api';
import {
  approveCanonicalAction,
  executeApprovedCanonicalAction,
  getCanonicalCommandReview,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { paymentAllocationApi } from './paymentAllocation.api';

jest.mock('../../canonicalOperatorActions', () => ({
  approveCanonicalAction: jest.fn(),
  canonicalExecutionCompleted: (result: any) => result.status === 'executed',
  executeApprovedCanonicalAction: jest.fn(),
  getCanonicalCommandReview: jest.fn(),
  prepareCanonicalAction: jest.fn(),
}));
jest.mock('./paymentAllocation.api', () => ({ paymentAllocationApi: {
  getCustomerChequeActionReadback: jest.fn(),
  getCustomerReceiptReadback: jest.fn(),
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
    const review = {
      command_request_id: actionId,
      preview_hash: `sha256:${'b'.repeat(64)}`,
      capability_code: 'finance.customer_cheque_bounce.prepare',
      status: 'approved',
      approval_policy: 'separate_approver',
      target_resource_type: 'payment',
      target_resource_id: actionId,
    };
    (executeApprovedCanonicalAction as jest.Mock).mockResolvedValue({
      data: { status: 'executed', resource_id: actionId },
    });
    (paymentAllocationApi.getCustomerChequeActionReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: receiptId, payment_method: 'cheque', status: 'posted', amount: '168.00',
      allocation_reconciled: true, journal_balanced: true,
      terminal_actions: [{ action_payment_id: actionId, action: 'cheque_bounce',
        journal_debit_total: '168.00', journal_credit_total: '168.00' }],
    } });

    await expect(executeCustomerChequeAction('bounce', review as any, 'bounce:lifecycle'))
      .resolves.toBe(actionId);

    expect(executeApprovedCanonicalAction).toHaveBeenCalledWith(
      'finance.customer_cheque_bounce.prepare', review, 'bounce:lifecycle',
    );
    expect(paymentAllocationApi.getCustomerChequeActionReadback).toHaveBeenCalledWith(actionId);
  });

  it('resolves only one posted uncleared cheque receipt with its exact row version', async () => {
    (paymentAllocationApi.getCustomerReceiptReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: receiptId, branch_id: branchId, row_version: 3,
      payment_method: 'cheque', status: 'posted', evidence_attachment_id: evidenceId,
      terminal_actions: [],
    } });
    await expect(loadCustomerChequeReceiptSource(receiptId)).resolves.toEqual({
      payment_id: receiptId, branch_id: branchId, row_version: 3,
      payment_method: 'cheque', status: 'posted', evidence_attachment_id: evidenceId,
    });
    (paymentAllocationApi.getCustomerReceiptReadback as jest.Mock).mockResolvedValueOnce({ data: {
      payment_id: receiptId, branch_id: branchId, row_version: 3,
      payment_method: 'cheque', status: 'posted', terminal_actions: [{ action: 'cheque_bounce' }],
    } });
    await expect(loadCustomerChequeReceiptSource(receiptId)).rejects.toThrow(/not an uncleared canonical cheque/i);
  });

  it('loads and approves a cheque action without executing it as the reviewer', async () => {
    const review = {
      command_request_id: actionId,
      preview_hash: `sha256:${'c'.repeat(64)}`,
      capability_code: 'finance.customer_cheque_clearance.prepare',
      approval_policy: 'separate_approver',
      status: 'pending_approval',
    };
    (getCanonicalCommandReview as jest.Mock).mockResolvedValue({ data: review });
    await expect(reviewCustomerChequeAction(actionId)).resolves.toBe(review);
    await approveCustomerChequeAction(review as any, 'reviewer:lifecycle');
    expect(approveCanonicalAction).toHaveBeenCalledWith(
      'finance.customer_cheque_clearance.prepare', review, 'reviewer:lifecycle',
    );
    expect(executeApprovedCanonicalAction).not.toHaveBeenCalled();
  });
});
