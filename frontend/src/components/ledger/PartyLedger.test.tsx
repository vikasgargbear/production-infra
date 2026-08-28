import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartyLedger from './PartyLedger';
import { ledgerApi } from '../../services/api';

const accountId = 'd3000000-0000-7000-8000-000000000001';
const partyId = 'd3000000-0000-7000-8000-000000000002';
const controlId = 'd3000000-0000-7000-8000-000000000003';

jest.mock('../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <div>{title}</div>,
  CustomerSearch: ({ onChange }: any) => <button onClick={() => onChange({ customer_id: accountId, customer_name: 'Exact Customer' })}>Select customer</button>,
  SupplierSearch: () => null,
}));
jest.mock('../../services/api', () => ({ ledgerApi: { getCanonicalPartyStatement: jest.fn() } }));

const api = ledgerApi.getCanonicalPartyStatement as jest.Mock;
const response = () => ({
  data: {
    party_account_id: accountId, party_id: partyId, party_type: 'customer', party_name: 'Exact Customer',
    account_id: controlId, currency_code: 'INR', date_from: '2026-08-01', date_to: '2026-08-31',
    opening_balance: '9007199254740993.00', page_opening_balance: '9007199254740993.00',
    closing_balance: '9007199254740993.00', total_debit: '0.00', total_credit: '0.00',
    items: [], page: 1, page_size: 100, total: 0,
  },
});

const renderLedger = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PartyLedger /></QueryClientProvider>);
};

beforeEach(() => { api.mockReset(); });

it('loads the mounted statement through the UUID canonical API and renders exact money', async () => {
  api.mockResolvedValue(response()); renderLedger();
  fireEvent.click(screen.getByRole('button', { name: 'Select customer' }));
  expect(await screen.findByText('Exact Customer')).toBeTruthy();
  expect(screen.getAllByText('₹9,00,71,99,25,47,40,993.00')).toHaveLength(2);
  expect(api).toHaveBeenCalledWith(accountId, expect.objectContaining({ party_type: 'customer', page: 1, page_size: 100 }));
});

it('fails closed when the API serializes authoritative money as a number', async () => {
  const invalid = response(); invalid.data.opening_balance = 0 as unknown as string;
  api.mockResolvedValue(invalid); renderLedger();
  fireEvent.click(screen.getByRole('button', { name: 'Select customer' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No balance has been estimated'), { timeout: 3000 });
  expect(screen.queryByText('₹0.00')).toBeNull();
});
