/**
 * Master Validation Utilities
 * 
 * Shared validation functions for master data.
 */

import type { BaseCustomer, BaseSupplier, BaseProduct } from '../types/masterSharedTypes';

/**
 * Validate GSTIN format (15-character format)
 */
export function validateGSTIN(gstin: string): { valid: boolean; message?: string } {
    if (!gstin) return { valid: true }; // Optional field

    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin)) {
        return { valid: false, message: 'Invalid GSTIN format' };
    }
    return { valid: true };
}

/**
 * Validate PAN format
 */
export function validatePAN(pan: string): { valid: boolean; message?: string } {
    if (!pan) return { valid: true }; // Optional field

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(pan)) {
        return { valid: false, message: 'Invalid PAN format' };
    }
    return { valid: true };
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): { valid: boolean; message?: string } {
    if (!phone) return { valid: true };

    // Remove spaces and dashes
    const cleaned = phone.replace(/[\s-]/g, '');

    // Indian phone number (10 digits, optionally with +91)
    const phoneRegex = /^(\+91)?[6-9][0-9]{9}$/;
    if (!phoneRegex.test(cleaned)) {
        return { valid: false, message: 'Invalid phone number' };
    }
    return { valid: true };
}

/**
 * Validate email address
 */
export function validateEmail(email: string): { valid: boolean; message?: string } {
    if (!email) return { valid: true };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, message: 'Invalid email address' };
    }
    return { valid: true };
}

/**
 * Validate pincode
 */
export function validatePincode(pincode: string): { valid: boolean; message?: string } {
    if (!pincode) return { valid: true };

    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!pincodeRegex.test(pincode)) {
        return { valid: false, message: 'Invalid pincode' };
    }
    return { valid: true };
}

/**
 * Validate HSN code
 */
export function validateHSN(hsn: string): { valid: boolean; message?: string } {
    if (!hsn) return { valid: true };

    // HSN is typically 4, 6, or 8 digits
    const hsnRegex = /^[0-9]{4,8}$/;
    if (!hsnRegex.test(hsn)) {
        return { valid: false, message: 'HSN code must be 4-8 digits' };
    }
    return { valid: true };
}

/**
 * Validate customer data
 */
export function validateCustomer(customer: Partial<BaseCustomer>): {
    valid: boolean;
    errors: string[]
} {
    const errors: string[] = [];

    if (!customer.customer_name?.trim()) {
        errors.push('Customer name is required');
    }

    if (customer.gstin) {
        const gstinResult = validateGSTIN(customer.gstin);
        if (!gstinResult.valid) errors.push(gstinResult.message!);
    }

    if (customer.pan) {
        const panResult = validatePAN(customer.pan);
        if (!panResult.valid) errors.push(panResult.message!);
    }

    if (customer.phone) {
        const phoneResult = validatePhone(customer.phone);
        if (!phoneResult.valid) errors.push(phoneResult.message!);
    }

    if (customer.email) {
        const emailResult = validateEmail(customer.email);
        if (!emailResult.valid) errors.push(emailResult.message!);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate supplier data
 */
export function validateSupplier(supplier: Partial<BaseSupplier>): {
    valid: boolean;
    errors: string[]
} {
    const errors: string[] = [];

    if (!supplier.supplier_name?.trim()) {
        errors.push('Supplier name is required');
    }

    if (supplier.gstin) {
        const gstinResult = validateGSTIN(supplier.gstin);
        if (!gstinResult.valid) errors.push(gstinResult.message!);
    }

    if (supplier.pan) {
        const panResult = validatePAN(supplier.pan);
        if (!panResult.valid) errors.push(panResult.message!);
    }

    if (supplier.phone) {
        const phoneResult = validatePhone(supplier.phone);
        if (!phoneResult.valid) errors.push(phoneResult.message!);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate product data
 */
export function validateProduct(product: Partial<BaseProduct>): {
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

    if (product.cost_price !== undefined && product.cost_price < 0) {
        errors.push('Cost price cannot be negative');
    }

    if (product.hsn_code) {
        const hsnResult = validateHSN(product.hsn_code);
        if (!hsnResult.valid) errors.push(hsnResult.message!);
    }

    return { valid: errors.length === 0, errors };
}
