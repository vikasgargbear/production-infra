import React from 'react';
import MigrationSetup from '../components/master/settings/MigrationSetup';
import AuthContext, { AuthContextValue } from '../contexts/AuthContext';

const user = {
  user_id: 'd3000000-0000-7000-8000-000000000090', email: 'migration-harness@example.invalid',
  org_id: 'd3000000-0000-7000-8000-000000000001', role_id: null,
  permissions: { 'core.organization.manage': true, 'finance.report.view': true },
};
const value: AuthContextValue = {
  user, token: null, isAuthenticated: true, isLoading: false, onboardingRequired: false,
  isOnline: true, hasCloudSession: false, sessionExchangeError: null,
  loginWithGoogle: async () => undefined, handleOAuthCallback: async () => ({ success: false }),
  logout: () => undefined, getOrgId: () => user.org_id, getToken: () => null,
  retrySessionExchange: async () => ({ success: false }), createOrganization: async () => ({ success: false }),
  acceptInvitation: async () => ({ success: false }),
};
const MigrationSetupSmokePage: React.FC = () => <AuthContext.Provider value={value}><MigrationSetup /></AuthContext.Provider>;
export default MigrationSetupSmokePage;
