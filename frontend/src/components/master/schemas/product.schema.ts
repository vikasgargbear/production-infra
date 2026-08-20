/** Canonical client-side validation for product API contracts. */
import { z } from 'zod';

export {
  productCreateSchema,
  productDraftBaseSchema as productBaseSchema,
  productKindSchema,
  productUpdateSchema,
} from '../../../types/models/product';

export type {
  ProductCreateInput,
  ProductUpdateInput,
} from '../../../types/models/product';

// Schedule H2 is traceability scope, not a Drugs Rules prescription schedule.
export const drugScheduleSchema = z.enum(['NONE', 'G', 'H', 'H1', 'X']);

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
  page: z.number().int().positive().optional(),
  page_size: z.number().int().min(1).max(100).optional(),
  sort_by: z.enum(['product_name', 'sale_price', 'total_quantity', 'created_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
}).strict();

export const stockUpdateSchema = z.object({
  product_id: z.number().int().positive(),
  batch_number: z.string().max(50).optional(),
  quantity_change: z.number(),
  operation_type: z.enum(['add', 'remove', 'adjust']),
  reason: z.string().max(500).optional(),
}).strict();

export const productBatchSchema = z.object({
  batch_number: z.string().min(1).max(50),
  expiry_date: z.string(),
  manufacturing_date: z.string().optional(),
  quantity_available: z.number().nonnegative(),
  mrp: z.number().positive(),
  unit_price: z.number().positive(),
  sale_price: z.number().positive(),
  location: z.string().max(100).optional(),
}).strict();

export const validatePackInput = (packInput: string): boolean => /^\d+\*\d+[A-Z]*$/.test(packInput);
export const validateHSNCode = (hsn: string): boolean => /^\d{4}(\d{2})?(\d{2})?$/.test(hsn);

export type ProductSearchParams = z.infer<typeof productSearchParamsSchema>;
export type StockUpdateInput = z.infer<typeof stockUpdateSchema>;
export type ProductBatchInput = z.infer<typeof productBatchSchema>;
