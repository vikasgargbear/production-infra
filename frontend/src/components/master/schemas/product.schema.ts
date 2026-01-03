/**
 * Product Validation Schemas
 * Runtime validation using Zod
 */

import { z } from 'zod';

// Drug schedule enum
export const drugScheduleSchema = z.enum(['G', 'H', 'H1', 'X', 'OTC']);

// Weight unit enum
export const weightUnitSchema = z.enum(['g', 'kg', 'mg']);

// Base product schema with all validations
export const productBaseSchema = z.object({
  product_name: z.string().min(1, 'Product name is required').max(255),
  product_code: z.string().max(50).optional(),
  manufacturer: z.string().min(1, 'Manufacturer is required').max(255),
  hsn_code: z.string().min(4, 'HSN code must be at least 4 characters').max(8),
  category: z.string().max(100).optional(),
  salt_composition: z.string().max(500).optional(),
  
  // Pricing validation
  mrp: z.number().positive('MRP must be positive'),
  sale_price: z.number().positive('Sale price must be positive'),
  cost_price: z.number().nonnegative('Cost price cannot be negative'),
  gst_percent: z.number().min(0).max(100, 'GST must be between 0 and 100'),
  
  // Units
  base_unit: z.string().min(1, 'Base unit is required').max(20),
  sale_unit: z.string().max(20).optional(),
  
  // Pack configuration
  pack_input: z.string().max(50).optional(),
  pack_quantity: z.number().int().positive().optional(),
  pack_multiplier: z.number().int().positive().optional(),
  
  // Pharmaceutical details
  drug_schedule: drugScheduleSchema.optional(),
  requires_prescription: z.boolean().optional(),
  controlled_substance: z.boolean().optional(),
  dosage_instructions: z.string().max(500).optional(),
  storage_instructions: z.string().max(500).optional(),
  
  // Physical details
  generic_name: z.string().max(255).optional(),
  packer: z.string().max(255).optional(),
  country_of_origin: z.string().max(100).optional(),
  weight: z.number().positive().optional(),
  weight_unit: weightUnitSchema.optional(),
  pack_form: z.string().max(100).optional(),
});

// Validate pricing relationships
export const productCreateSchema = productBaseSchema.refine(
  (data) => data.sale_price <= data.mrp,
  {
    message: 'Sale price cannot be greater than MRP',
    path: ['sale_price'],
  }
).refine(
  (data) => data.cost_price <= data.sale_price,
  {
    message: 'Cost price should not be greater than sale price',
    path: ['cost_price'],
  }
);

// Update schema - all fields optional
export const productUpdateSchema = z.object({
  product_name: z.string().min(1).max(255).optional(),
  product_code: z.string().max(50).optional(),
  manufacturer: z.string().min(1).max(255).optional(),
  hsn_code: z.string().min(4).max(8).optional(),
  category: z.string().max(100).optional(),
  salt_composition: z.string().max(500).optional(),
  
  mrp: z.number().positive().optional(),
  sale_price: z.number().positive().optional(),
  cost_price: z.number().nonnegative().optional(),
  gst_percent: z.number().min(0).max(100).optional(),
  
  base_unit: z.string().min(1).max(20).optional(),
  sale_unit: z.string().max(20).optional(),
  
  pack_input: z.string().max(50).optional(),
  pack_quantity: z.number().int().positive().optional(),
  pack_multiplier: z.number().int().positive().optional(),
  
  drug_schedule: drugScheduleSchema.optional(),
  requires_prescription: z.boolean().optional(),
  controlled_substance: z.boolean().optional(),
  dosage_instructions: z.string().max(500).optional(),
  storage_instructions: z.string().max(500).optional(),
  
  generic_name: z.string().max(255).optional(),
  packer: z.string().max(255).optional(),
  country_of_origin: z.string().max(100).optional(),
  weight: z.number().positive().optional(),
  weight_unit: weightUnitSchema.optional(),
  pack_form: z.string().max(100).optional(),
  
  is_active: z.boolean().optional(),
  is_discontinued: z.boolean().optional(),
});

// Search params validation
export const productSearchParamsSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  drug_schedule: drugScheduleSchema.optional(),
  has_stock: z.boolean().optional(),
  is_active: z.boolean().optional(),
  min_stock: z.number().int().nonnegative().optional(),
  max_stock: z.number().int().positive().optional(),
  min_price: z.number().nonnegative().optional(),
  max_price: z.number().positive().optional(),
  gst_percent: z.number().min(0).max(100).optional(),
  page: z.number().int().positive().optional(),
  page_size: z.number().int().positive().max(100).optional(),
  sort_by: z.enum(['product_name', 'sale_price', 'total_quantity', 'created_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

// Stock update validation
export const stockUpdateSchema = z.object({
  product_id: z.number().int().positive(),
  batch_number: z.string().optional(),
  quantity_change: z.number().int(),
  operation_type: z.enum(['add', 'remove', 'adjust']),
  reason: z.string().max(255).optional(),
});

// Batch schema
export const productBatchSchema = z.object({
  batch_number: z.string().min(1, 'Batch number is required').max(50),
  expiry_date: z.string().datetime(),
  quantity_available: z.number().int().nonnegative(),
  mrp: z.number().positive(),
  purchase_price: z.number().positive(),
  sale_price: z.number().positive(),
  location: z.string().max(100).optional(),
});

// Pack input validation helper
export const validatePackInput = (packInput: string): boolean => {
  // Validates formats like "10*10", "1*100ML", etc.
  const packPattern = /^\d+\*\d+[A-Z]*$/;
  return packPattern.test(packInput);
};

// HSN code validation helper
export const validateHSNCode = (hsn: string): boolean => {
  // HSN codes should be 4, 6, or 8 digits
  return /^\d{4}(\d{2})?(\d{2})?$/.test(hsn);
};

// Export type inference helpers
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductSearchParams = z.infer<typeof productSearchParamsSchema>;
export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ProductBatchInput = z.infer<typeof productBatchSchema>;