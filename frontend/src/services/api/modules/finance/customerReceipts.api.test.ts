import { approveCustomerReceipt, getCustomerReceiptContext, prepareCustomerReceipt, reconcileCustomerReceipt, uploadCustomerReceiptEvidence } from './customerReceipts.api';
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
jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn(), post: jest.fn() } }));

const paymentId = '0198ea37-2b30-7c8d-9123-123456789abc';
const openItemId = '0198ea37-2b31-7c8d-9123-123456789abc';
const invoiceId = '0198ea37-2b32-7c8d-9123-123456789abc';

describe('canonical receipt execution and reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads one canonical context for business date, methods, and settlement identities', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
      business_date: '2026-08-25', payment_methods: ['bank_transfer', 'card', 'upi'],
      settlement_accounts: [], evidence: [], approved_goods_orders: [],
    } });
    await expect(getCustomerReceiptContext()).resolves.toEqual(expect.objectContaining({
      data: expect.objectContaining({ business_date: '2026-08-25' }),
    }));
    expect(apiHelpers.get).toHaveBeenCalledWith(
      '/canonical/customer-receipts/context', { preserveExactDecimals: true },
    );
  });

  it('loads customer-specific approved orders and uploads branch-bound PDF evidence', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
      business_date: '2026-08-25', payment_methods: ['upi'], settlement_accounts: [],
      evidence: [], approved_goods_orders: [],
    } });
    await getCustomerReceiptContext(invoiceId);
    expect(apiHelpers.get).toHaveBeenCalledWith(
      `/canonical/customer-receipts/context?customer_account_id=${invoiceId}`,
      { preserveExactDecimals: true },
    );
    (apiHelpers.post as jest.Mock).mockResolvedValue({ data: { attachment_id: openItemId } });
    const file = new File(['%PDF-1.7\nreceipt'], 'receipt.pdf', { type: 'application/pdf' });
    await uploadCustomerReceiptEvidence(invoiceId, '2026-08-25', file);
    expect((apiHelpers.post as jest.Mock).mock.calls[0][0]).toBe('/web/evidence/customer-receipts');
    const form = (apiHelpers.post as jest.Mock).mock.calls[0][1] as FormData;
    expect(form.get('branch_id')).toBe(invoiceId);
    expect(form.get('document_date')).toBe('2026-08-25');
    expect((form.get('file') as File).name).toBe('receipt.pdf');
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
      payment_id: paymentId, payment_number: 'RCPT-4', row_version: 3, status: 'posted', amount: '168.00',
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
    expect(result).toEqual({ payment_id: paymentId, payment_number: 'RCPT-4', row_version: 3 });
  });

  it('fails closed after execution when readback does not reconcile', async () => {
    (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({ executed: { data: { status: 'executed', resource_id: paymentId } } });
    (paymentAllocationApi.getInvoicePayments as jest.Mock).mockResolvedValue({ data: {
      invoice: { due_amount: '168.00' }, payments: [],
    } });
    (paymentAllocationApi.getCustomerReceiptReadback as jest.Mock).mockResolvedValue({ data: {
      payment_id: paymentId, payment_number: 'RCPT-4', row_version: 3, status: 'posted', amount: '168.00',
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
