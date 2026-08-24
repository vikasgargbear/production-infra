import {
  allocateSupplierFifo, buildSupplierPaymentPreparePayload, localBusinessDate,
  supplierMoneyToMinor, validateSupplierPaymentPreview,
  type SupplierPaymentContext, type SupplierPaymentDraft,
} from './supplierPaymentCommand';

const ids = {
  supplier: 'd3200000-0000-7000-8000-000000000002',
  party: 'd3200000-0000-7000-8000-000000000003',
  branch: 'd3000000-0000-7000-8000-000000000004',
  bank: 'd3000000-0000-7000-8000-000000000005',
  settlement: 'd3000000-0000-7000-8000-000000000006',
  item1: 'd3000000-0000-7000-8000-000000000007',
  item2: 'd3000000-0000-7000-8000-000000000008',
  invoice1: 'd3000000-0000-7000-8000-000000000009',
  invoice2: 'd3000000-0000-7000-8000-000000000010',
};
const context: SupplierPaymentContext = {
  ready: true, blocking_reasons: [], payment_date: '2026-08-25',
  branches: [{ branch_id: ids.branch, branch_code: 'BR', branch_name: 'Branch' }],
  bank_accounts: [{ bank_account_id: ids.bank, settlement_account_id: ids.settlement, bank_name: 'Bank', account_holder_name: 'Org', ifsc: 'BANK0001', currency_code: 'INR' }],
  suppliers: [{ supplier_account_id: ids.supplier, party_id: ids.party, supplier_code: 'SUP', supplier_name: 'Supplier', open_items: [
    { open_item_id: ids.item1, supplier_invoice_id: ids.invoice1, branch_id: ids.branch, document_number: 'INV-1', document_date: '2026-08-01', due_date: '2026-08-10', principal_amount: '100.01', allocated_amount: '0.00', outstanding_amount: '100.01' },
    { open_item_id: ids.item2, supplier_invoice_id: ids.invoice2, branch_id: ids.branch, document_number: 'INV-2', document_date: '2026-08-02', due_date: '2026-08-11', principal_amount: '100.02', allocated_amount: '0.00', outstanding_amount: '100.02' },
  ] }],
};
const draft = (overrides: Partial<SupplierPaymentDraft> = {}): SupplierPaymentDraft => ({
  supplier_account_id: ids.supplier, branch_id: ids.branch,
  bank_account_id: ids.bank, settlement_account_id: ids.settlement,
  payment_date: '2026-08-25', payment_method: 'upi', external_reference: ' upi-ref ',
  allocations: [{ open_item_id: ids.item1, amount: '100.01' }], ...overrides,
});

test('uses BigInt paise and FIFO without floating point drift', () => {
  expect(supplierMoneyToMinor('9007199254740993.99')).toBe(900719925474099399n);
  expect(allocateSupplierFifo('150.02', context.suppliers[0].open_items, ids.branch)).toEqual([
    { open_item_id: ids.item1, amount: '100.01' },
    { open_item_id: ids.item2, amount: '50.01' },
  ]);
});

test('builds the strict exact-string supplier command', () => {
  expect(buildSupplierPaymentPreparePayload(draft(), context, 'stable-attempt')).toEqual(expect.objectContaining({
    gross_amount: '100.01', external_reference: 'upi-ref', idempotency_key: 'stable-attempt',
    allocations: [{ open_item_id: ids.item1, amount: '100.01' }],
  }));
});

test.each([
  [draft({ allocations: [{ open_item_id: ids.item1, amount: '100.001' }] }), 'at most two'],
  [draft({ allocations: [{ open_item_id: ids.item1, amount: '100.02' }] }), 'exceeds'],
  [draft({ allocations: [{ open_item_id: ids.item1, amount: '1.00' }, { open_item_id: ids.item1, amount: '1.00' }] }), 'only once'],
  [draft({ settlement_account_id: ids.item2 }), 'do not match'],
  [draft({ payment_date: '2099-01-01' }), 'not in the future'],
  [draft({ external_reference: ' ' }), 'reference'],
])('fails closed on invalid draft evidence', (candidate, message) => {
  expect(() => buildSupplierPaymentPreparePayload(candidate, context, 'stable')).toThrow(message);
});

test('uses local calendar fields rather than UTC conversion', () => {
  expect(localBusinessDate(new Date(2026, 7, 25, 0, 15))).toBe('2026-08-25');
});

test('accepts only an exact immutable supplier-payment preview', () => {
  const payload = buildSupplierPaymentPreparePayload(draft(), context, 'stable');
  const preview: any = {
    command_request_id: ids.item2, preview_hash: `sha256:${'a'.repeat(64)}`,
    operation: 'finance.payment.post', capability_code: 'finance.supplier_payment.prepare',
    branch_id: ids.branch, target_resource_type: 'payment', target_resource_id: ids.invoice2,
    inventory_impact: [], tax_impact: [], financial_impact: [{
      gross_liability_settlement: '100.01', cash_disbursed_amount: '100.01', withheld_amount: '0.00',
      settlement_account_id: ids.settlement,
      allocations: [{ open_item_id: ids.item1, allocated_amount: '100.01', residual_after: '0.00' }],
    }],
  };
  expect(validateSupplierPaymentPreview(preview, payload)).toBe(preview);
  expect(() => validateSupplierPaymentPreview({ ...preview, tax_impact: [{}] }, payload)).toThrow('unexpected inventory or tax');
});
