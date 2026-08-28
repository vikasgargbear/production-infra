import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  MailPlus,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react';
import {
  createOrganizationInvitation,
  getOrganizationInvitationContext,
  type OrganizationInvitationContext,
  type OrganizationInvitationResult,
} from '../../../services/api/modules/org/organizationInvitations.api';

interface UserManagementProps {
  open: boolean;
  onClose: () => void;
}

function requestErrorMessage(error: unknown, fallback: string): string {
  const response = (error as any)?.response?.data;
  if (typeof response?.detail === 'string') return response.detail;
  if (typeof response?.detail?.message === 'string') return response.detail.message;
  if (typeof (error as any)?.message === 'string') return (error as any).message;
  return fallback;
}

const UserManagement: React.FC<UserManagementProps> = ({ open, onClose }) => {
  const [context, setContext] = useState<OrganizationInvitationContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [scopeKind, setScopeKind] = useState<'organization' | 'branch'>('organization');
  const [branchId, setBranchId] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [invitation, setInvitation] = useState<OrganizationInvitationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const loadContext = React.useCallback(async () => {
    setLoadingContext(true);
    setError('');
    try {
      const response = await getOrganizationInvitationContext();
      setContext(response.data);
      setRoleId((current) => (
        response.data.roles.some((role) => role.role_id === current)
          ? current
          : response.data.roles[0]?.role_id || ''
      ));
      setBranchId((current) => (
        response.data.branches.some((branch) => branch.branch_id === current)
          ? current
          : response.data.branches[0]?.branch_id || ''
      ));
    } catch (loadError) {
      setContext(null);
      setError(requestErrorMessage(loadError, 'Invitation choices could not be loaded.'));
    } finally {
      setLoadingContext(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadContext();
  }, [loadContext, open]);

  const selectedRole = useMemo(
    () => context?.roles.find((role) => role.role_id === roleId) || null,
    [context, roleId],
  );

  const issueInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setCopied(false);
    setSubmitting(true);
    try {
      const response = await createOrganizationInvitation({
        email: email.trim().toLowerCase(),
        role_id: roleId,
        scope_kind: scopeKind,
        ...(scopeKind === 'branch' ? { branch_id: branchId } : {}),
        expires_in_hours: expiresInHours,
      });
      setInvitation(response.data);
    } catch (submitError) {
      setError(requestErrorMessage(submitError, 'The invitation could not be created.'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvitation = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invitation_url);
      setCopied(true);
    } catch {
      setError('Copy failed. Select the invitation link and copy it manually.');
    }
  };

  const resetInvitation = () => {
    setInvitation(null);
    setEmail('');
    setCopied(false);
    setError('');
  };

  if (!open) return null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserCheck className="h-6 w-6 shrink-0 text-gray-700" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-900 sm:text-2xl">Users</h1>
              <p className="text-sm text-gray-500">Invite people to your organization</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close user management" className="grid h-11 w-11 shrink-0 place-items-center border border-gray-300 bg-white text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <section className="mx-auto max-w-2xl border border-gray-200 bg-white p-5 sm:p-8">
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {loadingContext ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Loading invitation options...
            </div>
          ) : !context ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">The invitation service is unavailable.</p>
              <button type="button" onClick={() => void loadContext()} className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 font-medium text-gray-800">
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : invitation ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-950">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">Invitation created</h2>
                  <p className="mt-1 text-sm">Share this one-time link with {invitation.email}. It expires {new Date(invitation.expires_at).toLocaleString()}.</p>
                </div>
              </div>

              <div>
                <label htmlFor="created-invitation-url" className="mb-1 block text-sm font-medium text-gray-800">Invitation link</label>
                <textarea id="created-invitation-url" value={invitation.invitation_url} readOnly rows={4} className="w-full break-all rounded-md border border-gray-300 bg-gray-50 px-3 py-3 text-sm text-gray-800" />
              </div>
              <button type="button" onClick={() => void copyInvitation()} className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700">
                {copied ? <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" /> : <Copy className="mr-2 h-5 w-5" aria-hidden="true" />}
                {copied ? 'Invitation link copied' : 'Copy invitation link'}
              </button>
              <p className="text-xs leading-5 text-gray-500">This link is shown only after creation. Share it securely with the invited email address.</p>
              <button type="button" onClick={resetInvitation} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-3 font-medium text-gray-800 hover:bg-gray-50">
                Invite another person
              </button>
            </div>
          ) : (
            <form onSubmit={issueInvitation} className="space-y-5" aria-label="Create organization invitation">
              <div>
                <div className="flex items-center gap-2">
                  <MailPlus className="h-5 w-5 text-blue-700" aria-hidden="true" />
                  <h2 className="text-lg font-semibold text-gray-900">Invite a user</h2>
                </div>
                <p className="mt-1 text-sm text-gray-600">They will sign in with Google and join {context.organization_name}.</p>
              </div>

              <div>
                <label htmlFor="invitation-email" className="mb-1 block text-sm font-medium text-gray-800">Google account email</label>
                <input id="invitation-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={320} required disabled={submitting} className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label htmlFor="invitation-role" className="mb-1 block text-sm font-medium text-gray-800">Role</label>
                <select id="invitation-role" value={roleId} onChange={(event) => setRoleId(event.target.value)} required disabled={submitting} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {context.roles.map((role) => <option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}
                </select>
                {selectedRole?.description && <p className="mt-1 text-xs leading-5 text-gray-500">{selectedRole.description}</p>}
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-gray-800">Access</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-11 cursor-pointer items-center rounded-md border border-gray-300 px-3 py-2.5">
                    <input type="radio" name="invitation-scope" value="organization" checked={scopeKind === 'organization'} onChange={() => setScopeKind('organization')} disabled={submitting} className="mr-2 h-4 w-4" />
                    Entire organization
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center rounded-md border border-gray-300 px-3 py-2.5">
                    <input type="radio" name="invitation-scope" value="branch" checked={scopeKind === 'branch'} onChange={() => setScopeKind('branch')} disabled={submitting || context.branches.length === 0} className="mr-2 h-4 w-4" />
                    One branch
                  </label>
                </div>
              </fieldset>

              {scopeKind === 'branch' && (
                <div>
                  <label htmlFor="invitation-branch" className="mb-1 block text-sm font-medium text-gray-800">Branch</label>
                  <select id="invitation-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={submitting} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {context.branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_code} — {branch.branch_name}, {branch.city}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="invitation-expiry" className="mb-1 block text-sm font-medium text-gray-800">Link expires in</label>
                <select id="invitation-expiry" value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value))} disabled={submitting} className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={336}>14 days</option>
                </select>
              </div>

              <button type="submit" disabled={submitting || !email.trim() || !roleId || (scopeKind === 'branch' && !branchId)} className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
                {submitting ? 'Creating invitation...' : 'Create invitation link'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
};

export default UserManagement;
