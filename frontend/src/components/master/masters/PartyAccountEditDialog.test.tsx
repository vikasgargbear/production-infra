import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PartyAccountEditDialog, { type EditablePartyAccount } from './PartyAccountEditDialog';
import { customersApi } from '../../../services/api/modules/master/customers.api';
import { suppliersApi } from '../../../services/api/modules/master/suppliers.api';

jest.mock('../../../services/api/modules/master/customers.api', () => ({
  customersApi: { update: jest.fn() },
}));
jest.mock('../../../services/api/modules/master/suppliers.api', () => ({
  suppliersApi: { update: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn() } }));

const CUSTOMER: EditablePartyAccount = {
  customer_id: 'd3000000-0000-7000-8000-000000000011',
  customer_name: 'Canonical Customer',
  customer_type: 'organization',
  primary_phone: '9876543210',
  primary_email: 'customer@example.test',
  contact_person_name: 'Customer Contact',
  pan_number: 'ABCDE1234F',
  credit_limit: '100.00',
  credit_days: 7,
  account_row_version: 2,
  party_row_version: 4,
};

const renderCustomer = () => render(
  <PartyAccountEditDialog
    kind="customer"
    account={CUSTOMER}
    onClose={jest.fn()}
    onSaved={jest.fn()}
  />,
);

beforeEach(() => jest.clearAllMocks());

test.each([
  ['Phone', '123', 'Enter the exact 10-digit customer phone number.'],
  ['Email', 'not-an-email', 'Enter a valid email address.'],
  ['PAN', 'ABCDE1234', 'Enter PAN as 5 letters, 4 digits, and 1 letter.'],
])('shows the %s error beside and focuses that exact field', (label, value, message) => {
  renderCustomer();
  const field = screen.getByLabelText(label);
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save canonical update' }));

  expect(screen.getByText(message)).toBeInTheDocument();
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute('aria-invalid', 'true');
});

test('sends only changed fields with both optimistic versions and a bounded key', async () => {
  (customersApi.update as jest.Mock).mockResolvedValue({ data: {} });
  const onSaved = jest.fn();
  const onClose = jest.fn();
  render(
    <PartyAccountEditDialog
      kind="customer"
      account={CUSTOMER}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

  fireEvent.change(screen.getByLabelText('Legal name'), {
    target: { value: 'Canonical Customer Revised' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save canonical update' }));

  await waitFor(() => expect(customersApi.update).toHaveBeenCalledTimes(1));
  expect(customersApi.update).toHaveBeenCalledWith(
    CUSTOMER.customer_id,
    {
      account_row_version: 2,
      party_row_version: 4,
      customer_name: 'Canonical Customer Revised',
    },
    expect.stringMatching(/^erp-web-master-customer-update:[0-9a-f-]{36}$/),
  );
  expect(suppliersApi.update).not.toHaveBeenCalled();
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(onClose).toHaveBeenCalled();
});

test('focuses phone when clearing the supplier’s final contact endpoint', () => {
  render(
    <PartyAccountEditDialog
      kind="supplier"
      account={{
        supplier_id: 'd3000000-0000-7000-8000-000000000012',
        supplier_name: 'Canonical Supplier', primary_phone: '9876543210',
        primary_email: null, payment_days: 30,
        account_row_version: 1, party_row_version: 1,
      }}
      onClose={jest.fn()}
      onSaved={jest.fn()}
    />,
  );
  const phone = screen.getByLabelText('Phone');
  fireEvent.change(phone, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save canonical update' }));

  expect(screen.getByText('Keep either a supplier phone number or email address.')).toBeInTheDocument();
  expect(phone).toHaveFocus();
});
