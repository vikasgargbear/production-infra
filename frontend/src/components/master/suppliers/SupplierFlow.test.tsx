import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import { suppliersApi } from '../../../services/api';
import SupplierFlow from './SupplierFlow';

jest.mock('../../../services/api', () => ({
  suppliersApi: { create: jest.fn() },
}));
jest.mock('../../../hooks/useEscapeKey', () => () => undefined);
jest.mock('../../../hooks/useEnterAsTab', () => ({ useEnterAsTab: () => undefined }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('../../global/ui/forms/GSTJurisdictionSelect', () => (props: any) => (
  <select {...props} onChange={(event) => props.onChange(event.target.value)}>
    <option value="">Select GST jurisdiction</option>
    <option value="29">29 — Karnataka</option>
  </select>
));

const create = suppliersApi.create as jest.Mock;

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText('Supplier Name *'), { target: { value: 'Pilot Supplier' } });
  fireEvent.change(screen.getByLabelText('Building / Street Address *'), { target: { value: '101 Test Road' } });
  fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Bengaluru' } });
  fireEvent.change(screen.getByLabelText('GST state code (2 digits) *'), { target: { value: '29' } });
  fireEvent.change(screen.getByLabelText('Pincode *'), { target: { value: '560001' } });
  fireEvent.change(screen.getByLabelText('Payment days *'), { target: { value: '0' } });
};

beforeEach(() => create.mockReset());

it('shows phone, email, GSTIN, and PAN errors beside their inputs and focuses the first invalid field', async () => {
  render(<SupplierFlow open />);
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '123' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
  fireEvent.change(screen.getByLabelText('GSTIN'), { target: { value: '29BADGST' } });
  fireEvent.change(screen.getByLabelText('PAN'), { target: { value: 'BADPAN' } });

  fireEvent.click(screen.getByRole('button', { name: 'Save Supplier' }));

  const expectations: Array<[string, string]> = [
    ['Phone *', 'Phone number must be a valid 10-digit Indian mobile number'],
    ['Email', 'Email address is invalid'],
    ['GSTIN', 'Invalid GSTIN format'],
    ['PAN', 'Invalid PAN format'],
  ];
  for (const [label, message] of expectations) {
    const input = screen.getByLabelText(label);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(screen.getByText(message, { selector: 'p' })).toHaveAttribute('id', errorId);
  }
  await waitFor(() => expect(screen.getByLabelText('Phone *')).toHaveFocus());
  expect(create).not.toHaveBeenCalled();
});

it('maps canonical API validation errors to the exact supplier input', async () => {
  create.mockRejectedValue({
    response: { data: { detail: [{ loc: ['body', 'pan_number'], msg: 'PAN format is invalid' }] } },
  });
  render(<SupplierFlow open />);
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '9876543210' } });

  fireEvent.click(screen.getByRole('button', { name: 'Save Supplier' }));

  expect(await screen.findByText('PAN format is invalid', { selector: 'p' })).toBeTruthy();
  expect(screen.getByLabelText('PAN')).toHaveAttribute('aria-invalid', 'true');
  await waitFor(() => expect(screen.getByLabelText('PAN')).toHaveFocus());
});
