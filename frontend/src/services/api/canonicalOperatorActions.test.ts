import { apiHelpers } from './apiClient';
import {
  canonicalExecutionCompleted,
  executeCanonicalAction,
} from './canonicalOperatorActions';

jest.mock('./apiClient', () => ({
  apiHelpers: { post: jest.fn() },
}));

jest.mock('../../utils/clientUuid', () => ({
  clientUuid: () => '20000000-0000-4000-8000-000000000001',
}));

const commandId = '10000000-0000-7000-8000-000000000001';
const previewHash = `sha256:${'a'.repeat(64)}`;

describe('canonical browser command transport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hash-binds one confirmed preview through approve and execute', async () => {
    const post = apiHelpers.post as jest.Mock;
    post
      .mockResolvedValueOnce({ data: { command_request_id: commandId, preview_hash: previewHash } })
      .mockResolvedValueOnce({ data: { status: 'approved' } })
      .mockResolvedValueOnce({ data: {
        status: 'succeeded',
        resource_id: '10000000-0000-4000-8000-000000000002',
      } });

    const result = await executeCanonicalAction('sales.invoice.prepare', { branch_id: 'branch' });

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/web/actions/sales.invoice.prepare/prepare',
      { branch_id: 'branch' },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/web/actions/commands/${commandId}/approve`,
      expect.objectContaining({
        preview_hash: previewHash,
        approval_intent: 'approve',
        idempotency_key: expect.stringMatching(/^erp-web-sales-invoice-approve:/),
      }),
    );
    expect(post).toHaveBeenNthCalledWith(
      3,
      `/web/actions/commands/${commandId}/execute`,
      expect.objectContaining({
        preview_hash: previewHash,
        idempotency_key: expect.stringMatching(/^erp-web-sales-invoice-execute:/),
      }),
    );
    expect(canonicalExecutionCompleted(result.executed.data)).toBe(true);
  });

  it.each([
    [{ command_request_id: 'not-a-uuid', preview_hash: previewHash }, /invalid command identity/i],
    [{ command_request_id: commandId, preview_hash: 'not-a-hash' }, /invalid preview hash/i],
  ])('stops before approval when prepare violates the canonical response contract', async (data, message) => {
    const post = apiHelpers.post as jest.Mock;
    post.mockResolvedValueOnce({ data });

    await expect(executeCanonicalAction('sales.invoice.prepare', {})).rejects.toThrow(message);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('reports ambiguous execute responses instead of pretending the write succeeded', async () => {
    const post = apiHelpers.post as jest.Mock;
    post
      .mockResolvedValueOnce({ data: { command_request_id: commandId, preview_hash: previewHash } })
      .mockResolvedValueOnce({ data: { status: 'approved' } })
      .mockResolvedValueOnce({ data: {} });

    await expect(executeCanonicalAction('sales.invoice.prepare', {}))
      .rejects.toThrow(/invalid status.*confirm server status/i);
  });
});
