import { apiHelpers } from '../../apiClient';


export interface OrganizationInvitationContext {
  organization_id: string;
  organization_name: string;
  roles: Array<{
    role_id: string;
    role_code: string;
    role_name: string;
    description: string | null;
  }>;
  branches: Array<{
    branch_id: string;
    branch_code: string;
    branch_name: string;
    city: string;
    state_code: string;
  }>;
}


export interface CreateOrganizationInvitationInput {
  email: string;
  role_id: string;
  scope_kind: 'organization' | 'branch';
  branch_id?: string;
  expires_in_hours: number;
}


export interface OrganizationInvitationResult {
  invitation_id: string;
  organization_id: string;
  email: string;
  expires_at: string;
  token: string;
  invitation_url: string;
}


export function getOrganizationInvitationContext() {
  return apiHelpers.get<OrganizationInvitationContext>('/auth/onboarding/invitations/context');
}


export function createOrganizationInvitation(input: CreateOrganizationInvitationInput) {
  return apiHelpers.post<OrganizationInvitationResult>('/auth/onboarding/invitations', input);
}
