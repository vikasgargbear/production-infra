import { apiHelpers } from '../../apiClient';
import {
  createOrganizationInvitation,
  getOrganizationInvitationContext,
} from './organizationInvitations.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn(), post: jest.fn() },
}));

beforeEach(() => jest.clearAllMocks());

test('loads canonical role and branch choices for invitations', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: { roles: [], branches: [] } });

  await getOrganizationInvitationContext();

  expect(apiHelpers.get).toHaveBeenCalledWith('/auth/onboarding/invitations/context');
});

test('issues one email-bound invitation using selected canonical identities', async () => {
  (apiHelpers.post as jest.Mock).mockResolvedValue({ data: { invitation_url: 'https://erp.example/invite' } });
  const input = {
    email: 'operator@example.com',
    role_id: '71aa0ceb-6499-4de7-932a-d3743991d23e',
    scope_kind: 'branch' as const,
    branch_id: '44444444-4444-4444-8444-444444444444',
    expires_in_hours: 168,
  };

  await createOrganizationInvitation(input);

  expect(apiHelpers.post).toHaveBeenCalledWith('/auth/onboarding/invitations', input);
});
