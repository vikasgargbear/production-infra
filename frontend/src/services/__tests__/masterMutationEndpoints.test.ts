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
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('canonical master mutation endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiHelpers.post as jest.Mock)
      .mockResolvedValueOnce({ data: {
        product_id: '11111111-1111-7111-8111-111111111111',
        product_code: 'GENERATED-PRODUCT', product_name: 'E2E product',
        lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
      } })
      .mockResolvedValueOnce({ data: {
        supplier_id: '22222222-2222-7222-8222-222222222222',
        party_id: '33333333-3333-7333-8333-333333333333',
        supplier_code: 'GENERATED-SUPPLIER', supplier_name: 'E2E supplier',
        is_active: true, status: 'active', message: 'Supplier created',
      } });
  });

  it('uses only bounded canonical master authoring paths', async () => {
    await productsApi.create(
      { product_name: 'E2E product', product_kind: 'medicine' },
      'erp-web-master-product-create:11111111-1111-4111-8111-111111111111',
    );
    await suppliersApi.create(
      { supplier_name: 'E2E supplier', payment_days: 30 },
      'erp-web-master-supplier-create:22222222-2222-4222-8222-222222222222',
    );
    await expect(branchesApi.create({ branch_name: 'E2E branch' })).rejects.toMatchObject({
      code: 'CANONICAL_WRITE_UNAVAILABLE',
    });

    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, '/products/', {
      product_name: 'E2E product',
      product_kind: 'medicine',
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-product-create:11111111-1111-4111-8111-111111111111' } });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2, '/suppliers/', {
      supplier_name: 'E2E supplier',
      payment_days: 30,
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-supplier-create:22222222-2222-4222-8222-222222222222' } });
    expect(apiHelpers.post).toHaveBeenCalledTimes(2);
  });

  it('preserves canonical UUID product identifiers in batch reads', () => {
    const productId = '11111111-2222-4333-8444-555555555555';

    batchesApi.getByProduct(productId);

    expect(apiHelpers.get).toHaveBeenCalledWith(`/products/${productId}/batches`, {
      preserveExactDecimals: true,
    });
  });

  it('patches party accounts with versions and bounded replay keys', () => {
    const customerId = '22222222-2222-7222-8222-222222222222';
    const supplierId = '33333333-3333-7333-8333-333333333333';

    customersApi.update(customerId, {
      account_row_version: 2,
      party_row_version: 4,
      primary_email: null,
      pan_number: 'abcde1234f',
    }, 'erp-web-master-customer-update:11111111-1111-4111-8111-111111111111');
    suppliersApi.update(supplierId, {
      account_row_version: 3,
      party_row_version: 5,
      primary_phone: null,
      payment_days: 45,
    }, 'erp-web-master-supplier-update:22222222-2222-4222-8222-222222222222');

    expect(apiHelpers.patch).toHaveBeenNthCalledWith(1, `/customers/${customerId}`, {
      account_row_version: 2,
      party_row_version: 4,
      primary_email: null,
      pan_number: 'ABCDE1234F',
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-customer-update:11111111-1111-4111-8111-111111111111' } });
    expect(apiHelpers.patch).toHaveBeenNthCalledWith(2, `/suppliers/${supplierId}`, {
      account_row_version: 3,
      party_row_version: 5,
      primary_phone: null,
      payment_days: 45,
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-supplier-update:22222222-2222-4222-8222-222222222222' } });
  });

  it('keeps the complete bounded canonical master authoring set effective', async () => {
    const productId = '11111111-1111-7111-8111-111111111111';
    const customerId = '22222222-2222-7222-8222-222222222222';
    const addressId = '33333333-3333-7333-8333-333333333333';

    productsApi.update(productId, { row_version: 3, product_name: 'Renamed draft' });
    productsApi.saveSetup(productId, {
      row_version: 4,
      manufacturer_party_id: '44444444-4444-7444-8444-444444444444',
      base_uom_code: 'EA',
      hsn_code: '3004',
      cold_chain_required: false,
      pack_conversions: [],
      ingredients: [],
    }, 'erp-web-master-product-setup:66666666-6666-4666-8666-666666666666');
    productsApi.delete(productId, 3);
    (apiHelpers.post as jest.Mock).mockReset()
      .mockResolvedValueOnce({ data: {
        product_id: productId, product_code: 'GENERATED-PRODUCT',
        product_name: 'E2E product', row_version: 5,
        lifecycle_status: 'active', message: 'Product activated',
      } })
      .mockResolvedValueOnce({ data: {
      customer_id: customerId,
      party_id: '44444444-4444-7444-8444-444444444444',
      customer_code: 'GENERATED-CUSTOMER', customer_name: 'E2E customer',
      customer_type: 'organization', primary_phone: '9876543210',
      is_active: true, status: 'active', message: 'Customer created',
    } }).mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);
    await productsApi.activate(
      productId,
      4,
      'erp-web-master-product-activate:55555555-5555-4555-8555-555555555555',
    );
    await customersApi.create({
      customer_name: 'E2E customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
    }, 'erp-web-master-customer-create:33333333-3333-4333-8333-333333333333');
    const address = {
      address_line1: 'Test lane', city: 'Pune', state_code: '27', pincode: '411001',
      address_type: 'billing', is_default: true,
    };
    customersApi.createAddress(customerId, address);
    customersApi.updateAddress(customerId, addressId, { ...address, row_version: 4 });

    expect(apiHelpers.put).toHaveBeenNthCalledWith(1, `/products/${productId}`, {
      row_version: 3,
      product_name: 'Renamed draft',
    });
    expect(apiHelpers.put).toHaveBeenNthCalledWith(2, `/products/${productId}/setup`, {
      row_version: 4,
      manufacturer_party_id: '44444444-4444-7444-8444-444444444444',
      base_uom_code: 'EA',
      hsn_code: '3004',
      cold_chain_required: false,
      pack_conversions: [],
      ingredients: [],
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-product-setup:66666666-6666-4666-8666-666666666666' } });
    expect(apiHelpers.delete).toHaveBeenCalledWith(`/products/${productId}`, {
      params: { row_version: 3 },
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, `/products/${productId}/activate`, {
      row_version: 4,
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-product-activate:55555555-5555-4555-8555-555555555555' } });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2, '/customers/', {
      customer_name: 'E2E customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
    }, { headers: { 'X-Idempotency-Key': 'erp-web-master-customer-create:33333333-3333-4333-8333-333333333333' } });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(
      3, `/customers/${customerId}/addresses/`, address,
    );
    expect(apiHelpers.put).toHaveBeenNthCalledWith(
      3, `/customers/${customerId}/addresses/${addressId}`, {
        ...address,
        row_version: 4,
      },
    );
  });
});
