/**
 * Master Memory Cache - O(1) lookups for master data
 */

import type { OfflineEmployee, OfflineWarehouse, OfflineCategory, OfflineManufacturer } from '../../types/master.types';

class MasterMemoryCache {
    private employees = new Map<string, OfflineEmployee>();
    private warehouses = new Map<string, OfflineWarehouse>();
    private categories = new Map<string, OfflineCategory>();
    private manufacturers = new Map<string, OfflineManufacturer>();

    private isWarmed = false;

    warmCache(
        employees: OfflineEmployee[],
        warehouses: OfflineWarehouse[],
        categories: OfflineCategory[],
        manufacturers: OfflineManufacturer[]
    ): void {
        this.clear();

        for (const emp of employees) {
            emp._search_name = emp.employee_name.toLowerCase();
            emp._search_phone = emp.phone?.replace(/\D/g, '') || '';
            this.employees.set(String(emp.employee_id), emp);
        }

        for (const wh of warehouses) {
            this.warehouses.set(String(wh.warehouse_id), wh);
        }

        for (const cat of categories) {
            this.categories.set(String(cat.category_id), cat);
        }

        for (const man of manufacturers) {
            man._search_name = man.manufacturer_name.toLowerCase();
            this.manufacturers.set(String(man.manufacturer_id), man);
        }

        this.isWarmed = true;
        console.log(`[MasterCache] ✅ Warmed: ${employees.length} employees, ${warehouses.length} warehouses, ${categories.length} categories, ${manufacturers.length} manufacturers`);
    }

    getEmployee(id: string): OfflineEmployee | null {
        return this.employees.get(String(id)) || null;
    }

    getWarehouse(id: string): OfflineWarehouse | null {
        return this.warehouses.get(String(id)) || null;
    }

    getCategory(id: string): OfflineCategory | null {
        return this.categories.get(String(id)) || null;
    }

    getManufacturer(id: string): OfflineManufacturer | null {
        return this.manufacturers.get(String(id)) || null;
    }

    getAllEmployees(): OfflineEmployee[] {
        return Array.from(this.employees.values()).map(e => ({ ...e }));
    }

    getAllWarehouses(): OfflineWarehouse[] {
        return Array.from(this.warehouses.values()).map(w => ({ ...w }));
    }

    getAllCategories(): OfflineCategory[] {
        return Array.from(this.categories.values()).map(c => ({ ...c }));
    }

    getAllManufacturers(): OfflineManufacturer[] {
        return Array.from(this.manufacturers.values()).map(m => ({ ...m }));
    }

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
        this.isWarmed = false;
    }

    isReady(): boolean {
        return this.isWarmed;
    }
}

export const masterMemoryCache = new MasterMemoryCache();
export default masterMemoryCache;
