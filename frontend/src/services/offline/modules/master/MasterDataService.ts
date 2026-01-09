/**
 * Master Data Service - Optimistic data layer for master data
 */

import offlineDB from '../../core/offlineDatabase';
import { masterMemoryCache } from './MasterMemoryCache';
import type { OfflineEmployee, OfflineWarehouse, OfflineCategory, OfflineManufacturer } from '../../types/master.types';

class MasterDataService {
    async getEmployee(id: string): Promise<OfflineEmployee | null> {
        const cached = masterMemoryCache.getEmployee(id);
        if (cached) return { ...cached };

        try {
            const emp = await offlineDB.get('employees', id);
            return emp ? { ...emp } as OfflineEmployee : null;
        } catch (error) {
            return null;
        }
    }

    async getAllEmployees(): Promise<OfflineEmployee[]> {
        if (masterMemoryCache.isReady()) {
            return masterMemoryCache.getAllEmployees();
        }

        try {
            const employees = await offlineDB.getAll('employees') as OfflineEmployee[];
            return employees.map(e => ({ ...e }));
        } catch (error) {
            return [];
        }
    }

    async getAllWarehouses(): Promise<OfflineWarehouse[]> {
        if (masterMemoryCache.isReady()) {
            return masterMemoryCache.getAllWarehouses();
        }

        try {
            const warehouses = await offlineDB.getAll('warehouses') as OfflineWarehouse[];
            return warehouses.map(w => ({ ...w }));
        } catch (error) {
            return [];
        }
    }

    async getAllCategories(): Promise<OfflineCategory[]> {
        if (masterMemoryCache.isReady()) {
            return masterMemoryCache.getAllCategories();
        }

        try {
            const categories = await offlineDB.getAll('categories') as OfflineCategory[];
            return categories.map(c => ({ ...c }));
        } catch (error) {
            return [];
        }
    }

    async searchEmployees(query: string): Promise<OfflineEmployee[]> {
        if (masterMemoryCache.isReady()) {
            return masterMemoryCache.searchEmployees(query);
        }

        try {
            const all = await this.getAllEmployees();
            const lowerQuery = query.toLowerCase();
            return all.filter(e => e.employee_name.toLowerCase().includes(lowerQuery));
        } catch (error) {
            return [];
        }
    }
}

export const masterDataService = new MasterDataService();
export default masterDataService;
