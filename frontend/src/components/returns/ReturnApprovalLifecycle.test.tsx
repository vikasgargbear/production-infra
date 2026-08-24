import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { canonicalReturnsApi } from '../../services/api/modules/returns/canonicalReturns.api';
import type {
  CanonicalReturnCommandDetail,
  CanonicalReturnCommandSummary,
} from '../../services/api/modules/returns/canonicalReturns.api';
import ReturnApprovalInbox from './ReturnApprovalInbox';
import ReturnRequesterInbox from './ReturnRequesterInbox';

jest.mock('react-toastify', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../services/api/modules/returns/canonicalReturns.api', () => ({
  canonicalReturnsApi: {
    listApprovalInbox: jest.fn(),
    listRequesterInbox: jest.fn(),
    getApprovalReview: jest.fn(),
    getRequesterCommand: jest.fn(),
    approveAsIndependentReviewer: jest.fn(),
    executeAsRequester: jest.fn(),
    getSalesReadback: jest.fn(),
    getPurchaseReadback: jest.fn(),
  },
}));

const commandId = 'd3000000-0000-7000-8000-000000000011';
const resourceId = 'd3000000-0000-7000-8000-000000000012';
const previewHash = `sha256:${'a'.repeat(64)}`;

const summary = (
  overrides: Partial<CanonicalReturnCommandSummary> = {},
): CanonicalReturnCommandSummary => ({
  command_request_id: commandId,
  command_type: 'sales.return.post',
  return_kind: 'sales',
  status: 'pending_approval',
  branch_id: 'd3000000-0000-7000-8000-000000000001',
  requested_by_membership_id: 'd3000000-0000-7000-8000-000000000002',
  requester_name: 'Original requester',
  created_at: '2026-08-25T10:00:00Z',
  expires_at: '2026-08-25T11:00:00Z',
  ...overrides,
});

const detail = (
  overrides: Partial<CanonicalReturnCommandDetail> = {},
): CanonicalReturnCommandDetail => ({
  ...summary(),
  preview_hash: previewHash,
  resolved_references: [{ invoice_id: 'source-1' }],
  source_versions: [{ evidence: 'verified' }],
  calculation_ruleset: [{ version: 'returns-v1' }],
  inventory_impact: [{ quantity: '1.000000' }],
  financial_impact: [{ total: '168.000000' }],
  tax_impact: [{ gst: '18.000000' }],
  policy_warnings: [],
  required_approvals: [{ policy: 'separate_approver', count: 1 }],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalReturnsApi.listApprovalInbox as jest.Mock).mockResolvedValue({ data: [] });
  (canonicalReturnsApi.listRequesterInbox as jest.Mock).mockResolvedValue({ data: [] });
});

it('lets a distinct reviewer inspect and approve, but never exposes posting', async () => {
  (canonicalReturnsApi.listApprovalInbox as jest.Mock).mockResolvedValue({ data: [summary()] });
  (canonicalReturnsApi.getApprovalReview as jest.Mock).mockResolvedValue({ data: detail() });
  (canonicalReturnsApi.approveAsIndependentReviewer as jest.Mock).mockResolvedValue({
    data: { command_request_id: commandId, status: 'approved' },
  });

  render(<ReturnApprovalInbox />);
  fireEvent.click(await screen.findByRole('button', { name: /sales return/i }));
  expect(await screen.findByLabelText('Immutable canonical return preview')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /post approved return/i })).toBeNull();

  const approve = screen.getByRole('button', { name: /approve — requester posts later/i });
  expect((approve as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(approve);

  await waitFor(() => expect(canonicalReturnsApi.approveAsIndependentReviewer).toHaveBeenCalledTimes(1));
  expect(canonicalReturnsApi.approveAsIndependentReviewer).toHaveBeenCalledWith(
    commandId,
    previewHash,
    `erp-web-return-approve:${commandId}`,
  );
  expect(canonicalReturnsApi.executeAsRequester).not.toHaveBeenCalled();
});

it('persists a posted resource and retries failed readback without a second execute', async () => {
  (canonicalReturnsApi.listRequesterInbox as jest.Mock).mockResolvedValue({
    data: [summary({ status: 'approved' })],
  });
  (canonicalReturnsApi.getRequesterCommand as jest.Mock).mockResolvedValue({
    data: detail({ status: 'approved' }),
  });
  (canonicalReturnsApi.executeAsRequester as jest.Mock).mockResolvedValue({
    data: {
      command_request_id: commandId,
      command_type: 'sales.return.post',
      preview_hash: previewHash,
      status: 'succeeded',
      resource_type: 'sales_return',
      resource_id: resourceId,
    },
  });
  (canonicalReturnsApi.getSalesReadback as jest.Mock)
    .mockRejectedValueOnce(new Error('temporary read failure'))
    .mockResolvedValueOnce({ data: { return_id: resourceId, status: 'posted' } });

  render(<ReturnRequesterInbox />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
  const post = await screen.findByRole('button', { name: /post approved return/i });
  expect((post as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(post);

  expect(await screen.findByText(resourceId)).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /retry exact readback \(get only\)/i }));
  await screen.findByText(/"status": "posted"/i);
  expect(canonicalReturnsApi.executeAsRequester).toHaveBeenCalledTimes(1);
  expect(canonicalReturnsApi.executeAsRequester).toHaveBeenCalledWith(
    commandId,
    previewHash,
    `erp-web-return-execute:${commandId}`,
  );
  expect(canonicalReturnsApi.getSalesReadback).toHaveBeenCalledTimes(2);
});

it.each(['rejected', 'expired', 'failed'] as const)(
  'shows %s as terminal and never offers execute',
  async status => {
    (canonicalReturnsApi.listRequesterInbox as jest.Mock).mockResolvedValue({
      data: [summary({ status })],
    });
    (canonicalReturnsApi.getRequesterCommand as jest.Mock).mockResolvedValue({
      data: detail({ status }),
    });

    render(<ReturnRequesterInbox />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    await screen.findByText(status === 'failed' ? 'Posting failed' : status[0].toUpperCase() + status.slice(1));
    expect(screen.queryByRole('button', { name: /post approved return/i })).toBeNull();
    expect(canonicalReturnsApi.executeAsRequester).not.toHaveBeenCalled();
  },
);
