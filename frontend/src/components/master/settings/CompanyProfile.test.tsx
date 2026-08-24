import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CompanyProfile from './CompanyProfile';

jest.mock('../../../services/api', () => ({
  companyApi: { getCompanyInfo: jest.fn().mockResolvedValue({ data: {} }) },
}));

jest.mock('../../../utils/companyProfile', () => ({
  unwrapCompanyProfileResponse: jest.fn(() => ({})),
  normalizeCompanyProfile: jest.fn(() => ({
    name: 'Example Pharma',
    business_settings: {},
    logo: null,
    pan_number: '',
    gst_number: '',
    drug_license_number: '',
    fssai_number: '',
    msme_number: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    bankAccounts: [],
  })),
}));

jest.mock('../masters/BankAccountManager', () => () => <div>Bank accounts</div>);

describe('CompanyProfile', () => {
  it('associates visible field labels and contains narrow content without horizontal clipping', async () => {
    const { container } = render(<CompanyProfile open />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Company Profile' })).toBeTruthy());

    expect(screen.getByLabelText('Business Name').getAttribute('id')).toBe('company-business-name');
    expect(screen.getByLabelText('GSTIN').getAttribute('id')).toBe('company-gstin');
    expect(screen.getByLabelText('Email').getAttribute('id')).toBe('company-email');
    expect(screen.getByLabelText('Business Timezone').getAttribute('id')).toBe('company-timezone');
    expect(screen.getByLabelText('Default Terms & Conditions').getAttribute('id')).toBe('company-default-terms');

    expect(container.firstElementChild?.classList.contains('min-w-0')).toBe(true);
    expect(container.firstElementChild?.classList.contains('overflow-hidden')).toBe(true);
    expect(container.querySelector('.overflow-x-hidden')).not.toBeNull();
  });
});
