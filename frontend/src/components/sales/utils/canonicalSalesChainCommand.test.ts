import { buildCanonicalSalesDispatchCommand, buildCanonicalSalesOrderCommand } from './canonicalSalesChainCommand';

const ids = {
  branch: 'd3000000-0000-7000-8000-000000000005',
  customer: 'd3200000-0000-7000-8000-000000000001',
  product: 'd3000000-0000-7000-8000-000000000015',
  uom: 'd3000000-0000-7000-8000-000000000016',
  location: 'd3000000-0000-7000-8000-000000000006',
  batch: 'd3000000-0000-7000-8000-000000000017',
  order: 'd3900000-0000-7000-8000-000000000001',
  line: 'd3900000-0000-7000-8000-000000000002',
};

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => 'd3900000-0000-7000-8000-000000000099' } });
});

test('sales order command preserves exact entered decimals and canonical identities', () => {
  const command = buildCanonicalSalesOrderCommand({
    order_id: '', order_number: '', order_date: '2026-08-25', customer_id: ids.customer,
    customer_name: 'Test', customer_details: {} as any, billing_address: 'A', shipping_address: 'A',
    billing_address_data: null, shipping_address_data: null, subtotal_amount: 0, discount_amount: 0,
    tax_amount: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, round_off: 0, total_amount: 0,
    other_charges: 0, total_quantity: 1, gst_type: 'CGST/SGST', place_of_supply: '27', payment_terms: '',
    reference_no: '', sales_person: '', created_by: null, terms_conditions: '', notes: '',
    items: [{ id: 1, product_id: ids.product, product_name: 'P', branch_id: ids.branch,
      uom_conversion_id: ids.uom, quantity: '1.125', free_quantity: '0.25', unit_price: '84.1250',
      discount_percent: '0.125', gst_percent: 12 } as any],
  }, 'sales-order:test');
  expect(command).toMatchObject({ branch_id: ids.branch, customer_account_id: ids.customer,
    lines: [{ product_id: ids.product, uom_conversion_id: ids.uom,
      billed_quantity: '1.125000', free_quantity: '0.250000', quoted_unit_rate: '84.1250',
      line_discount: { line_discount_value: '0.125000' } }] });
});

test('dispatch command requires exact order lineage and preserves explicit batch choice', () => {
  const command = buildCanonicalSalesDispatchCommand({
    challan_id: 0, challan_number: '', challan_date: '2026-08-25', expected_delivery_date: '2026-08-25',
    status: 'draft', source_order_id: ids.order, customer_id: ids.customer, customer_name: 'Test',
    customer_details: {}, billing_address: 'A', delivery_address: 'A', delivery_city: 'Mumbai',
    delivery_state: '27', delivery_pincode: '400001', delivery_contact_person: '', delivery_contact_phone: '',
    transport_company: '', eway_bill_number: '', lr_number: '', vehicle_number: '', driver_name: '', driver_phone: '',
    freight_charges: 0, total_packages: 1, total_weight: 0, total_quantity: 1, total_amount: 0,
    gst_type: 'CGST/SGST', notes: '', items: [{ id: ids.line, source_order_line_id: ids.line,
      product_id: ids.product, product_name: 'P', branch_id: ids.branch, location_id: ids.location,
      batch_id: ids.batch, quantity: 1, free_quantity: '0.5' } as any],
  }, 'sales-dispatch:test');
  expect(command).toMatchObject({ sales_order_id: ids.order, from_location_id: ids.location,
    lines: [{ sales_order_line_id: ids.line, billed_quantity: '1.000000', free_quantity: '0.500000',
      batch_allocations: [{ batch_id: ids.batch, billed_quantity: '1.000000', free_quantity: '0.500000' }] }] });
});

test.each([
  ['missing UOM', () => buildCanonicalSalesOrderCommand({ items: [{ branch_id: ids.branch, product_id: ids.product, quantity: 1, unit_price: 1 }] } as any, 'test')],
  ['missing source order', () => buildCanonicalSalesDispatchCommand({ items: [{}] } as any, 'test')],
  ['negative quantity', () => buildCanonicalSalesOrderCommand({ customer_id: ids.customer, order_date: '2026-08-25', items: [{ branch_id: ids.branch, product_id: ids.product, uom_conversion_id: ids.uom, quantity: -1, unit_price: 1 }] } as any, 'test')],
])('%s fails closed before prepare', (_label, action) => expect(action).toThrow());
