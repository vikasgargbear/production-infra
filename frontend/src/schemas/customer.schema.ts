/**
 * Customer Validation Schemas using Zod
 * Runtime validation for forms and API data
 */

import { z } from 'zod';

// Indian phone number regex
const PHONE_REGEX = /^[6-9]\d{9}$/;

// GST number regex
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// PAN number regex
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// Email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pincode regex (Indian)
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

// Contact info schema
export const contactInfoSchema = z.object({
  primary_phone: z.string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number must not exceed 15 digits')
    .regex(PHONE_REGEX, 'Invalid Indian phone number'),
  alternate_phone: z.string()
    .regex(PHONE_REGEX, 'Invalid Indian phone number')
    .optional()
    .nullable(),
  email: z.string()
    .regex(EMAIL_REGEX, 'Invalid email address')
    .optional()
    .nullable(),
  website: z.string()
    .url('Invalid website URL')
    .optional()
    .nullable(),
});

// Address info schema
export const addressInfoSchema = z.object({
  billing_address: z.string()
    .min(5, 'Address must be at least 5 characters')
    .max(255, 'Address must not exceed 255 characters'),
  billing_city: z.string()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City must not exceed 100 characters'),
  billing_state: z.string()
    .min(2, 'State must be at least 2 characters')
    .max(100, 'State must not exceed 100 characters'),
  billing_pincode: z.string()
    .regex(PINCODE_REGEX, 'Invalid Indian pincode'),
  billing_country: z.string().default('India'),
  
  // Shipping address (optional, defaults to billing)
  shipping_address: z.string().optional().nullable(),
  shipping_city: z.string().optional().nullable(),
  shipping_state: z.string().optional().nullable(),
  shipping_pincode: z.string()
    .regex(PINCODE_REGEX, 'Invalid Indian pincode')
    .optional()
    .nullable(),
  shipping_country: z.string().optional().nullable(),
});

// Customer type enum
export const customerTypeSchema = z.enum([
  'pharmacy',
  'hospital',
  'clinic',
  'distributor',
  'other'
]);

// Customer status enum
export const customerStatusSchema = z.enum([
  'active',
  'inactive',
  'blocked'
]);

// Customer creation schema
export const customerCreateSchema = z.object({
  customer_code: z.string()
    .min(3, 'Customer code must be at least 3 characters')
    .max(50, 'Customer code must not exceed 50 characters')
    .optional(),
  customer_name: z.string()
    .min(2, 'Customer name must be at least 2 characters')
    .max(255, 'Customer name must not exceed 255 characters'),
  customer_type: customerTypeSchema,
  contact_info: contactInfoSchema,
  address_info: addressInfoSchema,
  
  // GST and compliance
  gstin: z.string()
    .regex(GST_REGEX, 'Invalid GST number format')
    .optional()
    .nullable(),
  pan_number: z.string()
    .regex(PAN_REGEX, 'Invalid PAN number format')
    .optional()
    .nullable(),
  drug_license_number: z.string()
    .max(100, 'License number must not exceed 100 characters')
    .optional()
    .nullable(),
  drug_license_expiry: z.string()
    .or(z.date())
    .optional()
    .nullable(),
  fssai_number: z.string()
    .max(100, 'FSSAI number must not exceed 100 characters')
    .optional()
    .nullable(),
  
  // Credit management
  credit_limit: z.number()
    .min(0, 'Credit limit cannot be negative')
    .default(0),
  credit_days: z.number()
    .min(0, 'Credit days cannot be negative')
    .max(365, 'Credit days cannot exceed 365')
    .default(0),
  payment_terms: z.string()
    .max(255, 'Payment terms must not exceed 255 characters')
    .optional()
    .nullable(),
  
  // Categorization
  customer_group: z.string()
    .max(100, 'Customer group must not exceed 100 characters')
    .optional()
    .nullable(),
  customer_category: z.string()
    .max(100, 'Customer category must not exceed 100 characters')
    .optional()
    .nullable(),
  discount_percentage: z.number()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .default(0),
  
  // Preferences
  preferred_payment_mode: z.string()
    .max(50, 'Payment mode must not exceed 50 characters')
    .optional()
    .nullable(),
  preferred_delivery_time: z.string()
    .max(100, 'Delivery time must not exceed 100 characters')
    .optional()
    .nullable(),
  
  notes: z.string()
    .max(1000, 'Notes must not exceed 1000 characters')
    .optional()
    .nullable(),
}).refine((data) => {
  // If GST number is provided, extract and validate state code
  if (data.gstin) {
    const stateCode = data.gstin.substring(0, 2);
    // You can add state code validation here
  }
  return true;
});

// Customer update schema (all fields optional)
export const customerUpdateSchema = z.object({
  customer_code: z.string().optional(),
  customer_name: z.string().optional(),
  customer_type: customerTypeSchema.optional(),
  contact_info: contactInfoSchema.partial().optional(),
  address_info: addressInfoSchema.partial().optional(),
  gstin: z.string().regex(GST_REGEX, 'Invalid GST number format').optional().nullable(),
  pan_number: z.string().regex(PAN_REGEX, 'Invalid PAN number format').optional().nullable(),
  drug_license_number: z.string().optional().nullable(),
  credit_limit: z.number().min(0).optional(),
  credit_days: z.number().min(0).max(365).optional(),
  customer_group: z.string().optional().nullable(),
  discount_percentage: z.number().min(0).max(100).optional(),
  status: customerStatusSchema.optional(),
  notes: z.string().max(1000).optional().nullable(),
});

// Search params schema
export const customerSearchSchema = z.object({
  search: z.string().optional(),
  customer_type: customerTypeSchema.optional(),
  status: customerStatusSchema.optional(),
  has_outstanding: z.boolean().optional(),
  customer_group: z.string().optional(),
  page: z.number().min(1).default(1),
  page_size: z.number().min(1).max(100).default(20),
  sort_by: z.string().default('customer_name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

// Credit check schema
export const creditCheckSchema = z.object({
  customer_id: z.number().positive(),
  order_amount: z.number().positive('Order amount must be positive'),
});

// Export type inference
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerSearchParams = z.infer<typeof customerSearchSchema>;
export type CreditCheckInput = z.infer<typeof creditCheckSchema>;

// Validation helper functions
export const validateCustomerCreate = (data: unknown) => {
  return customerCreateSchema.safeParse(data);
};

export const validateCustomerUpdate = (data: unknown) => {
  return customerUpdateSchema.safeParse(data);
};

export const validateGSTNumber = (gstin: string): boolean => {
  return GST_REGEX.test(gstin);
};

export const validatePANNumber = (pan: string): boolean => {
  return PAN_REGEX.test(pan);
};

export const extractStateCodeFromGST = (gstin: string): string | null => {
  if (validateGSTNumber(gstin)) {
    return gstin.substring(0, 2);
  }
  return null;
};