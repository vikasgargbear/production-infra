import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UserManagement from './UserManagement';
import {
  createOrganizationInvitation,
  getOrganizationInvitationContext,
} from '../../../services/api/modules/org/organizationInvitations.api';

jest.mock('../../../services/api/modules/org/organizationInvitations.api', () => ({
  createOrganizationInvitation: jest.fn(),
  getOrganizationInvitationContext: jest.fn(),
}));

const roleId = '71aa0ceb-6499-4de7-932a-d3743991d23e';
const branchId = '44444444-4444-4444-8444-444444444444';
const invitationUrl = 'https://erp.example.com/?invitation_token=signed.invitation.token';

beforeEach(() => {
  jest.clearAllMocks();
  (getOrganizationInvitationContext as jest.Mock).mockResolvedValue({ data: {
    organization_id: '9e1b4f9e-2dcc-47f5-8dfa-938005806841',
    organization_name: 'Northwind Pharma Private Limited',
    roles: [{
      role_id: roleId,
      role_code: 'organization_owner',
      role_name: 'Organization Owner',
      description: 'Organization-wide administration.',
    }],
    branches: [{
      branch_id: branchId,
      branch_code: 'MAIN',
      branch_name: 'Main Branch',
      city: 'Mumbai',
      state_code: '27',
    }],
  } });
  (createOrganizationInvitation as jest.Mock).mockResolvedValue({ data: {
    invitation_id: '55555555-5555-4555-8555-555555555555',
    organization_id: '9e1b4f9e-2dcc-47f5-8dfa-938005806841',
    email: 'operator@example.com',
    expires_at: '2026-09-04T08:00:00Z',
    token: 'signed.invitation.token',
    invitation_url: invitationUrl,
  } });
});

test('administrator creates and copies a human-readable invitation link', async () => {
  const user = userEvent.setup();
  const clipboardWrite = jest.spyOn(navigator.clipboard, 'writeText');
  render(<UserManagement open onClose={jest.fn()} />);

  expect(await screen.findByText(/join Northwind Pharma Private Limited/)).toBeInTheDocument();
  await user.type(screen.getByLabelText('Google account email'), ' Operator@Example.com ');
  await user.click(screen.getByRole('button', { name: 'Create invitation link' }));

  await waitFor(() => expect(createOrganizationInvitation).toHaveBeenCalledWith({
    email: 'operator@example.com',
    role_id: roleId,
    scope_kind: 'organization',
    expires_in_hours: 168,
  }));
  expect(await screen.findByRole('heading', { name: 'Invitation created' })).toBeInTheDocument();
  expect(screen.getByLabelText('Invitation link')).toHaveValue(invitationUrl);

  await user.click(screen.getByRole('button', { name: 'Copy invitation link' }));
  await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(invitationUrl));
  expect(await screen.findByRole('button', { name: 'Invitation link copied' })).toBeInTheDocument();
});

test('branch access submits the selected canonical branch identity', async () => {
  const user = userEvent.setup();
  render(<UserManagement open onClose={jest.fn()} />);

  await screen.findByText(/join Northwind Pharma Private Limited/);
  await user.type(screen.getByLabelText('Google account email'), 'branch@example.com');
  await user.click(screen.getByLabelText('One branch'));
  expect(screen.getByLabelText('Branch')).toHaveValue(branchId);
  await user.click(screen.getByRole('button', { name: 'Create invitation link' }));

  await waitFor(() => expect(createOrganizationInvitation).toHaveBeenCalledWith(expect.objectContaining({
    scope_kind: 'branch',
    branch_id: branchId,
  })));
});
