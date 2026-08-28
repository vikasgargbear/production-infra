import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Home from './Home';

const mockLogout = jest.fn();

jest.mock('../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasModuleAccess: () => true }),
}));

jest.mock('../contexts/CompanyContext', () => ({
  useCompany: () => ({ companyInfo: { name: 'QA Company', logo: null } }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: { email: 'qa@example.com' },
  }),
}));

test('offers an accessible cloud-session sign-out action', () => {
  render(<Home setActiveTab={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Sign out qa@example.com' }));

  expect(mockLogout).toHaveBeenCalledTimes(1);
});
