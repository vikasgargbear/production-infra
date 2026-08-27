import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import { prepareCanonicalGoodsReceipt } from './canonicalReceiptLifecycle';
import { CanonicalGoodsReceiptForm } from './CanonicalGoodsReceiptForm';

jest.mock('./canonicalReceiptLifecycle', () => ({
  prepareCanonicalGoodsReceipt: jest.fn(),
  postCanonicalGoodsReceipt: jest.fn(),
}));

const context: CanonicalReceiptContext = {
  purchase_order_id: '10000000-0000-7000-8000-000000000001',
  purchase_order_number: 'CODEX-E2E-PO-0001',
  order_date: '2026-08-27',
  total_amount: '112.00',
  branch_id: '10000000-0000-7000-8000-000000000002',
  supplier_account_id: '10000000-0000-7000-8000-000000000003',
  supplier_name: 'Canonical Supplier',
  organization_timezone: 'Asia/Kolkata',
  business_as_of: '2026-08-28T10:30:00.123456',
  status: 'approved',
  lines: [{
    purchase_order_line_id: '10000000-0000-7000-8000-000000000004',
    line_number: 1,
    product_id: '10000000-0000-7000-8000-000000000005',
    product_name: 'Canonical Product',
    sku: 'CODEX-E2E-SKU',
    ordered_uom_code: 'PACK',
    base_uom_code: 'PACK',
    uom_conversion_factor: '1.000000',
    ordered_billed_quantity: '1.000000',
    ordered_free_quantity: '0.000000',
    remaining_billed_quantity: '1.000000',
    remaining_free_quantity: '0.000000',
    eligible_locations: [{
      id: '10000000-0000-7000-8000-000000000006',
      code: 'QUARANTINE',
      name: 'Quarantine',
      location_type: 'quarantine',
    }],
    mrp_conversions: [{
      id: '10000000-0000-7000-8000-000000000007',
      from_uom_code: 'PACK',
      to_uom_code: 'PACK',
      multiplier: '1.000000',
    }],
  }],
};

beforeEach(() => jest.clearAllMocks());

it('binds the receipt-time input to the PO date and server-authoritative local as-of', () => {
  render(<CanonicalGoodsReceiptForm context={context} onCancel={jest.fn()} onPosted={jest.fn()} />);
  const input = screen.getByLabelText('Physical receipt time') as HTMLInputElement;
  expect(input.min).toBe('2026-08-27T00:00');
  expect(input.max).toBe('2026-08-28T10:30:00.123456');
});

it.each([
  ['2026-08-26T12:00', /cannot precede its source document date/i],
  ['2026-08-28T10:31', /cannot be later than the authoritative organization time/i],
])('blocks an invalid physical receipt time %s before prepare', async (receivedAt, message) => {
  render(<CanonicalGoodsReceiptForm context={context} onCancel={jest.fn()} onPosted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Physical receipt time'), {
    target: { value: receivedAt },
  });
  fireEvent.click(screen.getByRole('button', { name: /review stock impact/i }));

  expect((await screen.findByRole('alert')).textContent).toMatch(message);
  expect(prepareCanonicalGoodsReceipt).not.toHaveBeenCalled();
});

it('submits a receipt time inside the exact server window', async () => {
  (prepareCanonicalGoodsReceipt as jest.Mock).mockResolvedValue({
    data: { command_request_id: '10000000-0000-7000-8000-000000000099' },
  });
  render(<CanonicalGoodsReceiptForm context={context} onCancel={jest.fn()} onPosted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Physical receipt time'), {
    target: { value: '2026-08-28T10:29' },
  });
  fireEvent.click(screen.getByRole('button', { name: /review stock impact/i }));

  await waitFor(() => expect(prepareCanonicalGoodsReceipt).toHaveBeenCalledTimes(1));
});
