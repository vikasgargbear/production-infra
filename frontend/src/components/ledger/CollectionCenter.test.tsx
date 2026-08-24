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
});
