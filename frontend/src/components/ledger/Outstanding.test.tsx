import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { apiHelpers } from '../../services/api/apiClient';
import Outstanding from './Outstanding';

jest.mock('../global', () => ({
  ModuleHeader: () => null,
  Select: ({ value, onChange, options }: any) => (
    <select aria-label="Outstanding status" value={value} onChange={event => onChange(event.target.value)}>
      {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));
jest.mock('../../services/api/apiClient', () => ({
  __esModule: true,
  default: {},
  apiHelpers: { get: jest.fn() },
}));

const renderOutstanding = (props: React.ComponentProps<typeof Outstanding> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Outstanding {...props} />
    </QueryClientProvider>,
  );
};

describe('Outstanding authoritative states', () => {
  it('does not show fake zero summaries while canonical balances are loading', () => {
    (apiHelpers.get as jest.Mock).mockReturnValue(new Promise(() => undefined));
    renderOutstanding();

    expect(screen.getByText('Loading outstanding data...')).toBeTruthy();
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });

  it('shows a transparent retry state instead of a contradictory zero balance', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (apiHelpers.get as jest.Mock).mockRejectedValue(new Error('server failed'));
    renderOutstanding();

    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent)
      .toContain('Outstanding data is unavailable');
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });

  it('renders embedded supplier aging instead of a blank or unavailable module', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
      contract_version: '1.0.0', currency_code: 'INR', party_type: 'supplier',
      as_of_date: '2026-08-25', parties: [],
      summary: {
        total_outstanding: '0.00', total_overdue: '0.00', party_count: 0,
        document_count: 0, buckets: {
          current: { amount: '0.00', document_count: 0 },
          '1-30': { amount: '0.00', document_count: 0 },
          '31-60': { amount: '0.00', document_count: 0 },
          '61-90': { amount: '0.00', document_count: 0 },
          over_90: { amount: '0.00', document_count: 0 },
        },
      },
    } });

    renderOutstanding({ embedded: true, partyType: 'supplier' });

    expect(await screen.findByText('Total Outstanding')).toBeTruthy();
    expect(screen.getByLabelText('Search outstanding parties')).toBeTruthy();
    expect(screen.queryByText('Supplier outstanding is not available yet')).toBeNull();
    expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/party-aging', {
      params: { party_type: 'supplier' },
      preserveExactDecimals: true,
    });
  });
});
