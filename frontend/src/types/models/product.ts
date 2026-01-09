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
  product_id: number;     // NOT NULL
  product_code: string;   // NOT NULL (was incorrectly optional!)
  product_name: string;   // NOT NULL
  product_type: string;   // NOT NULL (was missing!)

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
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;

  // Extra fields
  days_to_expiry?: number | null;
  units_per_pack?: number;
  packages_per_box?: number;
  pack_type?: string;
}

/**
 * Product creation input
 */
export interface ProductCreateInput {
  product_name: string;
  product_code?: string;
  manufacturer: string;
  hsn_code: string;
  category?: string;
  salt_composition?: string;

  // Pricing
  mrp: number;
  sale_price: number;
  cost_per_unit: number;
  gst_percent: number;

  // Units
  base_unit: string;
  sale_unit?: string;

  // Pack configuration
  pack_input?: string;
  pack_quantity?: number;
  pack_multiplier?: number;

  // Optional pharmaceutical details
  drug_schedule?: 'G' | 'H' | 'H1' | 'X' | 'OTC';
  requires_prescription?: boolean;
  controlled_substance?: boolean;
  dosage_instructions?: string;
  storage_instructions?: string;

  // Optional physical details
  generic_name?: string;
  packer?: string;
  country_of_origin?: string;
  weight?: number;
  weight_unit?: 'g' | 'kg' | 'mg';
  pack_form?: string;
}

/**
 * Product update input (all fields optional)
 */
export interface ProductUpdateInput extends Partial<ProductCreateInput> { }

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