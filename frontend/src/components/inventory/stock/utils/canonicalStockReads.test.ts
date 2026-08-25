import {
  batchItemsCsv, decodeBatchPage, decodeCurrentStockPage, decodeInventoryContext, decodeMovementPage,
  displayOrganizationTimestamp, exhaustCursorPages, movementItemsCsv, movementLabel,
} from './canonicalStockReads';

const ids = {
  branch: 'd3000000-0000-7000-8000-000000000001',
  location: 'd3000000-0000-7000-8000-000000000002',
  product: 'd3000000-0000-7000-8000-000000000003',
  batch: 'd3000000-0000-7000-8000-000000000004',
  document: 'd3000000-0000-7000-8000-000000000005',
  movement1: 'd3000000-0000-7000-8000-000000000006',
  movement2: 'd3000000-0000-7000-8000-000000000007',
};
const scope = { branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', location_id: null, location_code: null, location_name: null };
const item = (movement_id: string, overrides = {}) => ({
  movement_id, posted_at: '2026-08-25T10:00:00Z', entry_kind: 'value_adjustment',
  quantity_delta: '0.000000', value_delta: '5.00', absolute_quantity: '0.000000',
  absolute_value: '5.00', unit_cost: '100.0000', branch_id: ids.branch,
  branch_code: 'MAIN', branch_name: 'Main', location_id: ids.location,
  location_code: 'SALE', location_name: 'Saleable', product_id: ids.product,
  product_code: 'BOX', product_name: 'Carton', batch_id: ids.batch,
  batch_number: 'B-1', inventory_document_id: ids.document, document_number: 'ADJ-1',
  reverses_entry_id: null, reversed_entry_kind: null, reversal_reconciled: true,
  posted_by: null, ...overrides,
});
const response = (items: unknown[], total_count: number, next_cursor: string | null) => ({
  scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25', items, total_count,
  summary: { movement_count: total_count, gross_quantity: '0.000000', net_quantity_delta: '0.000000', gross_value: '10.00', net_value_delta: '0.00' },
  next_cursor,
});

test('preserves signed authoritative value adjustments and reversal lineage', () => {
  const decoded = decodeMovementPage(response([
    item(ids.movement1),
    item(ids.movement2, { entry_kind: 'reversal', value_delta: '-5.00', reverses_entry_id: ids.movement1, reversed_entry_kind: 'value_adjustment', document_number: 'REV-1' }),
  ], 2, null));
  expect(decoded.items[0]).toMatchObject({ quantity_delta: '0.000000', value_delta: '5.00' });
  expect(decoded.items[1]).toMatchObject({ quantity_delta: '0.000000', value_delta: '-5.00' });
  expect(movementLabel(decoded.items[1])).toBe('Reversal of value adjustment');
});

test.each([
  ['numeric quantity', { quantity_delta: 0 }],
  ['numeric value', { value_delta: -5 }],
  ['unproven reversal reconciliation', { reversal_reconciled: false }],
  ['derived wrong reversal value', { entry_kind: 'reversal', quantity_delta: '0.000000', value_delta: '0.00', absolute_value: '0.00', reverses_entry_id: ids.movement1, reversed_entry_kind: 'value_adjustment' }],
])('rejects %s at the strict wire boundary', (_label, override) => {
  expect(() => decodeMovementPage(response([item(ids.movement1, override)], 1, null))).toThrow();
});

test('exhausts deterministic cursors and fails incomplete or repeated pagination', async () => {
  const load = jest.fn()
    .mockResolvedValueOnce({ data: response([item(ids.movement1)], 2, 'next') })
    .mockResolvedValueOnce({ data: response([item(ids.movement2)], 2, null) });
  const complete = await exhaustCursorPages(load, { branch_id: ids.branch }, decodeMovementPage);
  expect(complete.items.map(row => row.movement_id)).toEqual([ids.movement1, ids.movement2]);
  expect(load.mock.calls[1][0].cursor).toBe('next');

  await expect(exhaustCursorPages(
    jest.fn().mockResolvedValue({ data: response([item(ids.movement1)], 2, null) }),
    { branch_id: ids.branch }, decodeMovementPage,
  )).rejects.toThrow('incomplete');
});

test('decodes explicit tracked, positive-stock, and exhausted batch counts', () => {
  const decoded = decodeCurrentStockPage({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [{
      product_id: ids.product, product_code: 'BOX', product_name: 'Carton',
      generic_name: null, hsn_code: null, product_type: 'medicine', unit: 'EA', category: null,
      total_quantity: '1.000000', total_value: '95.24', average_unit_cost: '95.2400',
      batch_count: 2, positive_stock_batch_count: 1, exhausted_batch_count: 1,
      negative_stock_batch_count: 0,
      expired_batch_count: 0, near_expiry_batch_count: 1, requires_cold_chain: false,
    }],
    total_count: 1,
    summary: {
      product_count: 1, total_quantity: '1.000000', total_value: '95.24',
      batch_count: 2, positive_stock_batch_count: 1, exhausted_batch_count: 1,
      negative_stock_batch_count: 0,
    },
    next_cursor: null,
  });
  expect(decoded.summary).toMatchObject({
    batch_count: 2, positive_stock_batch_count: 1, exhausted_batch_count: 1,
    negative_stock_batch_count: 0,
  });
});

test('preserves signed negative current-stock and batch aggregates', () => {
  const current = decodeCurrentStockPage({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [{
      product_id: ids.product, product_code: 'NEG', product_name: 'Negative stock',
      generic_name: null, hsn_code: '3004', product_type: 'medicine', unit: 'EA', category: null,
      total_quantity: '-2.000000', total_value: '-40.00', average_unit_cost: '20.0000',
      batch_count: 1, positive_stock_batch_count: 0, exhausted_batch_count: 0,
      negative_stock_batch_count: 1, expired_batch_count: 0, near_expiry_batch_count: 0,
      requires_cold_chain: false,
    }],
    total_count: 1,
    summary: {
      product_count: 1, total_quantity: '-2.000000', total_value: '-40.00',
      batch_count: 1, positive_stock_batch_count: 0, exhausted_batch_count: 0,
      negative_stock_batch_count: 1,
    },
    next_cursor: null,
  });
  const batches = decodeBatchPage({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [{
      batch_id: ids.batch, product_id: ids.product, product_code: 'NEG',
      product_name: 'Negative stock', batch_number: 'B-NEG', manufactured_on: null,
      expires_on: '2027-08-25', expiry_state: 'current', mrp: '50.0000',
      status: 'released', is_saleable: false, total_quantity: '-2.000000',
      total_value: '-40.00', average_unit_cost: '20.0000',
    }],
    total_count: 1,
    summary: {
      batch_count: 1, positive_stock_count: 0, exhausted_batch_count: 0,
      negative_stock_count: 1, total_quantity: '-2.000000', total_value: '-40.00',
      expired_count: 0, expiring_30d_count: 0, near_expiry_90d_count: 0,
    },
    next_cursor: null,
  });
  expect(current.items[0]).toMatchObject({ total_quantity: '-2.000000', total_value: '-40.00' });
  expect(current.summary).toMatchObject({ total_quantity: '-2.000000', total_value: '-40.00' });
  expect(batches.items[0]).toMatchObject({ total_quantity: '-2.000000', total_value: '-40.00' });
  expect(batches.summary).toMatchObject({ total_quantity: '-2.000000', total_value: '-40.00' });
});

test('preserves explicit zero prices and leaves unknown average cost unavailable', () => {
  const decoded = decodeBatchPage({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [{
      batch_id: ids.batch, product_id: ids.product, product_code: 'FREE',
      product_name: 'Explicit zero MRP', batch_number: 'B-ZERO', manufactured_on: null,
      expires_on: null, expiry_state: 'undated', mrp: '0.0000', status: 'quarantined',
      is_saleable: false, total_quantity: '0.000000', total_value: '0.00',
      average_unit_cost: null,
    }],
    total_count: 1,
    summary: {
      batch_count: 1, positive_stock_count: 0, exhausted_batch_count: 1,
      negative_stock_count: 0, total_quantity: '0.000000', total_value: '0.00',
      expired_count: 0, expiring_30d_count: 0, near_expiry_90d_count: 0,
    },
    next_cursor: null,
  });
  expect(decoded.items[0]).toMatchObject({
    mrp: '0.0000', total_quantity: '0.000000', total_value: '0.00',
    average_unit_cost: null,
  });
  expect(batchItemsCsv(decoded.items)).toContain('0.0000');
});

test('rejects missing or aliased inventory business facts at the wire boundary', () => {
  const current = {
    product_id: ids.product, product_code: 'BOX', product_name: 'Carton',
    generic_name: null, hsn_code: null, product_type: 'medicine', unit: 'EA', category: null,
    total_quantity: '1.000000', total_value: '10.00', average_unit_cost: null,
    batch_count: 1, positive_stock_batch_count: 1, exhausted_batch_count: 0,
    negative_stock_batch_count: 0, expired_batch_count: 0, near_expiry_batch_count: 0,
    requires_cold_chain: false,
  };
  const currentPage = (stockItem: Record<string, unknown>) => ({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25',
    items: [stockItem], total_count: 1,
    summary: {
      product_count: 1, total_quantity: '1.000000', total_value: '10.00',
      batch_count: 1, positive_stock_batch_count: 1, exhausted_batch_count: 0,
      negative_stock_batch_count: 0,
    },
    next_cursor: null,
  });
  const { total_quantity: _quantity, ...missingQuantity } = current;
  expect(() => decodeCurrentStockPage(currentPage(missingQuantity))).toThrow('total_quantity');
  expect(() => decodeCurrentStockPage(currentPage({ ...current, product_type: 'goods' })))
    .toThrow('not canonical');

  const batch = {
    batch_id: ids.batch, product_id: ids.product, product_code: 'BOX', product_name: 'Carton',
    batch_number: 'B-1', manufactured_on: null, expires_on: null, expiry_state: 'undated',
    mrp: '10.0000', status: 'released', is_saleable: true,
    total_quantity: '1.000000', total_value: '10.00', average_unit_cost: null,
  };
  const batchPage = (batchItem: Record<string, unknown>) => ({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25', items: [batchItem],
    total_count: 1, summary: {
      batch_count: 1, positive_stock_count: 1, exhausted_batch_count: 0,
      negative_stock_count: 0, total_quantity: '1.000000', total_value: '10.00',
      expired_count: 0, expiring_30d_count: 0, near_expiry_90d_count: 0,
    }, next_cursor: null,
  });
  const { mrp: _mrp, ...missingMrp } = batch;
  expect(() => decodeBatchPage(batchPage(missingMrp))).toThrow('mrp');
  expect(() => decodeBatchPage(batchPage({ ...batch, status: 'active' })))
    .toThrow('not canonical');
});

test('rejects page totals that contradict their authoritative summaries', () => {
  expect(() => decodeMovementPage({
    ...response([], 0, null),
    total_count: 1,
  })).toThrow('total_count');
  expect(() => decodeBatchPage({
    scope, as_of: '2026-08-25T10:00:00Z', business_date: '2026-08-25', items: [],
    total_count: 0, summary: {
      batch_count: 1, positive_stock_count: 0, exhausted_batch_count: 1,
      negative_stock_count: 0, total_quantity: '0.000000', total_value: '0.00',
      expired_count: 0, expiring_30d_count: 0, near_expiry_90d_count: 0,
    }, next_cursor: null,
  })).toThrow('total_count');
});

test('validates and uses the organization IANA timezone for movement timestamps', () => {
  expect(() => decodeInventoryContext({
    organization_id: ids.branch, organization_timezone: 'Not/AZone',
    business_date: '2026-08-25',
    transfer_logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person' }],
    branches: [],
  })).toThrow('IANA time zone');
  expect(displayOrganizationTimestamp('2026-08-25T20:00:00Z', 'Asia/Kolkata'))
    .toContain('26 Aug 2026');
});

test('decodes exact governed inventory location facts and rejects ambiguous authority', () => {
  const context = decodeInventoryContext({
    organization_id: ids.branch,
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
    transfer_logistics_modes: [{ transport_mode: 'in_person', display_name: 'In person' }],
    branches: [{
      branch_id: ids.branch,
      branch_code: 'MAIN',
      branch_name: 'Main',
      locations: [{
        location_id: ids.location,
        location_code: 'SALE',
        location_name: 'Saleable',
        location_type: 'saleable',
        location_status: 'active',
        allows_sale: true,
        allows_negative_stock: false,
        temperature_min_c: '-20.000000',
        temperature_max_c: '25.500000',
      }],
    }],
  });
  expect(context.branches[0].locations[0]).toMatchObject({
    location_type: 'saleable',
    location_status: 'active',
    allows_sale: true,
    allows_negative_stock: false,
    temperature_min_c: '-20.000000',
    temperature_max_c: '25.500000',
  });
  expect(context.transfer_logistics_modes).toEqual([
    { transport_mode: 'in_person', display_name: 'In person' },
  ]);
  const location = context.branches[0].locations[0];
  for (const invalid of [
    { ...location, allows_sale: 'true' },
    { ...location, location_status: 'unknown' },
    { ...location, temperature_min_c: -20 },
    { ...location, temperature_max_c: '25.5' },
  ]) {
    expect(() => decodeInventoryContext({
      ...context,
      branches: [{ ...context.branches[0], locations: [invalid] }],
    })).toThrow();
  }
});

test('neutralizes spreadsheet formulas in batch and movement CSV exports', () => {
  const hostile = '  =HYPERLINK("bad")';
  const batchCsv = batchItemsCsv([{
    batch_id: ids.batch, product_id: ids.product, product_code: 'BOX',
    product_name: hostile, batch_number: '+FORMULA', manufactured_on: null,
    expires_on: '2027-08-25', expiry_state: 'current', mrp: '100.0000',
    status: 'released', is_saleable: true, total_quantity: '1.000000',
    total_value: '100.00', average_unit_cost: '100.0000',
  }]);
  const movementCsv = movementItemsCsv([
    decodeMovementPage(response([
      item(ids.movement1, { document_number: '@FORMULA', product_name: hostile }),
    ], 1, null)).items[0],
  ]);
  expect(batchCsv).toContain('"\'+FORMULA"');
  expect(batchCsv).toContain('"\'  =HYPERLINK(""bad"")"');
  expect(movementCsv).toContain('"\'@FORMULA"');
  expect(movementCsv).toContain('"\'  =HYPERLINK(""bad"")"');
});
