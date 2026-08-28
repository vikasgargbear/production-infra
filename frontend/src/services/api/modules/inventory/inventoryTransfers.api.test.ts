import { apiHelpers } from '../../apiClient';
import { decodeTransferReadback, inventoryTransfersApi } from './inventoryTransfers.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn() },
}));

const uuid = (suffix: string) => `018f6f6d-4f27-7abc-8000-${suffix.padStart(12, '0')}`;

const readback = (overrides: Record<string, unknown> = {}) => ({
  id: uuid('1'),
  document_number: 'ST/2026/0001',
  status: 'posted',
  branch_id: uuid('2'),
  destination_branch_id: uuid('3'),
  document_date: '2026-08-25',
  total_abs_base_quantity: '0.300000',
  total_value: '9007199254740993.30',
  row_version: 3,
  lines: [{
    inventory_document_line_id: uuid('4'),
    product_id: uuid('5'),
    batch_id: uuid('6'),
    from_location_id: uuid('7'),
    to_location_id: uuid('8'),
    base_quantity: '0.300000',
    unit_cost: '9007199254740993.3000',
    extended_cost: '9007199254740993.30',
    transfer_out_ledger_id: uuid('9'),
    transfer_out_branch_id: uuid('2'),
    transfer_out_location_id: uuid('7'),
    transfer_out_product_id: uuid('5'),
    transfer_out_batch_id: uuid('6'),
    transfer_out_quantity: '-0.300000',
    transfer_out_unit_cost: '9007199254740993.3000',
    transfer_out_value: '-9007199254740993.30',
    transfer_in_ledger_id: uuid('10'),
    transfer_in_branch_id: uuid('3'),
    transfer_in_location_id: uuid('8'),
    transfer_in_product_id: uuid('5'),
    transfer_in_batch_id: uuid('6'),
    transfer_in_quantity: '0.300000',
    transfer_in_unit_cost: '9007199254740993.3000',
    transfer_in_value: '9007199254740993.30',
  }],
  ...overrides,
});

describe('canonical inventory transfer readback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves exact values above 2^53 and reconciles paired ledger evidence', () => {
    const decoded = decodeTransferReadback(readback());
    expect(decoded.total_value).toBe('9007199254740993.30');
    expect(decoded.lines[0].transfer_out_value).toBe('-9007199254740993.30');
  });

  it('rejects numeric JSON and unbalanced evidence', () => {
    expect(() => decodeTransferReadback(readback({ total_value: 9007199254740994 }))).toThrow(/exact decimal string/);
    const invalid = readback();
    (invalid.lines[0] as any).transfer_in_quantity = '0.299999';
    expect(() => decodeTransferReadback(invalid)).toThrow(/not exactly quantity\/value balanced/);
  });

  it.each([
    ['total_abs_base_quantity', '0.000000'],
    ['total_value', '0.00'],
  ])('rejects zero required header evidence %s', (field, value) => {
    expect(() => decodeTransferReadback(readback({ [field]: value }))).toThrow(/greater than zero/);
  });

  it.each([
    ['base_quantity', '0.000000'],
    ['unit_cost', '0.0000'],
    ['extended_cost', '0.00'],
  ])('rejects zero required line evidence %s', (field, value) => {
    const invalid = readback();
    (invalid.lines[0] as any)[field] = value;
    expect(() => decodeTransferReadback(invalid)).toThrow(/greater than zero/);
  });

  it('opts out of the legacy money-number adapter before decoding exact readback', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: readback() });
    await expect(inventoryTransfersApi.readback(uuid('1'))).resolves.toMatchObject({
      data: { total_value: '9007199254740993.30' },
    });
    expect(apiHelpers.get).toHaveBeenCalledWith(
      `/canonical/inventory-transfers/${uuid('1')}`,
      { preserveExactDecimals: true },
    );
  });
});
