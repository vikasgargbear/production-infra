import React from 'react';

import DrugLicenseSetup from '../components/master/settings/DrugLicenseSetup';
import AuthContext, { type AuthContextValue } from '../contexts/AuthContext';

const user = {
  user_id: 'd3000000-0000-7000-8000-000000000090',
  email: 'license-harness@example.invalid',
  org_id: 'd3000000-0000-7000-8000-000000000001',
  role_id: 'd3000000-0000-7000-8000-000000000091',
  permissions: { 'compliance.license.manage': true },
  is_admin: false,
  data_access_level: 'organization',
};

const value: AuthContextValue = {
  user, token: 'browser-harness-token', isAuthenticated: true, isLoading: false,
  onboardingRequired: false, isOnline: true, hasCloudSession: true,
  sessionExchangeError: null,
  login: async () => ({ success: true, user }),
  loginWithGoogle: async () => ({ success: true, user }),
  handleOAuthCallback: async () => ({ success: true, user }),
  logout: () => undefined,
  getOrgId: () => user.org_id,
  getToken: () => 'browser-harness-token',
  retrySessionExchange: async () => ({ success: true, user }),
  createOrganization: async () => ({ success: true, user }),
  acceptInvitation: async () => ({ success: true, user }),
};

const DrugLicenseSetupSmokePage: React.FC = () => (
  <AuthContext.Provider value={value}><DrugLicenseSetup /></AuthContext.Provider>
);

export default DrugLicenseSetupSmokePage;
