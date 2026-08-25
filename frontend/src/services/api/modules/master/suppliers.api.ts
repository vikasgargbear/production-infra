/**
 * Suppliers API Module
 * Handles supplier CRUD and related operations
 *
 * ENDPOINTS: /suppliers (backend: app/api/routes/master/suppliers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { decodeCanonicalSupplierList } from './canonicalMasterReads';

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierParams {
  limit?: number;
  offset?: number;
  search?: string;
  has_outstanding?: boolean;
}

export interface CanonicalSupplierCreateInput {
  supplier_name: string;
  supplier_code?: string;
  primary_phone?: string;
  primary_email?: string;
  contact_person?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
  pan_number?: string;
  payment_days?: number;
}

const firstDefined = (...values: unknown[]): unknown => values.find(value => value !== undefined && value !== null);
const optionalText = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);
const canonicalPhone = (value: unknown): string | undefined => {
  const text = optionalText(value);
  if (!text) return undefined;
  const digits = text.replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

/** Strip legacy UI aliases and fields owned by separate reviewed workflows. */
export const toCanonicalSupplierCreate = (input: Record<string, any>): CanonicalSupplierCreateInput => {
  const rawPaymentDays = firstDefined(input.payment_days, input.credit_days, input.payment_terms, 30);
  const parsedPaymentDays = Number.parseInt(String(rawPaymentDays), 10);
  return cleanData({
    supplier_name: firstDefined(input.supplier_name, input.name),
    supplier_code: firstDefined(input.supplier_code, input.code),
    primary_phone: canonicalPhone(firstDefined(input.primary_phone, input.phone)),
    primary_email: firstDefined(input.primary_email, input.email),
    contact_person: input.contact_person,
    address_line1: firstDefined(input.address_line1, input.address),
    address_line2: input.address_line2,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    gst_number: optionalText(input.gst_number)?.toUpperCase(),
    pan_number: optionalText(input.pan_number)?.toUpperCase(),
    payment_days: Number.isFinite(parsedPaymentDays) ? parsedPaymentDays : 30,
  }) as CanonicalSupplierCreateInput;
};

// ============================================================================
// API
// ============================================================================

export const suppliersApi = {
  getAll: (params: SupplierParams = {}) => apiHelpers.get('/suppliers', { params })
    .then(response => ({ ...response, data: decodeCanonicalSupplierList(response.data) })),

  create: (data: Record<string, any>) => {
    return apiHelpers.post('/suppliers/', toCanonicalSupplierCreate(data));
  },

  update: (_id: number | string, _data: any) => rejectCanonicalWrite('Editing a supplier'),
  delete: (_id: number | string) => rejectCanonicalWrite('Deleting a supplier'),

  // Search suppliers
  search: (query: string, params: SupplierParams = {}) => {
    return apiHelpers.get('/suppliers', {
      params: { search: query, ...params }
    }).then(response => ({ ...response, data: decodeCanonicalSupplierList(response.data) }));
  },
};
