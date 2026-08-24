import { canonicalReturnsApi } from '../../../services/api/modules/returns/canonicalReturns.api';
import type { CanonicalReturnCommandDetail } from '../../../services/api/modules/returns/canonicalReturns.api';
import {
  executeApprovedCanonicalReturn,
  retryCanonicalReturnReadback,
} from './canonicalReturnResume';

jest.mock('../../../services/api/modules/returns/canonicalReturns.api', () => ({
  canonicalReturnsApi: {
    executeAsRequester: jest.fn(),
    getSalesReadback: jest.fn(),
    getPurchaseReadback: jest.fn(),
  },
}));

const commandId = 'd3000000-0000-7000-8000-000000000011';
const resourceId = 'd3000000-0000-7000-8000-000000000012';
const previewHash = `sha256:${'a'.repeat(64)}`;

const detail = (overrides: Partial<CanonicalReturnCommandDetail> = {}): CanonicalReturnCommandDetail => ({
  command_request_id: commandId,
  command_type: 'sales.return.post',
  return_kind: 'sales',
  status: 'approved',
  branch_id: 'd3000000-0000-7000-8000-000000000001',
  requested_by_membership_id: 'd3000000-0000-7000-8000-000000000002',
  requester_name: 'Requester',
  created_at: '2026-08-25T10:00:00Z',
  expires_at: '2026-08-25T11:00:00Z',
  preview_hash: previewHash,
  resolved_references: [],
  source_versions: [],
  calculation_ruleset: [],
  inventory_impact: [],
  financial_impact: [],
  tax_impact: [],
  policy_warnings: [],
  required_approvals: [{ policy: 'separate_approver', count: 1 }],
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

it('persists the execution resource identity before GET-only readback', async () => {
  const order: string[] = [];
  (canonicalReturnsApi.executeAsRequester as jest.Mock).mockImplementation(async () => ({
    data: {
      command_request_id: commandId,
      preview_hash: previewHash,
      status: 'succeeded',
      resource_type: 'sales_return',
      resource_id: resourceId,
    },
  }));
  (canonicalReturnsApi.getSalesReadback as jest.Mock).mockImplementation(async () => {
    order.push('readback');
    return { data: { return_id: resourceId, status: 'posted' } };
  });

  const result = await executeApprovedCanonicalReturn(
    detail(),
    'erp-web-return-execute:test-0001',
    execution => {
      expect(execution.resource_id).toBe(resourceId);
      order.push('persist');
    },
  );

  expect(order).toEqual(['persist', 'readback']);
  expect(result.readback).toMatchObject({ return_id: resourceId, status: 'posted' });
  expect(canonicalReturnsApi.executeAsRequester).toHaveBeenCalledTimes(1);
});

it('returns a persisted result when readback fails and retry performs GET only', async () => {
  (canonicalReturnsApi.executeAsRequester as jest.Mock).mockResolvedValueOnce({
    data: {
      command_request_id: commandId,
      preview_hash: previewHash,
      status: 'succeeded',
      resource_type: 'sales_return',
      resource_id: resourceId,
    },
  });
  (canonicalReturnsApi.getSalesReadback as jest.Mock)
    .mockRejectedValueOnce(new Error('temporary read failure'))
    .mockResolvedValueOnce({ data: { return_id: resourceId, status: 'posted' } });

  const result = await executeApprovedCanonicalReturn(
    detail(),
    'erp-web-return-execute:test-0002',
    () => undefined,
  );
  expect(result.execution.resource_id).toBe(resourceId);
  expect(result.readbackError).toBeInstanceOf(Error);

  await retryCanonicalReturnReadback('sales', resourceId);
  expect(canonicalReturnsApi.executeAsRequester).toHaveBeenCalledTimes(1);
  expect(canonicalReturnsApi.getSalesReadback).toHaveBeenCalledTimes(2);
});

it.each([
  detail({ status: 'succeeded', resource_id: resourceId }),
  detail({ status: 'rejected' }),
  detail({ status: 'expired' }),
])('never executes an already terminal command', async command => {
  await expect(executeApprovedCanonicalReturn(
    command,
    'erp-web-return-execute:test-0003',
    () => undefined,
  )).rejects.toThrow(/Only an approved, not-yet-executed/);
  expect(canonicalReturnsApi.executeAsRequester).not.toHaveBeenCalled();
});
