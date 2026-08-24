/**
 * Customers API Module
 * Handles customer CRUD and related operations
 *
 * ENDPOINTS: /customers (backend: app/api/routes/master/customers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { createCrudApi } from '../../utils/createCrudApi';

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
  customer_type?: string;
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
  credit_limit?: number;
  credit_days?: number;
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
  return cleanData({
    customer_name: input.customer_name,
    customer_code: input.customer_code,
    customer_type: input.customer_type || 'retail',
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
    credit_limit: input.credit_limit ?? 0,
    credit_days: input.credit_days ?? 0,
  }) as CanonicalCustomerCreateInput;
};

// ============================================================================
// API
// ============================================================================

const crud = createCrudApi({ basePath: '/customers', createPath: '/customers/' });

export const customersApi = {
  ...crud,

  create: (data: Record<string, any>) => {
    return apiHelpers.post('/customers/', toCanonicalCustomerCreate(data));
  },

  // Get customers with embedded addresses from the live API
  getAllWithAddresses: (params: any = {}) => {
    return apiHelpers.get('/customers/all-with-addresses', { params });
  },

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
    });
  },

  // Get customers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get('/customers', {
      params: { has_outstanding: true }
    });
  },

  // Check customer credit
  checkCredit: (customerId: number | string) => {
    return apiHelpers.get('/customers/credit-check', {
      params: { customer_id: customerId }
    });
  },

  // Update credit limit
  updateCreditLimit: (customerId: number | string, creditLimit: number) => {
    return apiHelpers.patch(`/customers/${customerId}`, {
      credit_limit: creditLimit
    });
  },

  // Get customer ledger
  getLedger: (customerId: number | string, dateFrom?: string, dateTo?: string) => {
    return apiHelpers.get(`/customers/${customerId}/ledger`, {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get customer outstanding balance
  getOutstandingBalance: (customerId: number | string) => {
    return apiHelpers.get(`/customers/${customerId}/outstanding`);
  },

  // Get all customers with outstanding amounts
  getOutstanding: () => {
    return apiHelpers.get('/customers/outstanding');
  },

  // Get customer transactions
  getTransactions: (customerId: number | string, params: any = {}) => {
    return apiHelpers.get(`/customers/${customerId}/transactions`, { params });
  },

  // Send SMS to customer
  sendSMS: (customerId: number | string, message: string) => {
    return apiHelpers.post(`/customers/${customerId}/sms`, { message });
  }
};
