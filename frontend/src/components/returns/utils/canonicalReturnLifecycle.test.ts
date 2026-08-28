import { prepareCanonicalAction } from '../../../services/api/canonicalOperatorActions';
import { prepareCanonicalSalesReturn } from './canonicalReturnLifecycle';

jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  prepareCanonicalAction: jest.fn(),
}));

const mockedPrepare = prepareCanonicalAction as jest.MockedFunction<typeof prepareCanonicalAction>;

it('prepares only and exposes the immutable distinct-approver waiting state', async () => {
  mockedPrepare.mockResolvedValueOnce({
    data: {
      command_request_id: 'd3000000-0000-7000-8000-000000000011',
      preview_hash: `sha256:${'a'.repeat(64)}`,
    },
  } as any);
  const result = await prepareCanonicalSalesReturn({
    branch_id: 'd3000000-0000-7000-8000-000000000001',
    invoice_id: 'd3000000-0000-7000-8000-000000000002',
    return_date: '2026-08-25',
    return_reason: 'damage',
    gst_tax_treatment: 'commercial_only',
    return_reason_choices: [{
      reason_code: 'damage',
      supported_gst_treatments: ['commercial_only'],
    }],
    items: [{
      selected: true,
      original_invoice_line_id: 'd3000000-0000-7000-8000-000000000003',
      invoice_dispatch_allocation_id: 'd3000000-0000-7000-8000-000000000004',
      batch_id: 'd3000000-0000-7000-8000-000000000005',
      to_location_id: 'd3000000-0000-7000-8000-000000000006',
      return_condition: 'damaged',
      return_paid_qty: '1',
      return_free_qty: '0',
      returnable_billed_quantity: '1',
      returnable_free_quantity: '0',
    }],
  }, 'erp-web-sales-return-prepare:lifecycle-0001');

  expect(mockedPrepare).toHaveBeenCalledTimes(1);
  expect(result.state).toBe('awaiting_independent_approval');
  expect(result.message).toMatch(/requester cannot self-approve/i);
});
