import { apiHelpers } from '../api/apiClient';
import { branchesApi } from '../api/modules/org/branches.api';
import { productsApi } from '../api/modules/master/products.api';
import { customersApi } from '../api/modules/master/customers.api';
import { suppliersApi } from '../api/modules/master/suppliers.api';
import { batchesApi } from '../api/modules/inventory/batches.api';

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

  it('uses only bounded canonical master authoring paths', async () => {
    productsApi.create({ product_name: 'E2E product', product_kind: 'medicine' });
    suppliersApi.create({ supplier_name: 'E2E supplier', payment_days: 30 });
    await expect(branchesApi.create({ branch_name: 'E2E branch' })).rejects.toMatchObject({
      code: 'CANONICAL_WRITE_UNAVAILABLE',
    });

    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, '/products/', {
      product_name: 'E2E product',
      product_kind: 'medicine',
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2, '/suppliers/', {
      supplier_name: 'E2E supplier',
      payment_days: 30,
    });
    expect(apiHelpers.post).toHaveBeenCalledTimes(2);
  });

  it('preserves canonical UUID product identifiers in batch reads', () => {
    const productId = '11111111-2222-4333-8444-555555555555';

    batchesApi.getByProduct(productId);

    expect(apiHelpers.get).toHaveBeenCalledWith(`/products/${productId}/batches`);
  });

  it('keeps the complete bounded canonical master authoring set effective', () => {
    const productId = '11111111-1111-7111-8111-111111111111';
    const customerId = '22222222-2222-7222-8222-222222222222';
    const addressId = '33333333-3333-7333-8333-333333333333';

    productsApi.update(productId, { product_name: 'Renamed draft' });
    productsApi.delete(productId);
    customersApi.create({
      customer_name: 'E2E customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
    });
    const address = {
      address_line1: 'Test lane', city: 'Pune', state_code: '27', pincode: '411001',
      address_type: 'billing', is_default: true,
    };
    customersApi.createAddress(customerId, address);
    customersApi.updateAddress(customerId, addressId, address);

    expect(apiHelpers.put).toHaveBeenNthCalledWith(1, `/products/${productId}`, {
      product_name: 'Renamed draft',
    });
    expect(apiHelpers.delete).toHaveBeenCalledWith(`/products/${productId}`);
    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, '/customers/', {
      customer_name: 'E2E customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(
      2, `/customers/${customerId}/addresses/`, address,
    );
    expect(apiHelpers.put).toHaveBeenNthCalledWith(
      2, `/customers/${customerId}/addresses/${addressId}`, address,
    );
  });
});
