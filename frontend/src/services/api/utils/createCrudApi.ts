/**
 * CRUD API Factory
 * Generates standard reads and fail-closed legacy mutation placeholders.
 * A module must override a mutation with a named canonical adapter.
 */

import { apiHelpers } from '../apiClient';
import { rejectCanonicalWrite } from '../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

export interface CrudApiConfig {
  basePath: string;
  useCleanData?: boolean;   // default: true
  createPath?: string;      // default: basePath
}

export function createCrudApi(config: CrudApiConfig) {
  const { basePath, createPath = basePath } = config;
  // Strip trailing slash for ID-based endpoints to avoid double slashes
  const base = basePath.replace(/\/$/, '');

  return {
    getAll: (params?: any): Promise<AxiosResponse> => {
      return apiHelpers.get(basePath, { params });
    },

    getById: (id: number | string): Promise<AxiosResponse> => {
      return apiHelpers.get(`${base}/${id}`);
    },

    create: (_data: any): Promise<AxiosResponse> =>
      rejectCanonicalWrite(`Creating a legacy ${createPath} record`),

    update: (_id: number | string, _data: any): Promise<AxiosResponse> =>
      rejectCanonicalWrite(`Editing a legacy ${base} record`),

    delete: (_id: number | string): Promise<AxiosResponse> =>
      rejectCanonicalWrite(`Deleting a legacy ${base} record`),
  };
}
