import { apiHelpers } from '../../apiClient';
import { productsApi } from './products.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

describe('canonical product search transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiHelpers.get as jest.Mock).mockResolvedValue({
      data: { products: [], total: 0, limit: 25, offset: 0 },
    });
  });

  it('preserves exact product rates and stock quantities before decoding', async () => {
    await productsApi.search('paracetamol', { limit: 25, include_inactive: true });

    expect(apiHelpers.get).toHaveBeenCalledWith('/products', {
      params: { search: 'paracetamol', limit: 25, include_inactive: true },
      preserveExactDecimals: true,
    });
  });
});
