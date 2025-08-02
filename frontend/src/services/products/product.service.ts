/**
 * Product Service
 * Handles all product-related API operations with full type safety
 */

import { BaseApiService } from '../api/base.service';
import { API_CONFIG } from '../../config/api.config';
import {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ProductSearchParams,
  StockUpdateRequest,
  StockCheckResponse,
  ProductCategory,
  ProductBatch,
  ProductWithBatches,
} from '../../types/models/product';
import {
  ApiResponse,
  ListResponse,
  SingleResponse,
  CreateResponse,
  UpdateResponse,
  DeleteResponse,
  BulkResponse,
} from '../../types/api/responses';

export class ProductService extends BaseApiService {
  private readonly basePath = '/api/products';
  
  /**
   * Get all products with pagination and filtering
   */
  async getProducts(params?: ProductSearchParams): Promise<ListResponse<Product>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<Product[]>(`${this.basePath}${queryString}`) as Promise<ListResponse<Product>>;
  }
  
  /**
   * Search products (for autocomplete)
   */
  async searchProducts(query: string, params?: {
    limit?: number;
    category?: string;
    has_stock?: boolean;
  }): Promise<ListResponse<Product>> {
    return this.get<Product[]>(`${API_CONFIG.ENDPOINTS.PRODUCTS.SEARCH}`, {
      params: { q: query, ...params },
    }) as Promise<ListResponse<Product>>;
  }
  
  /**
   * Get single product by ID
   */
  async getProduct(productId: number): Promise<SingleResponse<Product>> {
    return this.get<Product>(`${this.basePath}/${productId}`);
  }
  
  /**
   * Get product with all its batches
   */
  async getProductWithBatches(productId: number): Promise<SingleResponse<ProductWithBatches>> {
    return this.get<ProductWithBatches>(`${this.basePath}/${productId}/with-batches`);
  }
  
  /**
   * Create new product
   */
  async createProduct(data: ProductCreateInput): Promise<CreateResponse<Product>> {
    return this.post<Product>(this.basePath, data);
  }
  
  /**
   * Update existing product
   */
  async updateProduct(
    productId: number,
    data: ProductUpdateInput
  ): Promise<UpdateResponse<Product>> {
    return this.put<Product>(`${this.basePath}/${productId}`, data);
  }
  
  /**
   * Delete product (soft delete)
   */
  async deleteProduct(productId: number): Promise<DeleteResponse> {
    return this.delete(`${this.basePath}/${productId}`);
  }
  
  /**
   * Get product categories
   */
  async getCategories(): Promise<ListResponse<ProductCategory>> {
    return this.get<ProductCategory[]>(`${API_CONFIG.ENDPOINTS.PRODUCTS.CATEGORIES}`) as Promise<ListResponse<ProductCategory>>;
  }
  
  /**
   * Get product batches
   */
  async getProductBatches(
    productId: number,
    params?: {
      active_only?: boolean;
      non_expired?: boolean;
      page?: number;
      page_size?: number;
    }
  ): Promise<ListResponse<ProductBatch>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<ProductBatch[]>(`${this.basePath}/${productId}/batches${queryString}`) as Promise<ListResponse<ProductBatch>>;
  }
  
  /**
   * Check product stock availability
   */
  async checkStock(
    productId: number,
    requiredQuantity: number
  ): Promise<ApiResponse<StockCheckResponse>> {
    return this.get<StockCheckResponse>(
      `${this.basePath}/${productId}/check-stock`,
      { params: { required_quantity: requiredQuantity } }
    );
  }
  
  /**
   * Update product stock
   */
  async updateStock(request: StockUpdateRequest): Promise<ApiResponse<{
    new_quantity: number;
    transaction_id: number;
  }>> {
    return this.post(`${API_CONFIG.ENDPOINTS.PRODUCTS.STOCK_UPDATE}`, request);
  }
  
  /**
   * Get low stock products
   */
  async getLowStockProducts(params?: {
    threshold?: number;
    category?: string;
    page?: number;
    page_size?: number;
  }): Promise<ListResponse<Product>> {
    const queryParams = {
      ...params,
      max_stock: params?.threshold || 10,
    };
    return this.getProducts(queryParams);
  }
  
  /**
   * Get expiring products
   */
  async getExpiringProducts(params?: {
    days?: number;
    category?: string;
    page?: number;
    page_size?: number;
  }): Promise<ListResponse<Product>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<Product[]>(`${this.basePath}/expiring${queryString}`) as Promise<ListResponse<Product>>;
  }
  
  /**
   * Get expired products
   */
  async getExpiredProducts(params?: {
    category?: string;
    page?: number;
    page_size?: number;
  }): Promise<ListResponse<Product>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<Product[]>(`${this.basePath}/expired${queryString}`) as Promise<ListResponse<Product>>;
  }
  
  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(
    productIds: number[],
    status: 'active' | 'inactive' | 'discontinued'
  ): Promise<BulkResponse<Product>> {
    return this.post(`${this.basePath}/bulk-update-status`, {
      product_ids: productIds,
      status,
    });
  }
  
  /**
   * Export products to Excel/CSV
   */
  async exportProducts(
    format: 'excel' | 'csv',
    params?: ProductSearchParams
  ): Promise<Blob> {
    const queryString = params ? this.buildQueryString({ ...params, format }) : `?format=${format}`;
    
    const response = await this.http.get(`${this.basePath}/export${queryString}`, {
      responseType: 'blob',
    });
    
    return response.data;
  }
  
  /**
   * Import products from file
   */
  async importProducts(
    file: File,
    options?: {
      update_existing?: boolean;
      validate_only?: boolean;
    },
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<{
    imported: number;
    updated: number;
    errors: Array<{ row: number; errors: string[] }>;
  }>> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options?.update_existing) {
      formData.append('update_existing', 'true');
    }
    if (options?.validate_only) {
      formData.append('validate_only', 'true');
    }
    
    return this.post(`${API_CONFIG.ENDPOINTS.PRODUCTS.BATCH_UPLOAD}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
  }
  
  /**
   * Validate HSN code
   */
  async validateHSN(hsnCode: string): Promise<ApiResponse<{
    valid: boolean;
    description?: string;
    gst_rate?: number;
  }>> {
    return this.post(`${this.basePath}/validate-hsn`, { hsn_code: hsnCode });
  }
  
  /**
   * Get product price history
   */
  async getPriceHistory(
    productId: number,
    params?: {
      from_date?: string;
      to_date?: string;
      limit?: number;
    }
  ): Promise<ListResponse<{
    date: string;
    mrp: number;
    sale_price: number;
    cost_price: number;
    changed_by: string;
  }>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get(`${this.basePath}/${productId}/price-history${queryString}`) as Promise<ListResponse<any>>;
  }
}

// Create singleton instance
export const productService = new ProductService();

// Export for use in React components
export default productService;