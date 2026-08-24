import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import apiClient from '../../services/api/apiClient';
import CollectionCenter from './CollectionCenter';

jest.mock('../global', () => ({ ModuleHeader: () => null }));

jest.mock('../../services/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe('Collection Center failure transparency', () => {
  it('does not render zero metrics while authoritative balances are loading', () => {
    (apiClient.get as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <CollectionCenter embedded />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Loading authoritative collection balances...')).toBeTruthy();
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });

  it('shows an actionable error instead of fake zero balances', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('server failed'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <CollectionCenter embedded />
      </QueryClientProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toContain('Collection data is unavailable');
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });

  it('enables each communication CTA only when canonical contact data exists', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: {
      summary: {
        totalOutstanding: '9007199254740993.01',
        overdueAmount: '60.00',
        currentDayCollections: '10.00',
        currentMonthCollections: '25.00',
        collectionEfficiency: null,
      },
      parties: [{
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Canonical Buyer',
        phone: '9876543210',
        email: 'buyer@example.com',
        outstandingAmount: '9007199254740993.01',
        overdueAmount: '60.00',
        daysOverdue: 45,
        agingStatus: 'overdue',
        agingBand: '31-60',
      }],
    } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <CollectionCenter />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Canonical Buyer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'WhatsApp Canonical Buyer' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Email Canonical Buyer' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Call Canonical Buyer' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Send SMS to Canonical Buyer' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getAllByText('₹9,00,71,99,25,47,40,993.01').length).toBeGreaterThan(0);
    expect(screen.getByText('Unavailable')).toBeTruthy();
  });
});
