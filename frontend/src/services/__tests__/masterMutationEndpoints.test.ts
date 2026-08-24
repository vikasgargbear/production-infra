import { apiHelpers } from '../api/apiClient';
import { branchesApi } from '../api/modules/org/branches.api';
import { productsApi } from '../api/modules/master/products.api';
import { suppliersApi } from '../api/modules/master/suppliers.api';

jest.mock('../api/apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('canonical master mutation endpoints', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the backend POST path instead of the canonical read-only path', () => {
    productsApi.create({ product_name: 'E2E product' });
    suppliersApi.create({ supplier_name: 'E2E supplier' });
    branchesApi.create({ branch_name: 'E2E branch' });

    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, '/products/', {
      product_name: 'E2E product',
      product_kind: 'medicine',
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2, '/suppliers/', {
      supplier_name: 'E2E supplier',
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(3, '/branches/', {
      branch_name: 'E2E branch',
    });
  });
});
