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
import { canonicalStateCode, gstinStateCodeError } from './partyStateCode';

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
  supplier_code: string;
  primary_phone?: string;
  primary_email?: string;
  contact_person?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_code?: string;
  pincode?: string;
  gst_number?: string;
  pan_number?: string;
  payment_days: number;
}

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
  if (input.state !== undefined) {
    throw new Error('State names are not accepted; enter the 2-digit GST state code.');
  }
  const supplierCode = optionalText(input.supplier_code);
  if (!supplierCode) {
    throw new Error('Supplier code is required.');
  }
  const rawPaymentDays = input.payment_days;
  if (rawPaymentDays === undefined || rawPaymentDays === '') {
    throw new Error('Supplier payment days must be selected explicitly.');
  }
  const parsedPaymentDays = Number.parseInt(String(rawPaymentDays), 10);
  if (!Number.isInteger(parsedPaymentDays) || parsedPaymentDays < 0 || parsedPaymentDays > 180) {
    throw new Error('Supplier payment days must be an integer from 0 to 180.');
  }
  const stateCode = canonicalStateCode(input.state_code);
  const gstNumber = optionalText(input.gst_number)?.toUpperCase();
  const mismatch = gstinStateCodeError(stateCode, gstNumber);
  if (mismatch) throw new Error(mismatch);
  return cleanData({
    supplier_name: input.supplier_name,
    supplier_code: supplierCode,
    primary_phone: canonicalPhone(input.primary_phone),
    primary_email: input.primary_email,
    contact_person: input.contact_person,
    address_line1: input.address_line1,
    address_line2: input.address_line2,
    city: input.city,
    state_code: stateCode,
    pincode: input.pincode,
    gst_number: gstNumber,
    pan_number: optionalText(input.pan_number)?.toUpperCase(),
    payment_days: parsedPaymentDays,
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
