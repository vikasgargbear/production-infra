import { clientUuid } from '../../../../utils/clientUuid';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

export type MasterEntityKind = 'customer' | 'supplier' | 'product';

const IDEMPOTENCY_KEY_PATTERN = /^erp-web-master-(customer|supplier|product)-create:[0-9a-f-]{36}$/i;

export const newMasterCreateIdempotencyKey = (kind: MasterEntityKind): string => (
  `erp-web-master-${kind}-create:${clientUuid()}`
);

export const masterCreateRequestConfig = (idempotencyKey: string) => {
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) || idempotencyKey.length > 128) {
    throw new Error('Master creation requires a bounded browser-generated idempotency key.');
  }
  return { headers: { 'X-Idempotency-Key': idempotencyKey } };
};

type JsonRecord = Record<string, unknown>;

const record = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
};

const uuid = (value: unknown, label: string): string => {
  if (!isCanonicalUuid(value)) throw new Error(`${label} must be a canonical UUID`);
  return String(value);
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
};

export interface CanonicalCustomerCreateResponse {
  customer_id: string;
  party_id: string;
  customer_code: string;
  customer_name: string;
  customer_type: 'individual' | 'organization';
  primary_phone: string;
  is_active: true;
  status: 'active';
  message: string;
  [key: string]: unknown;
}

export const decodeCanonicalCustomerCreateResponse = (
  value: unknown,
): CanonicalCustomerCreateResponse => {
  const payload = record(value, 'Customer creation response');
  if (payload.status !== 'active') throw new Error('Created customer must be active');
  if (payload.is_active !== true) throw new Error('Created customer must be active');
  if (payload.customer_type !== 'individual' && payload.customer_type !== 'organization') {
    throw new Error('Created customer type is invalid');
  }
  return {
    ...payload,
    customer_id: uuid(payload.customer_id, 'Created customer identity'),
    party_id: uuid(payload.party_id, 'Created customer party identity'),
    customer_code: text(payload.customer_code, 'Generated customer code'),
    customer_name: text(payload.customer_name, 'Created customer name'),
    customer_type: payload.customer_type,
    primary_phone: text(payload.primary_phone, 'Created customer phone'),
    is_active: true,
    status: 'active',
    message: text(payload.message, 'Customer creation message'),
  };
};

export interface CanonicalSupplierCreateResponse {
  supplier_id: string;
  party_id: string;
  supplier_code: string;
  supplier_name: string;
  is_active: true;
  status: 'active';
  message: string;
  [key: string]: unknown;
}

export const decodeCanonicalSupplierCreateResponse = (
  value: unknown,
): CanonicalSupplierCreateResponse => {
  const payload = record(value, 'Supplier creation response');
  if (payload.status !== 'active') throw new Error('Created supplier must be active');
  if (payload.is_active !== true) throw new Error('Created supplier must be active');
  return {
    ...payload,
    supplier_id: uuid(payload.supplier_id, 'Created supplier identity'),
    party_id: uuid(payload.party_id, 'Created supplier party identity'),
    supplier_code: text(payload.supplier_code, 'Generated supplier code'),
    supplier_name: text(payload.supplier_name, 'Created supplier name'),
    is_active: true,
    status: 'active',
    message: text(payload.message, 'Supplier creation message'),
  };
};

export interface CanonicalProductDraftCreateResponse {
  product_id: string;
  product_code: string;
  product_name: string;
  lifecycle_status: 'draft';
  message: string;
}

export const decodeCanonicalProductDraftCreateResponse = (
  value: unknown,
): CanonicalProductDraftCreateResponse => {
  const payload = record(value, 'Product creation response');
  if (payload.lifecycle_status !== 'draft') {
    throw new Error('Created product must remain a draft until reviewed activation');
  }
  return {
    product_id: uuid(payload.product_id, 'Created product identity'),
    product_code: text(payload.product_code, 'Generated product code'),
    product_name: text(payload.product_name, 'Created product name'),
    lifecycle_status: 'draft',
    message: text(payload.message, 'Product creation message'),
  };
};
