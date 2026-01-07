/**
 * Master Validation Utilities
 * 
 * Re-exports Zod validation schemas and provides convenience wrappers.
 * Use Zod schemas for comprehensive validation with detailed error messages.
 */

// Re-export all Zod schemas for master entities
export * from '../schemas';

// ==================== SIMPLE VALIDATION HELPERS ====================
// These are quick helpers for common checks. For comprehensive validation, use Zod schemas.

import type { BaseCustomer, BaseSupplier, BaseProduct } from '../types/masterSharedTypes';

// Regex patterns (shared with Zod schemas)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PHONE_REGEX = /^(\+91)?[6-9][0-9]{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const HSN_REGEX = /^[0-9]{4,8}$/;

/**
 * Quick GSTIN format check
 */
export function isValidGSTIN(gst_number: string): boolean {
    if (!gst_number) return true; // Optional field
    return GSTIN_REGEX.test(gst_number);
}

/**
 * Quick PAN format check
 */
export function isValidPAN(pan_number: string): boolean {
    if (!pan_number) return true;
    return PAN_REGEX.test(pan_number);
}

/**
 * Quick phone format check
 */
export function isValidPhone(phone: string): boolean {
    if (!phone) return true;
    const cleaned = phone.replace(/[\s-]/g, '');
    return PHONE_REGEX.test(cleaned);
}

/**
 * Quick email format check
 */
export function isValidEmail(email: string): boolean {
    if (!email) return true;
    return EMAIL_REGEX.test(email);
}

/**
 * Quick pincode format check
 */
export function isValidPincode(pincode: string): boolean {
    if (!pincode) return true;
    return PINCODE_REGEX.test(pincode);
}

/**
 * Quick HSN code check
 */
export function isValidHSN(hsn: string): boolean {
    if (!hsn) return true;
    return HSN_REGEX.test(hsn);
}

/**
 * Quick customer validation (basic checks only)
 * For comprehensive validation, use: validateCustomerCreate() from schemas
 */
export function quickValidateCustomer(customer: Partial<BaseCustomer>): {
    valid: boolean;
    errors: string[]
} {
    const errors: string[] = [];

    if (!customer.customer_name?.trim()) {
        errors.push('Customer name is required');
    }
    if (customer.gst_number && !isValidGSTIN(customer.gst_number)) {
        errors.push('Invalid GSTIN format');
    }
    if (customer.pan_number && !isValidPAN(customer.pan_number)) {
        errors.push('Invalid PAN format');
    }
    if (customer.primary_phone && !isValidPhone(customer.primary_phone)) {
        errors.push('Invalid phone number');
    }
    if (customer.email && !isValidEmail(customer.email)) {
        errors.push('Invalid email address');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Quick supplier validation (basic checks only)
 * For comprehensive validation, use Zod schemas
 */
export function quickValidateSupplier(supplier: Partial<BaseSupplier>): {
    valid: boolean;
    errors: string[]
} {
    const errors: string[] = [];

    if (!supplier.supplier_name?.trim()) {
        errors.push('Supplier name is required');
    }
    if (supplier.gst_number && !isValidGSTIN(supplier.gst_number)) {
        errors.push('Invalid GSTIN format');
    }
    if (supplier.pan_number && !isValidPAN(supplier.pan_number)) {
        errors.push('Invalid PAN format');
    }
    if (supplier.primary_phone && !isValidPhone(supplier.primary_phone)) {
        errors.push('Invalid phone number');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Quick product validation (basic checks only)
 */
export function quickValidateProduct(product: Partial<BaseProduct>): {
    valid: boolean;
    errors: string[]
} {
    const errors: string[] = [];

    if (!product.product_name?.trim()) {
        errors.push('Product name is required');
    }
    if (product.mrp !== undefined && product.mrp < 0) {
        errors.push('MRP cannot be negative');
    }
    if (product.cost_per_unit !== undefined && product.cost_per_unit < 0) {
        errors.push('Cost price cannot be negative');
    }
    if (product.hsn_code && !isValidHSN(product.hsn_code)) {
        errors.push('HSN code must be 4-8 digits');
    }

    return { valid: errors.length === 0, errors };
}

// Legacy aliases for backward compatibility
export const validateGSTIN = isValidGSTIN;
export const validatePAN = isValidPAN;
export const validatePhone = isValidPhone;
export const validateEmail = isValidEmail;
export const validatePincode = isValidPincode;
export const validateHSN = isValidHSN;
export const validateCustomer = quickValidateCustomer;
export const validateSupplier = quickValidateSupplier;
export const validateProduct = quickValidateProduct;
