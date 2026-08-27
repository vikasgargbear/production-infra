import { approveCustomerReceipt, getCustomerReceiptContext, prepareCustomerReceipt, reconcileCustomerReceipt } from './customerReceipts.api';
import { approveAndExecuteCanonicalAction, prepareCanonicalAction } from '../../canonicalOperatorActions';
import { paymentAllocationApi } from './paymentAllocation.api';
import { apiHelpers } from '../../apiClient';

jest.mock('../../canonicalOperatorActions', () => ({
  approveAndExecuteCanonicalAction: jest.fn(),
  canonicalExecutionCompleted: (result: any) => result.status === 'executed',
  prepareCanonicalAction: jest.fn(),
}));
jest.mock('./paymentAllocation.api', () => ({ paymentAllocationApi: {
  getInvoicePayments: jest.fn(), getCustomerReceiptReadback: jest.fn(),
} }));
jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

const paymentId = '0198ea37-2b30-7c8d-9123-123456789abc';
const openItemId = '0198ea37-2b31-7c8d-9123-123456789abc';
const invoiceId = '0198ea37-2b32-7c8d-9123-123456789abc';

describe('canonical receipt execution and reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads one canonical context for business date, methods, and settlement identities', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
      business_date: '2026-08-25', payment_methods: ['bank_transfer', 'card', 'upi'],
      settlement_accounts: [],
    } });
    await expect(getCustomerReceiptContext()).resolves.toEqual(expect.objectContaining({
      data: expect.objectContaining({ business_date: '2026-08-25' }),
    }));
    expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/customer-receipts/context');
  });

  const preparePayload = () => ({
    idempotency_key: 'receipt:1', branch_id: invoiceId, payment_date: '2026-08-25',
    customer_account_id: invoiceId, bank_account_id: invoiceId,
    payment_method: 'upi' as const, receipt_purpose: 'invoice_settlement' as const,
    evidence_attachment_id: invoiceId, amount: '168.00',
    allocations: [{ open_item_id: openItemId, amount: '168.00' }], external_reference: 'UPI-1',
  });

  it('accepts only a server preview that exactly matches the requested receipt and allocations', async () => {
    const preview = {
      command_request_id: invoiceId, preview_hash: `sha256:${'a'.repeat(64)}`, branch_id: invoiceId,
      financial_impact: [{
        receipt_amount: '168.00', settlement_account_id: paymentId,
        allocations: [{ open_item_id: openItemId, allocated_amount: '168.00', residual_after: '0.00' }],
      }],
    };
    (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: preview });
    await expect(prepareCustomerReceipt(preparePayload())).resolves.toEqual({ data: preview });

    (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: {
      ...preview,
      financial_impact: [{ ...preview.financial_impact[0], receipt_amount: '167.99' }],
    } });
    await expect(prepareCustomerReceipt(preparePayload())).rejects.toThrow('does not match');
    expect(approveAndExecuteCanonicalAction).not.toHaveBeenCalled();
  });

  it('returns success only after exact canonical invoice allocation readback', async () => {
    (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({ executed: { data: { status: 'executed', resource_id: paymentId } } });
    (paymentAllocationApi.getInvoicePayments as jest.Mock).mockResolvedValue({ data: {
      invoice: { due_amount: '0.00', payment_status: 'paid' },
      payments: [{ payment_id: paymentId, payment_number: 'RCPT-4', allocated_amount: '168.00' }],
    } });
    (paymentAllocationApi.getCustomerReceiptReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: paymentId, payment_number: 'RCPT-4', status: 'posted', amount: '168.00',
      payment_purpose: 'commercial_settlement',
      allocation_reconciled: true, journal_balanced: true,
      allocations: [{ open_item_id: openItemId, amount: '168.00' }],
    } });
    await expect(approveCustomerReceipt({ command_request_id: invoiceId, preview_hash: `sha256:${'a'.repeat(64)}` }, 'receipt-lifecycle')).resolves.toEqual({ payment_id: paymentId });
    expect(approveAndExecuteCanonicalAction).toHaveBeenCalledWith('finance.customer_receipt.prepare', expect.any(Object), 'receipt-lifecycle');
    const result = await reconcileCustomerReceipt(paymentId, {
      idempotency_key: 'receipt:1', branch_id: invoiceId, payment_date: '2026-08-25',
      customer_account_id: invoiceId, bank_account_id: invoiceId,
      payment_method: 'upi', receipt_purpose: 'invoice_settlement', evidence_attachment_id: invoiceId,
      amount: '168.00', allocations: [{ open_item_id: openItemId, amount: '168.00' }], external_reference: 'UPI-1',
    }, new Map([[openItemId, { invoice_id: invoiceId, due: '168.00' }]]));
    expect(result).toEqual({ payment_id: paymentId, payment_number: 'RCPT-4' });
  });

  it('fails closed after execution when readback does not reconcile', async () => {
    (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({ executed: { data: { status: 'executed', resource_id: paymentId } } });
    (paymentAllocationApi.getInvoicePayments as jest.Mock).mockResolvedValue({ data: {
      invoice: { due_amount: '168.00' }, payments: [],
    } });
    (paymentAllocationApi.getCustomerReceiptReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: paymentId, payment_number: 'RCPT-4', status: 'posted', amount: '168.00',
      payment_purpose: 'commercial_settlement',
      allocation_reconciled: true, journal_balanced: true,
      allocations: [{ open_item_id: openItemId, amount: '168.00' }],
    } });
    await expect(reconcileCustomerReceipt(paymentId, {
      idempotency_key: 'receipt:1', branch_id: invoiceId, payment_date: '2026-08-25',
      customer_account_id: invoiceId, bank_account_id: invoiceId,
      payment_method: 'upi', receipt_purpose: 'invoice_settlement', evidence_attachment_id: invoiceId,
      amount: '168.00', allocations: [{ open_item_id: openItemId, amount: '168.00' }], external_reference: 'UPI-1',
    }, new Map([[openItemId, { invoice_id: invoiceId, due: '168.00' }]]))).rejects.toThrow('Do not retry blindly');
    expect(approveAndExecuteCanonicalAction).not.toHaveBeenCalled();
  });
});
