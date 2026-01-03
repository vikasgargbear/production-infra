/**
 * Master Schemas Barrel Export
 * 
 * Zod validation schemas for master data entities.
 */

// Customer schemas
export {
    contactInfoSchema,
    addressInfoSchema,
    customerTypeSchema,
    customerStatusSchema,
    customerCreateSchema,
    customerUpdateSchema,
    customerSearchSchema,
    creditCheckSchema,
    validateCustomerCreate,
    validateCustomerUpdate,
    validateGSTNumber,
    validatePANNumber,
    extractStateCodeFromGST,
    type CustomerCreateInput,
    type CustomerUpdateInput,
    type CustomerSearchParams,
    type CreditCheckInput
} from './customer.schema';

// Product schemas
export * from './product.schema';
