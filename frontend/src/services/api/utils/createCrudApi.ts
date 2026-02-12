/**
 * CRUD API Factory
 * Generates standard getAll/getById/create/update/delete methods.
 * Modules spread these and add domain-specific methods on top.
 */

import { apiHelpers } from '../apiClient';
import { cleanData } from './dataUtils';
import type { AxiosResponse } from 'axios';

export interface CrudApiConfig {
  basePath: string;
  useCleanData?: boolean;   // default: true
  createPath?: string;      // default: basePath
}

export function createCrudApi(config: CrudApiConfig) {
  const { basePath, useCleanData = true, createPath = basePath } = config;
  // Strip trailing slash for ID-based endpoints to avoid double slashes
  const base = basePath.replace(/\/$/, '');

  const prepare = (data: any) => (useCleanData ? cleanData(data) : data);

  return {
    getAll: (params?: any): Promise<AxiosResponse> => {
      return apiHelpers.get(basePath, { params });
    },

    getById: (id: number | string): Promise<AxiosResponse> => {
      return apiHelpers.get(`${base}/${id}`);
    },

    create: (data: any): Promise<AxiosResponse> => {
      return apiHelpers.post(createPath, prepare(data));
    },

    update: (id: number | string, data: any): Promise<AxiosResponse> => {
      return apiHelpers.put(`${base}/${id}`, prepare(data));
    },

    delete: (id: number | string): Promise<AxiosResponse> => {
      return apiHelpers.delete(`${base}/${id}`);
    },
  };
}
