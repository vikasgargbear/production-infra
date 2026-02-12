/**
 * Master Memory Cache - O(1) lookups for master data
 */

import { GenericCollectionCache } from '../../core/GenericCollectionCache';
import type { OfflineEmployee, OfflineWarehouse, OfflineCategory, OfflineManufacturer } from '../../types/master.types';

class MasterMemoryCache {
    private employees = new GenericCollectionCache<OfflineEmployee>({
        idField: 'employee_id',
        searchFields: ['employee_name']
    });
    private warehouses = new GenericCollectionCache<OfflineWarehouse>({ idField: 'warehouse_id' });
    private categories = new GenericCollectionCache<OfflineCategory>({ idField: 'category_id' });
    private manufacturers = new GenericCollectionCache<OfflineManufacturer>({
        idField: 'manufacturer_id',
        searchFields: ['manufacturer_name']
    });

    warmCache(
        employees: OfflineEmployee[],
        warehouses: OfflineWarehouse[],
        categories: OfflineCategory[],
        manufacturers: OfflineManufacturer[]
    ): void {
        // Pre-compute phone search field before warmCache (not handled by GenericCollectionCache)
        for (const emp of employees) {
            emp._search_phone = emp.phone?.replace(/\D/g, '') || '';
        }

        this.employees.warmCache(employees);
        this.warehouses.warmCache(warehouses);
        this.categories.warmCache(categories);
        this.manufacturers.warmCache(manufacturers);

        console.log(`[MasterCache] ✅ Warmed: ${employees.length} employees, ${warehouses.length} warehouses, ${categories.length} categories, ${manufacturers.length} manufacturers`);
    }

    getEmployee(id: string): OfflineEmployee | null { return this.employees.get(id); }
    getWarehouse(id: string): OfflineWarehouse | null { return this.warehouses.get(id); }
    getCategory(id: string): OfflineCategory | null { return this.categories.get(id); }
    getManufacturer(id: string): OfflineManufacturer | null { return this.manufacturers.get(id); }

    getAllEmployees(): OfflineEmployee[] { return this.employees.getAll().map(e => ({ ...e })); }
    getAllWarehouses(): OfflineWarehouse[] { return this.warehouses.getAll().map(w => ({ ...w })); }
    getAllCategories(): OfflineCategory[] { return this.categories.getAll().map(c => ({ ...c })); }
    getAllManufacturers(): OfflineManufacturer[] { return this.manufacturers.getAll().map(m => ({ ...m })); }

    searchEmployees(query: string, limit = 20): OfflineEmployee[] {
        if (!query || query.length < 2) return [];
        const lowerQuery = query.toLowerCase();
        const results: OfflineEmployee[] = [];

        for (const emp of this.employees.values()) {
            if (emp._search_name?.includes(lowerQuery) || emp._search_phone?.includes(query.replace(/\D/g, ''))) {
                results.push({ ...emp });
                if (results.length >= limit) break;
            }
        }

        return results;
    }

    clear(): void {
        this.employees.clear();
        this.warehouses.clear();
        this.categories.clear();
        this.manufacturers.clear();
    }

    isReady(): boolean {
        return this.employees.isReady();
    }
}

export const masterMemoryCache = new MasterMemoryCache();
export default masterMemoryCache;
