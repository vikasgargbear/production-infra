import { apiHelpers } from '../../apiClient';

export type CanonicalPage<T, S> = {
  scope: InventoryScope;
  as_of: string;
  business_date: string;
  items: T[];
  total_count: number;
  summary: S;
  next_cursor: string | null;
};

export type InventoryLocation = {
  location_id: string;
  location_code: string;
  location_name: string;
  location_type: 'saleable' | 'quarantine' | 'returns' | 'damaged' | 'cold_storage' | 'transit';
  location_status: 'active' | 'inactive' | 'blocked';
  allows_sale: boolean;
  allows_negative_stock: boolean;
  temperature_min_c: string | null;
  temperature_max_c: string | null;
};

export type InventoryBranch = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  locations: InventoryLocation[];
};

export type InventoryContext = {
  organization_id: string;
  organization_timezone: string;
  business_date: string;
  branches: InventoryBranch[];
};

export type InventoryScope = {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  location_id: string | null;
  location_code: string | null;
  location_name: string | null;
};

export type InventoryReadParams = {
  branch_id: string;
  location_id?: string;
  product_id?: string;
  batch_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  cursor?: string;
};

export const canonicalInventoryReadsApi = {
  context: () => apiHelpers.get('/canonical/inventory/context'),
  currentStock: (params: InventoryReadParams) => (
    apiHelpers.get('/canonical/inventory/current-stock', { params })
  ),
  batches: (params: InventoryReadParams) => (
    apiHelpers.get('/canonical/inventory/batches', { params })
  ),
  movements: (params: InventoryReadParams) => (
    apiHelpers.get('/canonical/inventory/movements', { params })
  ),
};
