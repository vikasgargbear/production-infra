import {
  advanceMoneyToMinor,
  buildSupplierAdvancePreparePayload,
  validateSupplierAdvancePreview,
  type SupplierAdvanceContext,
} from './supplierAdvanceCommand';

const ids = {
  supplier: 'd3200000-0000-7000-8000-000000000002',
  party: 'd3200000-0000-7000-8000-000000000003',
  branch: 'd3000000-0000-7000-8000-000000000004',
  bank: 'd3000000-0000-7000-8000-000000000005',
  settlement: 'd3000000-0000-7000-8000-000000000006',
  order: 'd3000000-0000-7000-8000-000000000007',
  line: 'd3000000-0000-7000-8000-000000000008',
  product: 'd3000000-0000-7000-8000-000000000009',
  command: 'd3000000-0000-7000-8000-000000000010',
  payment: 'd3000000-0000-7000-8000-000000000011',
  prepayment: 'd3000000-0000-7000-8000-000000000012',
};

const context: SupplierAdvanceContext = {
  ready: true, blocking_reasons: [], payment_date: '2026-08-25',
  withholding_treatment: 'not_applicable_verified',
  branches: [{ branch_id: ids.branch, branch_code: 'BR', branch_name: 'Branch' }],
  bank_accounts: [{ bank_account_id: ids.bank, settlement_account_id: ids.settlement,
    bank_name: 'Bank', account_holder_name: 'Org', ifsc: 'BANK0001', currency_code: 'INR' }],
  suppliers: [{ supplier_account_id: ids.supplier, party_id: ids.party,
    supplier_code: 'SUP', supplier_name: 'Supplier', lines: [{
      purchase_order_id: ids.order, branch_id: ids.branch,
      purchase_order_number: 'PO-1', order_date: '2026-08-20',
      purchase_order_line_id: ids.line, line_number: 1, product_id: ids.product,
      product_code: 'SKU-1', product_name: 'Product', uom_code: 'EA',
      ordered_quantity: '5', net_value_amount: '200.10', prior_active_gross: '32.09',
      remaining_advance_amount: '168.01', withholding_nature_code: 'purchase_of_goods',
    }] }],
};

const draft = {
  supplierAccountId: ids.supplier, purchaseOrderLineId: ids.line,
  bankAccountId: ids.bank, paymentDate: '2026-08-25' as const,
  paymentMethod: 'upi' as const, grossAmount: '168.01', externalReference: ' upi-advance-1 ',
};

test('builds one exact PO-line gross allocation without floating point or invented withholding', () => {
  const payload = buildSupplierAdvancePreparePayload(context, draft, 'advance:attempt-0001');
  expect(payload).toEqual({
    idempotency_key: 'advance:attempt-0001', branch_id: ids.branch,
    payment_date: '2026-08-25', supplier_account_id: ids.supplier,
    purchase_order_id: ids.order, settlement_account_id: ids.settlement,
    bank_account_id: ids.bank, payment_method: 'upi', gross_amount: '168.01',
    allocations: [{ purchase_order_line_id: ids.line, gross_amount: '168.01' }],
    external_reference: 'upi-advance-1',
  });
  expect(advanceMoneyToMinor('0.10') + advanceMoneyToMinor('0.20')).toBe(30n);
});

test.each([
  [{ ...draft, grossAmount: '168.011' }, /at most two/i],
  [{ ...draft, grossAmount: '168.02' }, /cannot exceed/i],
  [{ ...draft, paymentDate: '2026-08-26' }, /cannot exceed/i],
  [{ ...draft, externalReference: ' ' }, /reference/i],
  [{ ...draft, purchaseOrderLineId: ids.payment }, /approved purchase-order/i],
] as const)('rejects invalid or non-authoritative draft %#', (invalid, message) => {
  expect(() => buildSupplierAdvancePreparePayload(context, invalid, 'advance:attempt-0001')).toThrow(message);
});

test('validates exact immutable preview lineage, amounts, and zero withholding', () => {
  const payload = buildSupplierAdvancePreparePayload(context, draft, 'advance:attempt-0001');
  const preview: any = {
    command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}`,
    operation: 'finance.supplier_advance.post', capability_code: 'finance.supplier_advance.prepare',
    branch_id: ids.branch, target_resource_type: 'payment', target_resource_id: ids.payment,
    inventory_impact: [], tax_impact: [], financial_impact: [{
      gross_advance_amount: '168.01', cash_disbursed_amount: '168.01', withheld_amount: '0.00',
      purchase_order_id: ids.order, purchase_order_line_id: ids.line,
      settlement_account_id: ids.settlement, supplier_prepayment_account_id: ids.prepayment,
    }],
  };
  expect(validateSupplierAdvancePreview(preview, payload)).toBe(preview);
  expect(() => validateSupplierAdvancePreview({ ...preview, financial_impact: [{
    ...preview.financial_impact[0], withheld_amount: '0.01',
  }] }, payload)).toThrow(/withholding differs/i);
});
