/**
 * Product Model Type Definitions
 * ALIGNED with backend inventory.products schema
 * NOT NULL fields in DB = required in TypeScript
 */

import { z } from 'zod';

/**
 * Product base information - matches inventory.products table
 */
export interface Product {
  // Primary fields - NOT NULL in DB
  product_id: number | string; // Canonical IDs are UUID strings
  product_code: string;   // NOT NULL (was incorrectly optional!)
  product_name: string;   // NOT NULL
  product_type: string;   // NOT NULL (was missing!)
  uom_conversion_id?: string;

  // Nullable fields from DB
  generic_name?: string;
  brand?: string;
  manufacturer?: string;  // Was incorrectly required!
  category_id?: number;
  category?: string;      // UI convenience field
  product_class?: string;
  composition?: object;   // jsonb in DB
  strength?: string;
  hsn_code?: string;      // Nullable in DB (was incorrectly required!)
  drug_schedule?: string;
  requires_prescription?: boolean;
  is_narcotic?: boolean;
  is_controlled_substance?: boolean;
  barcode?: string;
  manufacturer_code?: string;

  // Tax (nullable in DB)
  gst_percent?: number;   // Nullable in DB
  cess_percentage?: number;
  cgst_percent?: number;  // UI calculated
  sgst_percent?: number;  // UI calculated
  igst_percent?: number;  // UI calculated

  // Stock management (nullable)
  maintain_batch?: boolean;
  maintain_expiry?: boolean;
  allow_negative_stock?: boolean;
  min_stock_quantity?: number;
  reorder_level?: number;
  reorder_quantity?: number;
  max_stock_quantity?: number;
  critical_stock_level?: number;

  // Product lifecycle (nullable)
  status?: 'draft' | 'active' | 'blocked';
  product_status?: string;
  launch_date?: string;
  discontinuation_date?: string;

  // Metadata (nullable)
  search_keywords?: string[];
  tags?: string[];
  product_images?: object;
  documents?: object;

  // Flags (nullable)
  is_active?: boolean;
  is_saleable?: boolean;
  is_purchasable?: boolean;
  is_discontinued?: boolean;  // UI convenience

  // Timestamps (nullable)
  created_at?: string;
  updated_at?: string;
  created_by?: number;
  type_id?: number;

  // Aggregated from batches (nullable)
  quantity_returned?: number;
  total_quantity_available?: number;
  total_stock?: number;
  batch_count?: number;
  has_stock?: boolean;

  // UI convenience fields (not in DB)
  salt_composition?: string;
  mrp?: number;           // Actually from batch
  sale_price?: number;    // Actually from batch
  cost_per_unit?: number; // Actually from batch
}

/**
 * Product batch information
 */
export interface ProductBatch {
  batch_id: number | string; // Support string IDs
  product_id: number | string;
  batch_number: string;
  expiry_date: string;
  manufacturing_date?: string;
  quantity_available: number;

  // Canonical Pricing (matches backend)
  mrp_per_unit: number;
  sale_price_per_unit: number;
  cost_per_unit: number;

  // Legacy Pricing (deprecated)
  mrp?: number;
  unit_price?: number;
  sale_price?: number;

  location?: string;
  location_id?: string;
  branch_id?: string;
  uom_conversion_id?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;

  // Extra fields
  days_to_expiry?: number | null;
  units_per_pack?: number;
  packages_per_box?: number;
  pack_type?: string;
}

export const productKindSchema = z.enum(['medicine', 'medical_device', 'consumable']);

/**
 * Product master mutations create and edit draft identity only. Tax, Drugs
 * Rules schedule, NDPS, Schedule H2, composition, price and opening stock are
 * deliberately separate reviewed commands.
 */
export const productDraftBaseSchema = z.object({
  product_name: z.string().trim().min(1).max(255),
  generic_name: z.string().trim().max(255).optional(),
  product_kind: productKindSchema,
}).strict();

export const productCreateSchema = productDraftBaseSchema;

export const productUpdateSchema = z.object({
  product_name: z.string().trim().min(1).max(255).optional(),
  generic_name: z.string().trim().max(255).optional(),
  brand: z.string().trim().max(100).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  category_id: z.number().int().positive().optional(),
  type_id: z.number().int().positive().optional(),
  product_kind: productKindSchema.optional(),
  reorder_level: z.number().nonnegative().optional(),
  min_stock_quantity: z.number().nonnegative().optional(),
  max_stock_quantity: z.number().nonnegative().optional(),
  maintain_batch: z.boolean().optional(),
  maintain_expiry: z.boolean().optional(),
}).strict().superRefine((data, context) => {
  if (Object.keys(data).length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one product field is required' });
  }
  if (
    data.min_stock_quantity !== undefined &&
    data.max_stock_quantity !== undefined &&
    data.min_stock_quantity > data.max_stock_quantity
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['min_stock_quantity'],
      message: 'Minimum stock cannot exceed maximum stock',
    });
  }
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export interface ProductMutationResponse {
  product_id: string;
  product_code: string;
  product_name: string;
  lifecycle_status: 'draft';
  message: string;
}

/**
 * Product search parameters
 */
export interface ProductSearchParams {
  query?: string;
  category?: string;
  manufacturer?: string;
  drug_schedule?: string;
  has_stock?: boolean;
  is_active?: boolean;
  min_stock?: number;
  max_stock?: number;
  min_price?: number;
  max_price?: number;
  gst_percent?: number;
  page?: number;
  page_size?: number;
  sort_by?: 'product_name' | 'sale_price' | 'total_quantity' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

/**
 * Stock update request
 */
export interface StockUpdateRequest {
  product_id: number;
  batch_number?: string;
  quantity_change: number;
  operation_type: 'add' | 'remove' | 'adjust';
  reason?: string;
}

/**
 * Stock check response
 */
export interface StockCheckResponse {
  product_id: number;
  product_name: string;
  total_available: number;
  batches: Array<{
    batch_id: number;
    batch_number: string;
    quantity_available: number;
    expiry_date: string;
  }>;
  is_sufficient: boolean;
}

/**
 * Product category
 */
export interface ProductCategory {
  category_id: number;
  category_name: string;
  parent_category?: string;
  description?: string;
  product_count: number;
  is_active: boolean;
}

/**
 * Product with batches
 */
export interface ProductWithBatches extends Product {
  batches: ProductBatch[];
}

/**
 * Product validation status
 */
export interface ProductValidation {
  is_valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  warnings?: Array<{
    field: string;
    message: string;
  }>;
}
