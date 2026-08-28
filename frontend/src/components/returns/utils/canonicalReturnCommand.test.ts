import {
  buildPurchaseReturnPreparePayload,
  buildSalesReturnPreparePayload,
  canonicalDecimal,
} from './canonicalReturnCommand';

const ids = {
  branch: 'd3000000-0000-7000-8000-000000000001',
  invoice: 'd3000000-0000-7000-8000-000000000002',
  line: 'd3000000-0000-7000-8000-000000000003',
  allocation: 'd3000000-0000-7000-8000-000000000004',
  batch: 'd3000000-0000-7000-8000-000000000005',
  location: 'd3000000-0000-7000-8000-000000000006',
  receipt: 'd3000000-0000-7000-8000-000000000007',
  address: 'd3000000-0000-7000-8000-000000000008',
  evidence: 'd3000000-0000-7000-8000-000000000009',
};

const sales = () => ({
  branch_id: ids.branch,
  invoice_id: ids.invoice,
  return_date: '2026-08-25',
  return_reason: 'damage',
  gst_tax_treatment: 'commercial_only',
  return_reason_choices: [{
    reason_code: 'damage',
    supported_gst_treatments: ['commercial_only'],
  }],
  items: [{
    selected: true,
    original_invoice_line_id: ids.line,
    invoice_dispatch_allocation_id: ids.allocation,
    batch_id: ids.batch,
    to_location_id: ids.location,
    return_condition: 'damaged',
    return_paid_qty: '900719925474.123456',
    return_free_qty: '0.000001',
    returnable_billed_quantity: '900719925474.123456',
    returnable_free_quantity: '0.000001',
  }],
});

const purchase = () => ({
  branch_id: ids.branch,
  supplier_invoice_id: ids.invoice,
  return_date: '2026-08-25',
  return_reason: 'excess_supply',
  gst_tax_treatment: 'commercial_only',
  return_reason_choices: [{
    reason_code: 'excess_supply',
    supported_gst_treatments: ['commercial_only'],
  }],
  supplier_destination_address_id: ids.address,
  logistics_modes: [{
    transport_mode: 'in_person',
    display_name: 'In person / hand carried',
    distance_required: true,
    minimum_distance_km: '0',
    transporter_requirement: 'forbidden',
    vehicle_requirement: 'forbidden',
    transport_document_requirement: 'forbidden',
    vehicle_type_choices: [],
  }],
  transporter_choices: [],
  transport_details: { transport_mode: 'in_person', distance_km: '0' },
  items: [{
    selected: true,
    goods_receipt_line_id: ids.receipt,
    supplier_invoice_line_id: ids.line,
    supplier_invoice_receipt_allocation_id: ids.allocation,
    batch_id: ids.batch,
    from_location_id: ids.location,
    return_paid_qty: '2.123456',
    return_free_qty: '0.000001',
    returnable_billed_quantity: '2.123456',
    returnable_free_quantity: '0.000001',
    uom_conversion_factor: '10.000001',
    stock_on_hand_base_quantity: '22',
  }],
});

describe('canonical return command builders', () => {
  it('normalizes decimal text without passing through JavaScript Number', () => {
    expect(canonicalDecimal('900719925474.123456', 'amount')).toBe('900719925474.123456');
    expect(canonicalDecimal('2.120000', 'amount')).toBe('2.12');
    expect(() => canonicalDecimal('1e3', 'amount')).toThrow(/decimal string/);
    expect(() => canonicalDecimal('0.1234567', 'amount')).toThrow(/six places/);
  });

  it('preserves exact billed/free sales quantities and canonical lineage', () => {
    const payload: any = buildSalesReturnPreparePayload(
      sales(),
      'erp-web-sales-return-prepare:test-0001',
    );
    expect(payload.lines[0]).toMatchObject({
      original_invoice_line_id: ids.line,
      invoice_dispatch_allocation_id: ids.allocation,
      billed_quantity: '900719925474.123456',
      free_quantity: '0.000001',
    });
  });

  it('rejects sales quantity beyond the exact source remainder', () => {
    const value = sales();
    value.items[0].return_paid_qty = '900719925474.123457';
    expect(() => buildSalesReturnPreparePayload(value, 'erp-web-sales-return-prepare:test-0002'))
      .toThrow(/authoritative billed\/free remainder/);
  });

  it('requires statutory evidence when statutory GST is selected', () => {
    const value: any = sales();
    value.gst_tax_treatment = 'statutory';
    value.return_reason_choices[0].supported_gst_treatments = ['commercial_only', 'statutory'];
    expect(() => buildSalesReturnPreparePayload(value, 'erp-web-sales-return-prepare:test-0003'))
      .toThrow(/ITC-reversal evidence/);
  });

  it('requires an explicit RFC 3339 offset for statutory evidence time', () => {
    const value: any = sales();
    value.gst_tax_treatment = 'statutory';
    value.return_reason_choices[0].supported_gst_treatments = ['commercial_only', 'statutory'];
    value.recipient_itc_reversal_evidence_attachment_id = ids.evidence;
    value.recipient_itc_reversal_confirmed_at = '2026-08-25T17:30:00';
    expect(() => buildSalesReturnPreparePayload(value, 'erp-web-sales-return-prepare:test-time-1'))
      .toThrow(/explicit offset/i);
    value.recipient_itc_reversal_confirmed_at = '2026-08-25T17:30:00+05:30';
    const payload: any = buildSalesReturnPreparePayload(
      value,
      'erp-web-sales-return-prepare:test-time-2',
    );
    expect(payload.recipient_itc_reversal_confirmed_at).toBe('2026-08-25T17:30:00+05:30');
  });

  it('rejects a reason and treatment pair that is absent from the effective context', () => {
    const value = sales();
    value.return_reason = 'expiry';
    expect(() => buildSalesReturnPreparePayload(value, 'erp-web-sales-return-prepare:test-0004'))
      .toThrow(/exact effective canonical rule/);
  });

  it('rejects a treatment that belongs to another effective reason', () => {
    const value: any = sales();
    value.gst_tax_treatment = 'statutory';
    value.return_reason_choices.push({
      reason_code: 'expiry',
      supported_gst_treatments: ['statutory'],
    });
    expect(() => buildSalesReturnPreparePayload(value, 'erp-web-sales-return-prepare:test-0005'))
      .toThrow(/reason and GST treatment lack exact canonical authority/);
  });

  it('builds an invoiced purchase return with exact receipt lineage', () => {
    const payload: any = buildPurchaseReturnPreparePayload(
      purchase(),
      'erp-web-purchase-return-prepare:test-0001',
    );
    expect(payload.return_source_kind).toBe('invoiced');
    expect(payload.lines[0]).toMatchObject({
      goods_receipt_line_id: ids.receipt,
      supplier_invoice_receipt_allocation_id: ids.allocation,
      billed_quantity: '2.123456',
      free_quantity: '0.000001',
    });
  });

  it('rejects a purchase quantity above exact stock at its original location', () => {
    const value = purchase();
    value.items[0].stock_on_hand_base_quantity = '21.23457';
    expect(() => buildPurchaseReturnPreparePayload(value, 'erp-web-purchase-return-prepare:test-0002'))
      .toThrow(/authoritative stock/);
  });

  it('rejects duplicate supplier invoice or receipt lineage', () => {
    const value = purchase();
    value.items.push({ ...value.items[0], batch_id: 'd3000000-0000-7000-8000-000000000010' });
    expect(() => buildPurchaseReturnPreparePayload(value, 'erp-web-purchase-return-prepare:test-0003'))
      .toThrow(/cannot repeat/);
  });

  it('rejects transport modes that were not published by the canonical context', () => {
    const value = purchase();
    value.transport_details.transport_mode = 'road';
    expect(() => buildPurchaseReturnPreparePayload(value, 'erp-web-purchase-return-prepare:test-logistics-1'))
      .toThrow(/exact canonical choice/);
  });

  it('requires carrier identity and vehicle type from the selected server policy', () => {
    const value: any = purchase();
    value.logistics_modes = [{
      transport_mode: 'road',
      display_name: 'Road',
      distance_required: true,
      minimum_distance_km: '1',
      transporter_requirement: 'required',
      vehicle_requirement: 'required',
      transport_document_requirement: 'optional',
      vehicle_type_choices: ['regular'],
    }];
    value.transporter_choices = [{
      party_id: ids.evidence,
      party_row_version: '3',
      legal_name: 'Reviewed carrier',
    }];
    value.transport_details = {
      transport_mode: 'road',
      distance_km: '12.5',
      transporter_party_id: ids.evidence,
      vehicle_number: 'KA01AB1234',
      vehicle_type: 'regular',
    };
    const payload: any = buildPurchaseReturnPreparePayload(
      value,
      'erp-web-purchase-return-prepare:test-logistics-2',
    );
    expect(payload.logistics).toEqual({
      transport_mode: 'road',
      distance_km: '12.5',
      transporter_party_id: ids.evidence,
      vehicle_number: 'KA01AB1234',
      vehicle_type: 'regular',
    });
    value.transport_details.transporter_party_id = ids.location;
    expect(() => buildPurchaseReturnPreparePayload(value, 'erp-web-purchase-return-prepare:test-logistics-3'))
      .toThrow(/exact canonical context choice/);
  });
});
