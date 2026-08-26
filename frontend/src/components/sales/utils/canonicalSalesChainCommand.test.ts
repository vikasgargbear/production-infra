import { buildCanonicalSalesDispatchCommand, buildCanonicalSalesOrderCommand } from './canonicalSalesChainCommand';
import type { CanonicalDocumentPolicy } from '../../../services/api/modules/org/canonicalBusinessContext.api';

const policy: CanonicalDocumentPolicy = {
  allowed_rounding_policies: ['none'], default_rounding_policy: 'none',
  allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'], default_zero_rated_payment_mode: 'not_applicable',
  allowed_tax_charge_mechanisms: ['normal'], default_tax_charge_mechanism: 'normal',
  allowed_price_bases: ['tax_exclusive'], default_price_basis: 'tax_exclusive',
  logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person', requires_transporter_party: false, requires_vehicle: false, requires_transport_document: false }],
  default_transport_mode: 'in_person',
};

const ids = {
  branch: 'd3000000-0000-7000-8000-000000000005',
  customer: 'd3200000-0000-7000-8000-000000000001',
  product: 'd3000000-0000-7000-8000-000000000015',
  uom: 'd3000000-0000-7000-8000-000000000016',
  location: 'd3000000-0000-7000-8000-000000000006',
  batch: 'd3000000-0000-7000-8000-000000000017',
  batch2: 'd3000000-0000-7000-8000-000000000018',
  order: 'd3900000-0000-7000-8000-000000000001',
  line: 'd3900000-0000-7000-8000-000000000002',
  address: 'd3900000-0000-7000-8000-000000000003',
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'd3900000-0000-7000-8000-000000000099' } });
});

test('sales order command preserves exact entered decimals and canonical identities', () => {
  const command = buildCanonicalSalesOrderCommand({
    order_id: '', order_number: '', order_date: '2026-08-25', customer_id: ids.customer,
    customer_name: 'Test', customer_details: {} as any, billing_address: 'A', shipping_address: 'A',
    billing_address_data: null, shipping_address_data: { address_id: ids.address, row_version: 4 }, subtotal_amount: 0, discount_amount: 0,
    tax_amount: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, round_off: 0, total_amount: 0,
    other_charges: 0, total_quantity: 1, gst_type: 'CGST/SGST', place_of_supply: '27', payment_terms: '',
    reference_no: '', sales_person: '', created_by: null, terms_conditions: '', notes: '',
    items: [{ id: 1, product_id: ids.product, product_name: 'P', branch_id: ids.branch,
      uom_conversion_id: ids.uom, quantity: '1.125', free_quantity: '0.25', unit_price: '84.1250',
      discount_percent: '0.125', free_supply_tax_treatment: 'included_at_unit_rate', gst_percent: 12 } as any],
  }, 'sales-order:test', policy);
  expect(command).toMatchObject({ branch_id: ids.branch, customer_account_id: ids.customer,
    delivery_address_id: ids.address, delivery_address_row_version: '4',
    lines: [{ product_id: ids.product, uom_conversion_id: ids.uom,
      billed_quantity: '1.125000', free_quantity: '0.250000', quoted_unit_rate: '84.1250',
      line_discount: { line_discount_value: '0.125000' } }] });
});

test('dispatch command groups multi-batch defaults by exact order-line identity', () => {
  const eligible = [
    { batch_id: ids.batch, batch_number: 'B-1', expiry_date: '2027-01-01', location_id: ids.location,
      location_name: 'Saleable', mrp: '10.0000', available_quantity: '1.000000', available_base_quantity: '1.000000',
      fefo_priority: 1 },
    { batch_id: ids.batch2, batch_number: 'B-2', expiry_date: '2027-02-01', location_id: ids.location,
      location_name: 'Saleable', mrp: '10.0000', available_quantity: '0.500000', available_base_quantity: '0.500000',
      fefo_priority: 2 },
  ];
  const command = buildCanonicalSalesDispatchCommand({
    challan_id: 0, challan_number: '', challan_date: '2026-08-25', expected_delivery_date: '2026-08-25',
    status: 'draft', source_order_id: ids.order, customer_id: ids.customer, customer_name: 'Test',
    customer_details: {}, billing_address: 'A', delivery_address: 'A', delivery_city: 'Mumbai',
    delivery_state: '27', delivery_pincode: '400001', delivery_contact_person: '', delivery_contact_phone: '',
    distance_km: '8.25', total_packages: 1, total_weight: 0, total_quantity: 1, total_amount: 0,
    gst_type: 'CGST/SGST', notes: '', items: [{ id: `${ids.line}:${ids.batch}`, source_order_line_id: ids.line,
      product_id: ids.product, product_name: 'P', branch_id: ids.branch, location_id: ids.location,
      uom_conversion_id: ids.uom, batch_id: ids.batch, batch_number: 'B-1', expiry_date: '2027-01-01',
      quantity: 1, free_quantity: '0', base_billed_quantity: '1.000000', base_free_quantity: '0.000000', eligible_batches: eligible },
    { id: `${ids.line}:${ids.batch2}`, source_order_line_id: ids.line,
      product_id: ids.product, product_name: 'P', branch_id: ids.branch, location_id: ids.location,
      uom_conversion_id: ids.uom, batch_id: ids.batch2, batch_number: 'B-2', expiry_date: '2027-02-01',
      quantity: 0, free_quantity: '0.5', base_billed_quantity: '0.000000', base_free_quantity: '0.500000', eligible_batches: eligible } as any],
  }, 'sales-dispatch:test', policy);
  expect(command).toMatchObject({ sales_order_id: ids.order, from_location_id: ids.location,
    logistics: { transport_mode: 'in_person', distance_km: '8.25' },
    lines: [{ sales_order_line_id: ids.line, billed_quantity: '1.000000', free_quantity: '0.500000',
      batch_allocations: [
        { batch_id: ids.batch, billed_quantity: '1.000000', free_quantity: '0.000000' },
        { batch_id: ids.batch2, billed_quantity: '0.000000', free_quantity: '0.500000' },
      ] }] });
});

test.each([
  ['missing UOM', () => buildCanonicalSalesOrderCommand({ items: [{ branch_id: ids.branch, product_id: ids.product, quantity: 1, unit_price: 1 }] } as any, 'test', policy)],
  ['missing source order', () => buildCanonicalSalesDispatchCommand({ items: [{}] } as any, 'test', policy)],
  ['negative quantity', () => buildCanonicalSalesOrderCommand({ customer_id: ids.customer, order_date: '2026-08-25', items: [{ branch_id: ids.branch, product_id: ids.product, uom_conversion_id: ids.uom, quantity: -1, unit_price: 1 }] } as any, 'test', policy)],
])('%s fails closed before prepare', (_label, action) => expect(action).toThrow());

test('dispatch rejects missing policy, exact distance, and order-line identity', () => {
  const eligible = [{
    batch_id: ids.batch, batch_number: 'B-1', expiry_date: '2027-01-01', location_id: ids.location,
    location_name: 'Saleable', mrp: '10.0000', available_quantity: '1.000000', available_base_quantity: '1.000000',
    fefo_priority: 1,
  }];
  const base = {
    source_order_id: ids.order,
    challan_date: '2026-08-25',
    distance_km: '1.00',
    items: [{
      source_order_line_id: ids.line,
      branch_id: ids.branch,
      location_id: ids.location,
      product_id: ids.product,
      uom_conversion_id: ids.uom,
      batch_id: ids.batch,
      batch_number: 'B-1',
      expiry_date: '2027-01-01',
      quantity: '1.000000',
      free_quantity: '0.000000',
      base_billed_quantity: '1.000000',
      base_free_quantity: '0.000000',
      eligible_batches: eligible,
    }],
  } as any;
  expect(() => buildCanonicalSalesDispatchCommand(base, 'test', null)).toThrow(/logistics policy/i);
  expect(() => buildCanonicalSalesDispatchCommand({ ...base, distance_km: '' }, 'test', policy)).toThrow(/distance.*missing/i);
  expect(() => buildCanonicalSalesDispatchCommand({
    ...base,
    items: [{ ...base.items[0], source_order_line_id: undefined, id: ids.line }],
  }, 'test', policy)).toThrow(/sales-order line.*missing/i);
});

test.each([
  ['line discount', { discount_percent: undefined }],
  ['free quantity', { free_quantity: undefined }],
])('sales order rejects a missing exact %s', (_label, lineOverride) => {
  expect(() => buildCanonicalSalesOrderCommand({
    order_date: '2026-08-25', customer_id: ids.customer,
    shipping_address_data: { address_id: ids.address, row_version: 4 },
    discount_amount: 0, other_charges: 0,
    items: [{ branch_id: ids.branch, product_id: ids.product, uom_conversion_id: ids.uom,
      quantity: '1.000000', free_quantity: '0.000000', unit_price: '10.0000',
      discount_percent: '0.000000', free_supply_tax_treatment: 'excluded_from_taxable_value',
      ...lineOverride }],
  } as any, 'test', policy)).toThrow(/missing/i);
});

test('sales order derives the immaterial zero-free treatment but requires it for free supply', () => {
  const build = (freeQuantity: string, treatment?: string) => buildCanonicalSalesOrderCommand({
    order_date: '2026-08-25', customer_id: ids.customer,
    shipping_address_data: { address_id: ids.address, row_version: 4 },
    discount_amount: 0, other_charges: 0,
    items: [{ branch_id: ids.branch, product_id: ids.product, uom_conversion_id: ids.uom,
      quantity: '1.000000', free_quantity: freeQuantity, unit_price: '10.0000',
      discount_percent: '0.000000', free_supply_tax_treatment: treatment }],
  } as any, 'test', policy);

  expect(build('0.000000')).toMatchObject({
    lines: [{ free_quantity: '0.000000', free_supply_tax_treatment: 'excluded_from_taxable_value' }],
  });
  expect(() => build('0.250000')).toThrow(/free-supply tax treatment.*missing/i);
});

test.each([
  ['document discount', { discount_amount: '1.00', other_charges: '0.00' }],
  ['delivery charge', { discount_amount: '0.00', other_charges: '0.00', delivery_charges: '1.00' }],
  ['other charge', { discount_amount: '0.00', other_charges: '1.00' }],
])('sales order rejects unsupported nonzero %s', (_label, documentOverride) => {
  expect(() => buildCanonicalSalesOrderCommand({
    order_date: '2026-08-25', customer_id: ids.customer, ...documentOverride,
    shipping_address_data: { address_id: ids.address, row_version: 4 },
    items: [{ branch_id: ids.branch, product_id: ids.product, uom_conversion_id: ids.uom,
      quantity: '1.000000', free_quantity: '0.000000', unit_price: '10.0000',
      discount_percent: '0.000000', free_supply_tax_treatment: 'excluded_from_taxable_value' }],
  } as any, 'test', policy)).toThrow(/not supported/i);
});
