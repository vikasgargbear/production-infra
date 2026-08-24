import { canonicalReturnsApi } from '../../../services/api/modules/returns/canonicalReturns.api';
import {
  approveReturnAsIndependentReviewer,
  loadReturnForIndependentApproval,
} from './canonicalReturnApproval';

jest.mock('../../../services/api/modules/returns/canonicalReturns.api', () => ({
  canonicalReturnsApi: {
    getApprovalReview: jest.fn(),
    approveAsIndependentReviewer: jest.fn(),
  },
}));

const commandId = 'd3000000-0000-7000-8000-000000000011';
const previewHash = `sha256:${'a'.repeat(64)}`;

it('loads the immutable return through the distinct-reviewer command UUID route', async () => {
  (canonicalReturnsApi.getApprovalReview as jest.Mock).mockResolvedValueOnce({
    data: { command_request_id: commandId, preview_hash: previewHash },
  });
  const preview = await loadReturnForIndependentApproval(commandId);
  expect(preview.preview_hash).toBe(previewHash);
  expect(canonicalReturnsApi.getApprovalReview).toHaveBeenCalledWith(commandId);
});

it('performs approve only and never executes the requester-owned command', async () => {
  (canonicalReturnsApi.approveAsIndependentReviewer as jest.Mock).mockResolvedValueOnce({
    data: { status: 'approved' },
  });
  await approveReturnAsIndependentReviewer(
    { command_request_id: commandId, preview_hash: previewHash },
    'erp-web-return-independent-approve:test-0001',
  );
  expect(canonicalReturnsApi.approveAsIndependentReviewer).toHaveBeenCalledWith(
    commandId,
    previewHash,
    'erp-web-return-independent-approve:test-0001',
  );
});
