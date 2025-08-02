/**
 * Standard API Response Types
 * Consistent structure for all API responses
 */

export interface ApiError {
  code: string;
  field?: string;
  message: string;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next?: boolean;
  has_previous?: boolean;
}

export interface ResponseMeta {
  timestamp: string;
  version: string;
  request_id?: string;
  pagination?: PaginationMeta;
}

// Base response structure for all API calls
export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  errors?: ApiError[];
  meta?: ResponseMeta;
}

// Specific response types
export interface ListResponse<T> extends ApiResponse<T[]> {
  meta: ResponseMeta & {
    pagination: PaginationMeta;
  };
}

export interface SingleResponse<T> extends ApiResponse<T> {}

export interface CreateResponse<T> extends ApiResponse<T> {
  message?: string;
}

export interface UpdateResponse<T> extends ApiResponse<T> {
  message?: string;
}

export interface DeleteResponse extends ApiResponse<null> {
  message?: string;
}

// Auth specific responses
export interface LoginResponse extends ApiResponse<{
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    user_id: number;
    username: string;
    full_name: string;
    email: string;
    role: string;
    org_id: string;
    org_name: string;
    permissions: string[];
  };
}> {}

// Bulk operation responses
export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  errors?: Array<{
    index: number;
    error: ApiError;
  }>;
}

export interface BulkResponse<T> extends ApiResponse<{
  results: T[];
  summary: BulkOperationResult;
}> {}

// File upload response
export interface FileUploadResponse extends ApiResponse<{
  file_id: string;
  file_name: string;
  file_size: number;
  file_url: string;
  mime_type: string;
}> {}

// Generic error response
export interface ErrorResponse extends ApiResponse<null> {
  success: false;
  errors: ApiError[];
}