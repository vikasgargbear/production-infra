import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompanyProfile from './CompanyProfile';
import { companyApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  companyApi: { getCompanyInfo: jest.fn(), establishGstRegistration: jest.fn() },
}));

jest.mock('../masters/BankAccountManager', () => () => <div>Bank accounts</div>);

const mockRefreshCompanyData = jest.fn();
jest.mock('../../../contexts/CompanyContext', () => ({
  useCompany: () => ({ refreshCompanyData: mockRefreshCompanyData }),
}));

const getCompanyInfo = companyApi.getCompanyInfo as jest.Mock;
const canonicalProfile = (overrides: Record<string, unknown> = {}) => ({
  legal_name: 'Example Pharma',
  licenses: [],
  bank_accounts: [],
  ...overrides,
});
const input = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;

describe('CompanyProfile', () => {
  beforeEach(() => {
    mockRefreshCompanyData.mockReset();
    mockRefreshCompanyData.mockResolvedValue(undefined);
    getCompanyInfo.mockReset();
    getCompanyInfo.mockResolvedValue({ data: canonicalProfile() });
    (companyApi.establishGstRegistration as jest.Mock).mockReset();
    (companyApi.establishGstRegistration as jest.Mock).mockResolvedValue({ data: {} });
  });

  it('associates visible field labels and contains narrow content without horizontal clipping', async () => {
    render(<CompanyProfile open />);
    await screen.findByRole('heading', { name: 'Company Profile' });

    expect(screen.getByLabelText('Business Name').getAttribute('id')).toBe('company-business-name');
    expect(screen.getByLabelText('GSTIN').getAttribute('id')).toBe('company-gstin');
    expect(screen.getByLabelText('Email').getAttribute('id')).toBe('company-email');
    expect(screen.getByLabelText('Business Timezone').getAttribute('id')).toBe('company-timezone');
    expect(screen.getByLabelText('Default Terms & Conditions').getAttribute('id')).toBe('company-default-terms');

    expect(screen.getByTestId('company-profile-root').classList.contains('min-w-0')).toBe(true);
    expect(screen.getByTestId('company-profile-root').classList.contains('overflow-hidden')).toBe(true);
    expect(screen.getByTestId('company-profile-scroll-region').classList.contains('overflow-x-hidden')).toBe(true);
  });

  it('shows missing authoritative settings as unavailable without browser defaults', async () => {
    render(<CompanyProfile open />);

    await screen.findByDisplayValue('Example Pharma');

    [
      'Country',
      'Financial Year Start',
      'Financial Year End',
      'Currency',
      'Currency Symbol',
      'Primary Account Type',
      'Invoice Prefix',
      'Challan Prefix',
      'PO Prefix',
      'Return Prefix',
      'Credit Note Prefix',
      'Debit Note Prefix',
    ].forEach(label => {
      expect(input(label).value).toBe('');
      expect(input(label).getAttribute('placeholder')).toBe('Unavailable');
    });

    expect(screen.queryByDisplayValue('2024-04-01')).toBeNull();
    expect(screen.queryByDisplayValue('2025-03-31')).toBeNull();
    expect(screen.queryByDisplayValue('INR')).toBeNull();
    expect(screen.queryByDisplayValue('₹')).toBeNull();
    expect(screen.queryByDisplayValue('CURRENT')).toBeNull();
    expect(screen.getByText(/does not infer company defaults/i)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save GST registration' })).not.toBeNull();
  });

  it('does not offer GST setup after an active registration is present', async () => {
    getCompanyInfo.mockResolvedValue({
      data: canonicalProfile({ gst_number: '08AAXCA4042N1Z2' }),
    });
    render(<CompanyProfile open />);
    await screen.findByDisplayValue('08AAXCA4042N1Z2');
    expect(screen.queryByRole('button', { name: 'Save GST registration' })).toBeNull();
  });

  it('refreshes shared company authority immediately after GST setup', async () => {
    render(<CompanyProfile open />);
    await screen.findByRole('button', { name: 'Save GST registration' });

    fireEvent.change(screen.getByLabelText('GSTIN for tax invoices'), {
      target: { value: '08AAXCA4042N1Z2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save GST registration' }));

    await waitFor(() => expect(companyApi.establishGstRegistration).toHaveBeenCalledWith({
      gstin: '08AAXCA4042N1Z2',
      confirmed: true,
      idempotency_key: 'company-gstin-08AAXCA4042N1Z2',
    }));
    await waitFor(() => expect(mockRefreshCompanyData).toHaveBeenCalledTimes(1));
  });

  it('renders only authoritative settings supplied by the company projection', async () => {
    getCompanyInfo.mockResolvedValue({
      data: canonicalProfile({
        country: 'India',
        financial_year_start: '2026-04-01',
        financial_year_end: '2027-03-31',
        currency: 'INR',
        currency_symbol: '₹',
        bank_accounts: [{
          id: 'bank-1',
          bank_name: 'Canonical Bank',
          ifsc_code: 'CANO0000001',
          account_type: 'CURRENT',
        }],
        business_settings: {
          invoice_prefix: 'SI/',
          challan_prefix: 'SD/',
          po_prefix: 'PORD/',
          return_prefix: 'RET/',
          credit_note_prefix: 'CRN/',
          debit_note_prefix: 'DBN/',
        },
      }),
    });

    render(<CompanyProfile open />);

    await screen.findByDisplayValue('2026-04-01');
    expect(input('Financial Year End').value).toBe('2027-03-31');
    expect(input('Country').value).toBe('India');
    expect(input('Currency').value).toBe('INR');
    expect(input('Currency Symbol').value).toBe('₹');
    expect(input('Primary Account Type').value).toBe('CURRENT');
    expect(input('Invoice Prefix').value).toBe('SI/');
    expect(input('Challan Prefix').value).toBe('SD/');
    expect(input('PO Prefix').value).toBe('PORD/');
    expect(input('Return Prefix').value).toBe('RET/');
    expect(input('Credit Note Prefix').value).toBe('CRN/');
    expect(input('Debit Note Prefix').value).toBe('DBN/');
  });
});
