import React from 'react';
import { Info, UserCheck, X } from 'lucide-react';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';

interface UserManagementProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Canonical membership administration is intentionally fail-closed.
 * Do not reconnect this screen to the retired /users CRUD routes.
 */
const UserManagement: React.FC<UserManagementProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserCheck className="h-6 w-6 shrink-0 text-gray-700" aria-hidden="true" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-gray-900 sm:text-2xl">Users</h1>
              <p className="text-sm text-gray-500">Organization memberships</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close user management" className="grid h-11 w-11 shrink-0 place-items-center border border-gray-300 bg-white text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <CanonicalWriteNotice
        title="User administration is not connected yet"
        description="The live API does not currently expose a canonical organization-membership directory or membership commands. This page will not call the retired /users CRUD endpoints, and no changes are stored locally."
        className="mx-4 mt-4 sm:mx-6"
      />

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <section className="mx-auto max-w-2xl border border-gray-200 bg-white p-5 sm:p-8">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <div>
              <h2 className="font-medium text-gray-900">No user request was sent</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                Add the canonical membership read and command APIs before enabling a user list, invitations, role assignment, status changes, password actions, editing, or deletion here.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default UserManagement;
