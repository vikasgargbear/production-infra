import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import apiClient from '../../services/api/apiClient';
import Outstanding from './Outstanding';

jest.mock('../global', () => ({ ModuleHeader: () => null }));
jest.mock('../payment/shared/PaymentAllocationModal', () => () => null);
jest.mock('../../services/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const renderOutstanding = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Outstanding />
    </QueryClientProvider>,
  );
};

describe('Outstanding authoritative states', () => {
  it('does not show fake zero summaries while canonical balances are loading', () => {
    (apiClient.get as jest.Mock).mockReturnValue(new Promise(() => undefined));
    renderOutstanding();

    expect(screen.getByText('Loading outstanding data...')).toBeTruthy();
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });

  it('shows a transparent retry state instead of a contradictory zero balance', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('server failed'));
    renderOutstanding();

    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent)
      .toContain('Outstanding data is unavailable');
    expect(screen.queryByText('Total Outstanding')).toBeNull();
  });
});
