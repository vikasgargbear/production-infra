import {
  allocateReceiptByMethod,
  buildCustomerReceiptPreparePayload,
  moneyToCents,
  receiptEscapeAction,
} from './customerReceiptCommand';

const customerId = '0198ea37-2b1d-7c8d-9123-123456789abc';
const branchId = '0198ea37-2b1e-7c8d-9123-123456789abc';
const bankId = '0198ea37-2b20-7c8d-9123-123456789abc';
const settlementId = '0198ea37-2b21-7c8d-9123-123456789abc';
const invoiceA = {
  invoice_id: '0198ea37-2b22-7c8d-9123-123456789abc',
  open_item_id: '0198ea37-2b23-7c8d-9123-123456789abc',
  branch_id: branchId,
  invoice_number: 'DEMO-SI-000004',
  invoice_date: '2026-08-20',
  amount_due: '168.00',
};

describe('canonical customer receipt command', () => {
  it('uses exact cents for FIFO and emits only open-item allocation identities', () => {
    const allocations = allocateReceiptByMethod('168.00', [invoiceA], 'fifo');
    expect(allocations).toEqual([{ invoice_id: invoiceA.invoice_id, invoice_number: invoiceA.invoice_number, amount: '168.00' }]);
    expect(buildCustomerReceiptPreparePayload({
      customer_account_id: customerId,
      payment_date: '2026-08-25',
      payment_mode: 'UPI',
      amount: '168.00',
      reference_number: ' UPI-E2E-168 ',
      bank_account_id: bankId,
      settlement_account_id: settlementId,
      allocation_method: 'fifo',
      allocations,
    }, [invoiceA], 'erp-web-customer-receipt-prepare:0198ea37-2b1f-7c8d-9123-123456789abc')).toEqual({
      idempotency_key: 'erp-web-customer-receipt-prepare:0198ea37-2b1f-7c8d-9123-123456789abc',
      branch_id: branchId,
      payment_date: '2026-08-25',
      customer_account_id: customerId,
      settlement_account_id: settlementId,
      bank_account_id: bankId,
      payment_method: 'upi',
      amount: '168.00',
      allocations: [{ open_item_id: invoiceA.open_item_id, amount: '168.00' }],
      external_reference: 'UPI-E2E-168',
    });
  });

  it('apportions decimal amounts without float drift', () => {
    const second = { ...invoiceA, invoice_id: '0198ea37-2b24-7c8d-9123-123456789abc', open_item_id: '0198ea37-2b25-7c8d-9123-123456789abc', invoice_number: 'B', invoice_date: '2026-08-21', amount_due: '0.20' };
    expect(allocateReceiptByMethod('0.30', [{ ...invoiceA, amount_due: '0.10' }, second], 'fifo').map(row => row.amount)).toEqual(['0.10', '0.20']);
    expect(moneyToCents('0.30')).toBe(30n);
  });

  it('allocates amounts beyond JavaScript safe integers without rounding', () => {
    const large = { ...invoiceA, amount_due: '9007199254740993.01' };
    expect(allocateReceiptByMethod('9007199254740993.01', [large], 'fifo'))
      .toEqual([{ invoice_id: invoiceA.invoice_id, invoice_number: invoiceA.invoice_number, amount: '9007199254740993.01' }]);
    expect(moneyToCents('9007199254740993.01')).toBe(900719925474099301n);
    expect(() => moneyToCents(9007199254740993)).toThrow('exact decimal string');
  });

  it.each(['CASH', 'CHEQUE', 'SPLIT'])('fails closed for unsupported %s receipts', payment_mode => {
    expect(() => buildCustomerReceiptPreparePayload({
      customer_account_id: customerId, payment_date: '2026-08-25', payment_mode,
      amount: '168.00', reference_number: 'REF', bank_account_id: bankId,
      settlement_account_id: settlementId, allocation_method: 'fifo',
      allocations: [{ invoice_id: invoiceA.invoice_id, invoice_number: invoiceA.invoice_number, amount: '168.00' }],
    }, [invoiceA], 'receipt:test')).toThrow('supports UPI, Card, or Bank Transfer');
  });

  it('rejects advance, unallocated residue, missing lineage, and overprecision', () => {
    const base = {
      customer_account_id: customerId, payment_date: '2026-08-25', payment_mode: 'UPI',
      amount: '168.00', reference_number: 'REF', bank_account_id: bankId,
      settlement_account_id: settlementId, allocation_method: 'fifo',
      allocations: [{ invoice_id: invoiceA.invoice_id, invoice_number: invoiceA.invoice_number, amount: '168.00' }],
    };
    expect(() => buildCustomerReceiptPreparePayload({ ...base, allocation_method: 'advance', allocations: [] }, [invoiceA], 'receipt:test')).toThrow('advance posting is unavailable');
    expect(() => buildCustomerReceiptPreparePayload({ ...base, amount: '169.00' }, [invoiceA], 'receipt:test')).toThrow('exactly equal');
    expect(() => buildCustomerReceiptPreparePayload(base, [{ ...invoiceA, open_item_id: undefined }], 'receipt:test')).toThrow('lacks canonical allocation evidence');
    expect(() => buildCustomerReceiptPreparePayload({ ...base, amount: '168.001' }, [invoiceA], 'receipt:test')).toThrow('at most two decimal places');
    expect(() => buildCustomerReceiptPreparePayload({ ...base, amount: '1e2' }, [invoiceA], 'receipt:test')).toThrow('at most two decimal places');
    expect(() => buildCustomerReceiptPreparePayload({ ...base, amount: 'not-money' }, [invoiceA], 'receipt:test')).toThrow('at most two decimal places');
  });

  it('blocks Escape from reopening a draft after the payment has posted', () => {
    expect(receiptEscapeAction(2, '0198ea37-2b30-7c8d-9123-123456789abc')).toBe('block');
    expect(receiptEscapeAction(2, '')).toBe('back');
    expect(receiptEscapeAction(1, '')).toBe('close');
  });
});
