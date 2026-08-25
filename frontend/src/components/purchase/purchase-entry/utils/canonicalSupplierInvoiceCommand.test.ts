import {
  buildCanonicalSupplierInvoicePreparePayload,
  validateCanonicalSupplierInvoicePreview,
} from './canonicalSupplierInvoiceCommand';
import type { CanonicalSupplierInvoiceContext } from '../../../../services/api/modules/purchase/canonicalSupplierInvoices.api';

const id = (suffix: string) => `d3000000-0000-7000-8000-${suffix.padStart(12, '0')}`;

const context = (): CanonicalSupplierInvoiceContext => ({
  ready: true,
  blocking_reasons: [],
  branch_id: id('1'),
  buyer_tax_registration_id: id('2'),
  buyer_gstin: '27AAAAA0000A1Z5',
  supplier_account_id: id('3'),
  supplier_name: 'Canonical Supplier',
  supplier_tax_registration_id: id('4'),
  supplier_gstin: '27ABCDE1234F1Z5',
  purchase_order_id: id('5'),
  document_discount_kind: 'none',
  document_discount_basis: 'price_value',
  document_discount_value: '0.000000',
  rounding_policy: 'none',
  zero_rated_payment_mode: 'not_applicable',
  tax_charge_mechanism: 'normal',
  goods_receipt_ids: [id('6')],
  portal_evidence: {
    portal_document_id: id('7'),
    portal_document_line_id: id('8'),
    source_sha256: 'a'.repeat(64),
    source_row_hash: 'b'.repeat(64),
    supplier_gstin: '27ABCDE1234F1Z5',
    invoice_number: 'SUP-1',
    invoice_date: '2026-08-25',
    taxable_amount: '95.2400',
    cgst_amount: '5.7144',
    sgst_amount: '5.7144',
    igst_amount: '0.0000',
    cess_amount: '0.0000',
    total_amount: '106.6688',
  },
  lines: [{
    goods_receipt_id: id('6'),
    goods_receipt_number: 'GRN-1',
    goods_receipt_line_id: id('9'),
    goods_receipt_line_number: 1,
    purchase_order_line_id: id('10'),
    product_id: id('11'),
    product_name: 'Precise product',
    sku: 'SKU-1',
    hsn_code: '481910',
    uom_code: 'EA',
    uom_conversion_factor: '1.000000',
    remaining_base_billed_quantity: '1.234567',
    remaining_base_free_quantity: '0.000001',
    remaining_billed_quantity: '1.234567',
    remaining_free_quantity: '0.000001',
    receipt_unit_cost: '77.1428',
    remaining_capitalized_value: '95.24',
    suggested_quoted_unit_rate: '77.1428',
    suggested_price_basis: 'tax_exclusive',
    suggested_free_supply_tax_treatment: 'included_at_unit_rate',
    suggested_line_discount_kind: 'none',
    suggested_line_discount_basis: 'price_value',
    suggested_line_discount_value: '0.000000',
  }],
  expense_charge_lines: [],
  inventory_effect: 'already_capitalized_by_goods_receipt',
  supplier_invoice_inventory_value_delta: '0.00',
});

const draft = () => ({
  idempotencyKey: 'erp-web-supplier-invoice:stable-1234',
  supplierInvoiceNumber: ' SUP-1 ',
  invoiceDate: '2026-08-25',
  receivedDate: '2026-08-25',
  itcBusinessUseAttested: true,
  lines: [{ goodsReceiptLineId: id('9'), quotedUnitRate: '77.1428' }],
});

test('builds exact canonical receipt allocation without JS numeric conversion', () => {
  const payload: any = buildCanonicalSupplierInvoicePreparePayload(context(), draft());
  expect(payload.supplier_invoice_number).toBe('SUP-1');
  expect(payload.goods_receipt_ids).toEqual([id('6')]);
  expect(payload.portal_document_line_id).toBe(id('8'));
  expect(payload.zero_rated_payment_mode).toBe(context().zero_rated_payment_mode);
  expect(payload.tax_charge_mechanism).toBe(context().tax_charge_mechanism);
  expect(payload.lines[0]).toMatchObject({
    billed_quantity: '1.234567',
    free_quantity: '0.000001',
    quoted_unit_rate: '77.1428',
    allocated_base_billed_quantity: '1.234567',
    allocated_base_free_quantity: '0.000001',
    product_inventory_cost_treatment: 'capitalize',
    itc_eligibility: 'eligible',
    itc_eligibility_basis: 'taxable_resale_not_blocked_under_section_17',
  });
});

test('preserves reviewed discounts, rounding, and expense-charge account identity', () => {
  const source = context();
  source.document_discount_kind = 'percent';
  source.document_discount_basis = 'taxable_value';
  source.document_discount_value = '1.250000';
  source.rounding_policy = 'nearest_rupee';
  source.expense_charge_lines = [{
    purchase_order_line_id: id('12'),
    expense_charge_code: 'freight',
    quoted_amount: '12.34',
    expense_price_basis: 'tax_exclusive',
    expense_document_discount_eligible: false,
    net_value_account_id: id('13'),
    account_code: 'FREIGHT-IN',
    account_name: 'Freight Inward',
  }];
  const payload: any = buildCanonicalSupplierInvoicePreparePayload(source, draft());
  expect(payload.document_discount).toEqual({
    document_discount_kind: 'percent',
    document_discount_basis: 'taxable_value',
    document_discount_value: '1.250000',
  });
  expect(payload.rounding_policy).toBe('nearest_rupee');
  expect(payload.expense_charge_lines[0]).toMatchObject({
    expense_charge_code: 'freight',
    quoted_amount: '12.34',
    net_value_account_id: id('13'),
    charge_inventory_cost_treatment: 'expense',
    itc_eligibility: 'eligible',
  });
});

test('requires explicit ITC business-use attestation', () => {
  expect(() => buildCanonicalSupplierInvoicePreparePayload(
    context(),
    { ...draft(), itcBusinessUseAttested: false },
  )).toThrow('Section 17');
});

test('fails closed when GSTR-2B context is blocked', () => {
  expect(() => buildCanonicalSupplierInvoicePreparePayload(
    { ...context(), ready: false, blocking_reasons: ['GSTR-2B evidence is absent'], portal_evidence: null },
    draft(),
  )).toThrow('GSTR-2B evidence is absent');
});

test('rejects float-shaped and over-precision rates instead of rounding', () => {
  for (const quotedUnitRate of ['77.14289', '7.7e1', 'NaN', '-1']) {
    expect(() => buildCanonicalSupplierInvoicePreparePayload(
      context(),
      { ...draft(), lines: [{ goodsReceiptLineId: id('9'), quotedUnitRate }] },
    )).toThrow('exact positive decimal string');
  }
});

test('rejects omitted or duplicate GRN lines', () => {
  expect(() => buildCanonicalSupplierInvoicePreparePayload(
    context(),
    { ...draft(), lines: [] },
  )).toThrow('Every unallocated posted-GRN line');
  expect(() => buildCanonicalSupplierInvoicePreparePayload(
    { ...context(), lines: [...context().lines, { ...context().lines[0], product_name: 'Second' }] },
    { ...draft(), lines: [draft().lines[0], draft().lines[0]] },
  )).toThrow('repeated');
});

test('rejects received date before supplier invoice date', () => {
  expect(() => buildCanonicalSupplierInvoicePreparePayload(
    context(),
    { ...draft(), receivedDate: '2026-08-24' },
  )).toThrow('cannot precede');
});

test('accepts only an exact supplier-invoice preview tied to selected GSTR-2B evidence', () => {
  const preview: any = {
    command_request_id: id('20'),
    preview_hash: `sha256:${'a'.repeat(64)}`,
    command_type: 'procurement.supplier_invoice.post',
    financial_impact: [{ currency_code: 'INR', supplier_payable: '106.67', inventory_value_delta: '0.00' }],
    inventory_impact: [{ effect: 'receipt_cost_match_no_landed_cost', inventory_value_delta: '0.00' }],
    tax_impact: [{
      cgst_total: '5.71', sgst_total: '5.72', igst_total: '0.00', cess_total: '0.00',
      itc_eligibility: 'eligible', portal_document_line_id: id('8'),
    }],
  };
  expect(validateCanonicalSupplierInvoicePreview(preview, context())).toBe(preview);
  expect(() => validateCanonicalSupplierInvoicePreview({
    ...preview,
    inventory_impact: [{ effect: 'receipt_cost_match_no_landed_cost', inventory_value_delta: '0.01' }],
  }, context())).toThrow('zero second inventory movement');
  expect(() => validateCanonicalSupplierInvoicePreview({
    ...preview,
    tax_impact: [{ ...preview.tax_impact[0], portal_document_line_id: id('99') }],
  }, context())).toThrow('GSTR-2B');
});
