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
  row_version?: number;

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
  row_version: z.number().int().positive(),
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
  if (Object.keys(data).every(key => key === 'row_version')) {
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

export const productPackConversionSchema = z.object({
  uom_code: z.string().trim().min(1).max(16),
  multiplier: z.number().positive(),
}).strict();

export const productIngredientSchema = z.object({
  ingredient_id: z.string().uuid(),
  ingredient_role: z.enum(['active', 'excipient']).default('active'),
  strength_value: z.number().positive().optional(),
  strength_uom_code: z.string().trim().min(1).max(16).optional(),
  basis_quantity: z.number().positive().optional(),
  basis_uom_code: z.string().trim().min(1).max(16).optional(),
}).strict().superRefine((row, context) => {
  const strength = [row.strength_value, row.strength_uom_code, row.basis_quantity, row.basis_uom_code];
  if (row.ingredient_role === 'active' && strength.some(value => value === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Strength and basis are required for an active ingredient' });
  }
  if (row.ingredient_role === 'excipient' && strength.some(value => value !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Excipient rows cannot claim an unreviewed strength' });
  }
});

export const productSetupSchema = z.object({
  row_version: z.number().int().positive(),
  category_id: z.string().uuid().optional(),
  manufacturer_party_id: z.string().uuid(),
  base_uom_code: z.string().trim().min(1).max(16),
  dosage_form: z.string().trim().max(64).optional(),
  strength_display: z.string().trim().max(128).optional(),
  hsn_code: z.string().regex(/^[0-9]{4,8}$/),
  cold_chain_required: z.boolean(),
  minimum_storage_celsius: z.number().min(-100).max(100).optional(),
  maximum_storage_celsius: z.number().min(-100).max(100).optional(),
  shelf_life_days: z.number().int().positive().max(36500).optional(),
  gtin: z.string().regex(/^[0-9]{8,14}$/).optional(),
  pack_conversions: z.array(productPackConversionSchema).max(12),
  ingredients: z.array(productIngredientSchema).max(32),
}).strict().superRefine((setup, context) => {
  if (setup.cold_chain_required && (
    setup.minimum_storage_celsius === undefined
    || setup.maximum_storage_celsius === undefined
    || setup.minimum_storage_celsius >= setup.maximum_storage_celsius
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['minimum_storage_celsius'], message: 'Enter a valid cold-chain temperature range' });
  }
  if (!setup.cold_chain_required && (
    setup.minimum_storage_celsius !== undefined || setup.maximum_storage_celsius !== undefined
  )) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cold_chain_required'], message: 'Enable cold-chain handling before entering temperatures' });
  }
  const packUnits = setup.pack_conversions.map(row => row.uom_code);
  if (packUnits.includes(setup.base_uom_code) || new Set(packUnits).size !== packUnits.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['pack_conversions'], message: 'Pack units must be unique and different from the base unit' });
  }
  const ingredients = setup.ingredients.map(row => row.ingredient_id);
  if (new Set(ingredients).size !== ingredients.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ingredients'], message: 'Each ingredient can appear only once' });
  }
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductSetupInput = z.infer<typeof productSetupSchema>;

export interface ProductSetupOptions {
  business_date: string;
  ingredient_reference_ready: boolean;
  hsn_reference_ready: boolean;
  categories: Array<{ category_id: string; code: string; name: string; parent_id: string | null }>;
  units: Array<{ code: string; name: string; symbol: string; dimension: string; decimal_places: number }>;
  manufacturers: Array<{ manufacturer_party_id: string; legal_name: string; supplier_code: string }>;
}

export interface ProductIngredientOption {
  ingredient_id: string;
  canonical_name: string;
  salt_or_form: string | null;
  drugs_rules_schedule: 'NONE' | 'G' | 'H' | 'H1' | 'X';
  ndps_classification: string;
  schedule_h2_applicable_from: string | null;
  ruleset_version: string;
}

export interface ProductHsnOption {
  tax_code_version_id: string;
  hsn_code: string;
  description: string;
  taxability: string;
  cgst_rate: string;
  sgst_rate: string;
  igst_rate: string;
  cess_rate: string;
  ruleset_version: string;
}

export interface ProductSetupRead {
  product_id: string;
  product_code: string;
  product_name: string;
  generic_name: string | null;
  product_kind: 'medicine' | 'medical_device' | 'consumable';
  category_id: string | null;
  category_name: string | null;
  manufacturer_party_id: string | null;
  manufacturer_name: string | null;
  base_uom_code: string;
  dosage_form: string | null;
  strength_display: string | null;
  hsn_code: string | null;
  cold_chain_required: boolean;
  minimum_storage_celsius: string | null;
  maximum_storage_celsius: string | null;
  shelf_life_days: number | null;
  gtin: string | null;
  status: 'draft' | 'active' | 'blocked';
  row_version: number;
  missing_fields: string[];
  recommended_fields: string[];
  ready_to_activate: boolean;
  pack_conversions: Array<{ uom_code: string; uom_name: string; multiplier: string }>;
  ingredients: Array<ProductIngredientOption & {
    ingredient_role: 'active' | 'excipient';
    strength_value: string | null;
    strength_uom_code: string | null;
    basis_quantity: string | null;
    basis_uom_code: string | null;
  }>;
}

export interface ProductMutationResponse {
  product_id: string;
  product_code: string;
  product_name: string;
  lifecycle_status: 'draft' | 'active';
  row_version?: number;
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
