import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { customersApi } from '../../../services/api';
import CustomerFlow from './CustomerFlow';

jest.mock('../../../services/api', () => ({
  customersApi: { create: jest.fn() },
}));
jest.mock('../../../hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({
    customerMode: 'b2b',
    isB2BOnly: true,
    isB2COnly: false,
    features: { require_gst_for_b2b: false, default_customer_type: 'organization' },
  }),
}));
jest.mock('../../../hooks/useEscapeKey', () => () => undefined);
jest.mock('../../../hooks/useEnterAsTab', () => ({ useEnterAsTab: () => undefined }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../global/ui/forms/GSTJurisdictionSelect', () => (props: any) => (
  <select {...props} onChange={(event) => props.onChange(event.target.value)}>
    <option value="">Select GST jurisdiction</option>
    <option value="08">08 — Rajasthan</option>
    <option value="27">27 — Maharashtra</option>
  </select>
));

const create = customersApi.create as jest.Mock;

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText('Customer Name *'), { target: { value: 'Neha Medical' } });
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '7615982675' } });
  fireEvent.change(screen.getByLabelText('Address Line 1 *'), { target: { value: 'Akash Home Care' } });
  fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'GGC' } });
  fireEvent.change(screen.getByLabelText('GST state code (2 digits) *'), { target: { value: '08' } });
  fireEvent.change(screen.getByLabelText('Pincode *'), { target: { value: '322201' } });
  fireEvent.change(screen.getByLabelText('Credit Limit (₹) *'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Credit Days *'), { target: { value: '0' } });
  expect((screen.getByLabelText('City *') as HTMLInputElement).value).toBe('GGC');
};

beforeEach(() => create.mockReset());

it('highlights and focuses invalid GSTIN and PAN without calling the API', async () => {
  render(<CustomerFlow />);
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText('GST Number'), { target: { value: '08BADGST' } });
  fireEvent.change(screen.getByLabelText('PAN'), { target: { value: 'BADPAN' } });

  fireEvent.click(screen.getAllByRole('button', { name: 'Save Customer' })[0]);

  expect(await screen.findByText('Enter a valid 15-character GSTIN', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('Enter a valid 10-character PAN', { selector: 'p' })).toBeTruthy();
  expect(screen.getByLabelText('GST Number').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByLabelText('PAN').getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(screen.getByLabelText('GST Number')).toHaveFocus());
  expect(create).not.toHaveBeenCalled();
});

it('maps canonical API field errors back to the exact input', async () => {
  create.mockRejectedValue({
    response: { data: { detail: [{ loc: ['body', 'pan_number'], msg: 'PAN format is invalid' }] } },
  });
  render(<CustomerFlow />);
  fillRequiredFields();

  fireEvent.click(screen.getAllByRole('button', { name: 'Save Customer' })[0]);

  expect(await screen.findByText('PAN format is invalid', { selector: 'p' })).toBeTruthy();
  expect(screen.getByLabelText('PAN').getAttribute('aria-invalid')).toBe('true');
  await waitFor(() => expect(screen.getByLabelText('PAN')).toHaveFocus());
});

it('highlights state, pincode, and GSTIN when jurisdiction details disagree', async () => {
  render(<CustomerFlow />);
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText('Pincode *'), { target: { value: '32220' } });
  fireEvent.change(screen.getByLabelText('GST Number'), { target: { value: '27AAPFU0939F1ZV' } });

  fireEvent.click(screen.getAllByRole('button', { name: 'Save Customer' })[0]);

  expect(await screen.findByText('Address state must match the GSTIN', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('Enter a valid 6-digit pincode', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('GSTIN state code must match the address state', { selector: 'p' })).toBeTruthy();
  expect(screen.getByLabelText('GST state code (2 digits) *')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Pincode *')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('GST Number')).toHaveAttribute('aria-invalid', 'true');
  await waitFor(() => expect(screen.getByLabelText('GST state code (2 digits) *')).toHaveFocus());
  expect(create).not.toHaveBeenCalled();
});

it('maps all canonical address and tax API errors to their exact inputs', async () => {
  create.mockRejectedValue({
    response: {
      data: {
        detail: [
          { loc: ['body', 'state_code'], msg: 'State is unavailable' },
          { loc: ['body', 'pincode'], msg: 'Pincode is outside the state' },
          { loc: ['body', 'gst_number'], msg: 'GSTIN could not be verified' },
        ],
      },
    },
  });
  render(<CustomerFlow />);
  fillRequiredFields();

  fireEvent.click(screen.getAllByRole('button', { name: 'Save Customer' })[0]);

  expect(await screen.findByText('State is unavailable', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('Pincode is outside the state', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('GSTIN could not be verified', { selector: 'p' })).toBeTruthy();
  expect(screen.getByLabelText('GST state code (2 digits) *')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Pincode *')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('GST Number')).toHaveAttribute('aria-invalid', 'true');
  await waitFor(() => expect(screen.getByLabelText('GST state code (2 digits) *')).toHaveFocus());
});

it('shows canonical operational-baseline failures without blaming a form field', async () => {
  create.mockRejectedValue({
    response: { data: { detail: 'Master data configuration is incomplete' } },
  });
  render(<CustomerFlow />);
  fillRequiredFields();

  fireEvent.click(screen.getAllByRole('button', { name: 'Save Customer' })[0]);

  expect(await screen.findByText('Master data configuration is incomplete')).toBeTruthy();
  expect(screen.getByLabelText('Customer Name *')).not.toHaveAttribute('aria-invalid');
  expect(screen.getByLabelText('GST state code (2 digits) *')).not.toHaveAttribute('aria-invalid');
  expect(screen.getByLabelText('Pincode *')).not.toHaveAttribute('aria-invalid');
});
