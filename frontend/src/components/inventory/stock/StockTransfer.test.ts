import type { EligibleTransferBatch } from '../../../services/api/modules/inventory/inventoryTransfers.api';
import type { InventoryLocation } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import {
  defaultTransferQuantity,
  normalizeEligibleTransferBatches,
  proposeFefoAllocations,
  validateTransferQuantity,
} from './utils/stockTransferExact';
import {
  destinationTransferLocationAvailability,
  governedTransferLocationAvailability,
  unavailableTransferLocationLabel,
} from './utils/stockTransferLocations';

const batch = (overrides: Partial<EligibleTransferBatch> = {}): EligibleTransferBatch => ({
  batch_id: '018f6f6d-4f27-7abc-8000-000000000001',
  batch_number: 'B-001',
  expires_on: '2027-01-01',
  product_id: '018f6f6d-4f27-7abc-8000-000000000002',
  uom_conversion_id: '018f6f6d-4f27-7abc-8000-000000000003',
  selected_uom_code: 'EA',
  base_uom_code: 'EA',
  uom_multiplier: '1.000000',
  available_base_quantity: '99999999999999.000000',
  available_selected_quantity: '99999999999999.000000',
  average_unit_cost: '0.1000',
  inventory_value: '900719925474099.30',
  is_default: true,
  ...overrides,
});

const location = (overrides: Partial<InventoryLocation> = {}): InventoryLocation => ({
  location_id: '018f6f6d-4f27-7abc-8000-000000000010',
  location_code: 'SALE',
  location_name: 'Saleable',
  location_type: 'saleable',
  location_status: 'active',
  allows_sale: true,
  allows_negative_stock: false,
  temperature_min_c: null,
  temperature_max_c: null,
  ...overrides,
});

describe('canonical inter-branch transfer exactness', () => {
  it('keeps quantities above Number.MAX_SAFE_INTEGER exact', () => {
    expect(validateTransferQuantity(
      '99999999999998.999999',
      '99999999999999.000000',
      'Transfer quantity',
    )).toBe('99999999999998.999999');
    expect(normalizeEligibleTransferBatches([
      batch({ inventory_value: '9007199254740993.30' }),
    ])[0].inventory_value).toBe('9007199254740993.30');
  });

  it('rejects numeric authoritative stock and over-allocation', () => {
    expect(() => validateTransferQuantity('0.20', 0.3, 'Transfer quantity')).toThrow(/exact decimal string/);
    expect(() => validateTransferQuantity('0.300001', '0.300000', 'Transfer quantity')).toThrow(/within available/);
  });

  it.each([
    { uom_multiplier: '0.000000' },
    { available_base_quantity: '0.000000' },
    { available_selected_quantity: '0.000000' },
    { average_unit_cost: '0.0000' },
    { inventory_value: '0.00' },
  ])('rejects zero eligible stock authority: %p', override => {
    expect(() => normalizeEligibleTransferBatches([batch(override)])).toThrow(/greater than zero/);
  });

  it('uses the whole exact remainder below one as the default', () => {
    expect(defaultTransferQuantity(batch({ available_selected_quantity: '0.300000' }))).toBe('0.300000');
  });

  it('accepts only one equally earliest-expiry tier and one deterministic default', () => {
    expect(normalizeEligibleTransferBatches([
      batch(),
      batch({ batch_id: '018f6f6d-4f27-7abc-8000-000000000004', batch_number: 'B-002', is_default: false }),
    ])).toHaveLength(2);
    expect(() => normalizeEligibleTransferBatches([
      batch(),
      batch({ batch_id: '018f6f6d-4f27-7abc-8000-000000000004', expires_on: '2027-02-01', is_default: false }),
    ])).toThrow(/one earliest-expiry FEFO tier/);
    expect(() => normalizeEligibleTransferBatches([
      batch(),
      batch({ batch_number: 'B-DUP', is_default: false }),
    ])).toThrow(/duplicate canonical batch identity/);
  });

  it('proposes an exact allocation across tied earliest-expiry batches', () => {
    const choices = normalizeEligibleTransferBatches([
      batch({ batch_id: '018f6f6d-4f27-7abc-8000-000000000005', available_selected_quantity: '0.100000' }),
      batch({ batch_id: '018f6f6d-4f27-7abc-8000-000000000006', batch_number: 'B-002', available_selected_quantity: '0.200000', is_default: false }),
    ]);
    expect(proposeFefoAllocations('0.300000', choices)).toEqual([
      { batch_id: '018f6f6d-4f27-7abc-8000-000000000005', entered_quantity: '0.100000' },
      { batch_id: '018f6f6d-4f27-7abc-8000-000000000006', entered_quantity: '0.200000' },
    ]);
    expect(() => proposeFefoAllocations('0.300001', choices)).toThrow(/exceeds/);
  });

  it.each([
    [location({ location_status: 'blocked' }), 'not active'],
    [location({ location_type: 'quarantine' }), 'not saleable'],
    [location({ allows_sale: false }), 'sales are disabled'],
    [location({ allows_negative_stock: true }), 'negative stock is allowed'],
  ])('disables governed transfer-ineligible locations and explains why', (candidate, reason) => {
    const availability = governedTransferLocationAvailability(candidate);
    expect(availability.eligible).toBe(false);
    expect(unavailableTransferLocationLabel(candidate, availability)).toContain(reason);
  });

  it('requires exact matching source and destination temperature bounds', () => {
    const source = location({ temperature_min_c: '2.000000', temperature_max_c: '8.000000' });
    expect(destinationTransferLocationAvailability(location({
      temperature_min_c: '2.000000', temperature_max_c: '8.000000',
    }), source).eligible).toBe(true);
    const mismatch = destinationTransferLocationAvailability(location({
      temperature_min_c: '2.000000', temperature_max_c: '9.000000',
    }), source);
    expect(mismatch.eligible).toBe(false);
    expect(mismatch.reasons).toContain('storage temperature bounds differ from the source');
  });
});
