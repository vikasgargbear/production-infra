/**
 * Product Model Type Definitions
 * Matches backend schema for products and related entities
 */

import { z } from 'zod';

/**
 * Product base information
 */
export interface Product {
  product_id: number;
  product_name: string;
  product_code?: string;
  manufacturer: string;
  hsn_code: string;
  category?: string;
  salt_composition?: string;
  
  // Pricing
  mrp: number;
  sale_price: number;
  cost_price: number;
  gst_percent: number;
  cgst_percent?: number;
  sgst_percent?: number;
  igst_percent?: number;
  
  // Units
  base_unit: string;
  sale_unit?: string;
  
  // Pack configuration
  pack_input?: string;
  pack_quantity?: number;
  pack_multiplier?: number;
  pack_unit_type?: string;
  unit_count?: number;
  unit_measurement?: string;
  packages_per_box?: number;
  
  // Pharmaceutical details
  drug_schedule?: 'G' | 'H' | 'H1' | 'X' | 'OTC';
  requires_prescription?: boolean;
  controlled_substance?: boolean;
  dosage_instructions?: string;
  storage_instructions?: string;
  
  // Physical details
  generic_name?: string;
  packer?: string;
  country_of_origin?: string;
  model_number?: string;
  dimensions?: string;
  weight?: number;
  weight_unit?: 'g' | 'kg' | 'mg';
  pack_form?: string;
  color?: string;
  asin?: string;
  
  // Stock info (from batch aggregation)
  total_quantity?: number;
  batch_count?: number;
  has_stock?: boolean;
  quantity_available?: number;
  current_stock?: number; // Added for MVP compatibility
  
  // Status
  is_active?: boolean;
  is_discontinued?: boolean;
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

/**
 * Product batch information
 */
export interface ProductBatch {
  batch_id: number;
  product_id: number;
  batch_number: string;
  expiry_date: string;
  quantity_available: number;
  mrp: number;
  purchase_price: number;
  sale_price: number;
  location?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  cost_price: number;
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
export interface ProductUpdateInput extends Partial<ProductCreateInput> {}

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