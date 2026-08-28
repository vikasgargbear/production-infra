import {
  decodeCanonicalCustomerCreateResponse,
  decodeCanonicalProductDraftCreateResponse,
  decodeCanonicalSupplierCreateResponse,
  masterCreateRequestConfig,
  newMasterCreateIdempotencyKey,
} from './masterCreationContract';

const ids = {
  customer: '11111111-1111-7111-8111-111111111111',
  supplier: '22222222-2222-7222-8222-222222222222',
  product: '33333333-3333-7333-8333-333333333333',
  party: '44444444-4444-7444-8444-444444444444',
};

describe('backend-generated master identity contract', () => {
  it.each(['customer', 'supplier', 'product'] as const)(
    'creates a bounded %s attempt key and sends the reviewed header',
    kind => {
      const key = newMasterCreateIdempotencyKey(kind);
      expect(key).toMatch(new RegExp(`^erp-web-master-${kind}-create:[0-9a-f-]{36}$`, 'i'));
      expect(key.length).toBeLessThanOrEqual(128);
      expect(masterCreateRequestConfig(key)).toEqual({
        headers: { 'X-Idempotency-Key': key },
      });
    },
  );

  it('rejects malformed or unbounded attempt identities', () => {
    expect(() => masterCreateRequestConfig('customer:1')).toThrow();
    expect(() => masterCreateRequestConfig(`erp-web-master-customer-create:${'a'.repeat(200)}`)).toThrow();
  });

  it('requires canonical UUIDs and generated codes in party responses', () => {
    expect(decodeCanonicalCustomerCreateResponse({
      customer_id: ids.customer, party_id: ids.party,
      customer_code: 'C-100', customer_name: 'Customer',
      customer_type: 'organization', primary_phone: '9876543210',
      is_active: true, status: 'active', message: 'Created',
    }).customer_code).toBe('C-100');
    expect(decodeCanonicalSupplierCreateResponse({
      supplier_id: ids.supplier, party_id: ids.party,
      supplier_code: 'S-100', supplier_name: 'Supplier',
      is_active: true, status: 'active', message: 'Created',
    }).supplier_id).toBe(ids.supplier);

    expect(() => decodeCanonicalCustomerCreateResponse({
      customer_id: '17', party_id: ids.party, customer_code: 'C-1',
      customer_name: 'Customer', customer_type: 'organization', primary_phone: '9876543210',
      is_active: true, status: 'active', message: 'Created',
    })).toThrow('canonical UUID');
    expect(() => decodeCanonicalSupplierCreateResponse({
      supplier_id: ids.supplier, party_id: ids.party, supplier_code: ' ',
      supplier_name: 'Supplier', is_active: true, status: 'active', message: 'Created',
    })).toThrow('Generated supplier code is required');
  });

  it('requires a generated code and draft lifecycle in product responses', () => {
    expect(decodeCanonicalProductDraftCreateResponse({
      product_id: ids.product, product_code: 'P-100', product_name: 'Product',
      lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
    })).toEqual({
      product_id: ids.product, product_code: 'P-100', product_name: 'Product',
      lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
    });
    expect(() => decodeCanonicalProductDraftCreateResponse({
      product_id: ids.product, product_code: '', product_name: 'Product',
      lifecycle_status: 'draft', row_version: 1, message: 'Draft created',
    })).toThrow('Generated product code is required');
    expect(() => decodeCanonicalProductDraftCreateResponse({
      product_id: ids.product, product_code: 'P-100', product_name: 'Product',
      lifecycle_status: 'active', row_version: 1, message: 'Created',
    })).toThrow('must remain a draft');
    expect(() => decodeCanonicalProductDraftCreateResponse({
      product_id: ids.product, product_code: 'P-100', product_name: 'Product',
      lifecycle_status: 'draft', message: 'Draft created',
    })).toThrow('row version is invalid');
  });
});
