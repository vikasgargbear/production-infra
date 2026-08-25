/**
 * Customers API Module
 * Handles customer CRUD and related operations
 *
 * ENDPOINTS: /customers (backend: app/api/routes/master/customers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { normalizeExactDecimal } from '../../../../utils/exactDecimal';
import { decodeCanonicalCustomerList } from './canonicalMasterReads';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomerParams {
  limit?: number;
  offset?: number;
  search?: string;
  has_outstanding?: boolean;
  include_credit?: boolean;
}

export interface CanonicalCustomerCreateInput {
  customer_name: string;
  customer_code?: string;
  customer_type: 'individual' | 'organization';
  primary_phone: string;
  primary_email?: string;
  contact_person_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
  pan_number?: string;
  credit_limit: string;
  credit_days: number;
}

const firstDefined = (...values: unknown[]): unknown => values.find(value => value !== undefined && value !== null);
const optionalText = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);
const canonicalPhone = (value: unknown): string => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

/** Keep the browser write boundary aligned with the reviewed canonical schema. */
export const toCanonicalCustomerCreate = (input: Record<string, any>): CanonicalCustomerCreateInput => {
  const address = input.address && typeof input.address === 'object' ? input.address : {};
  if (input.customer_type !== 'individual' && input.customer_type !== 'organization') {
    throw new Error('Customer type must be selected explicitly.');
  }
  if (input.credit_limit === undefined || input.credit_limit === null || input.credit_limit === '') {
    throw new Error('Customer credit limit must be entered explicitly.');
  }
  if (input.credit_days === undefined || input.credit_days === null || input.credit_days === '') {
    throw new Error('Customer credit days must be entered explicitly.');
  }
  const payload = {
    customer_name: input.customer_name,
    customer_code: input.customer_code,
    customer_type: input.customer_type,
    primary_phone: canonicalPhone(input.primary_phone),
    primary_email: firstDefined(input.primary_email, input.email),
    contact_person_name: input.contact_person_name,
    address_line1: firstDefined(input.address_line1, address.address_line1),
    address_line2: firstDefined(input.address_line2, address.address_line2),
    city: firstDefined(input.city, address.city),
    state: firstDefined(input.state, address.state),
    pincode: firstDefined(input.pincode, address.pincode),
    gst_number: optionalText(input.gst_number)?.toUpperCase(),
    pan_number: optionalText(input.pan_number)?.toUpperCase(),
    credit_limit: normalizeExactDecimal(
      input.credit_limit,
      'Customer credit limit',
      { scale: 2, maximumWholeDigits: 18 },
    ),
    credit_days: input.credit_days,
  };
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  ) as unknown as CanonicalCustomerCreateInput;
};

// ============================================================================
// API
// ============================================================================

export const customersApi = {
  getAll: (params: CustomerParams = {}) => apiHelpers.get('/customers', { params })
    .then(response => ({ ...response, data: decodeCanonicalCustomerList(response.data) })),

  create: (data: Record<string, any>) => {
    return apiHelpers.post('/customers/', toCanonicalCustomerCreate(data));
  },

  // Customer-account edits and lifecycle changes do not yet have a reviewed
  // canonical command. Keep every caller away from the retired CRUD routes.
  update: (_id: number | string, _data: Record<string, any>) =>
    rejectCanonicalWrite('Editing a customer'),
  delete: (_id: number | string) => rejectCanonicalWrite('Deleting a customer'),

  // Create a customer address through the live API
  createAddress: (customerId: string, addressData: any) => {
    const cleanedData = cleanData(addressData);
    return apiHelpers.post(`/customers/${customerId}/addresses/`, cleanedData);
  },

  updateAddress: (customerId: string, addressId: string, addressData: any) => {
    const cleanedData = cleanData(addressData);
    return apiHelpers.put(`/customers/${customerId}/addresses/${addressId}`, cleanedData);
  },

  // Search customers
  search: (query: string, params: CustomerParams = {}) => {
    return apiHelpers.get('/customers', {
      params: { search: query, ...params }
    }).then(response => ({ ...response, data: decodeCanonicalCustomerList(response.data) }));
  },
};
