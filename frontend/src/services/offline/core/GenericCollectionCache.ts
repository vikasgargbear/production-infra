/**
 * GenericCollectionCache — Shared Map-based primary index for memory caches.
 *
 * Provides: warmCache, get, getAll, search, upsert, clear, isReady, size, values.
 * Each module cache class composes one or more GenericCollectionCache instances
 * and adds domain-specific secondary indices.
 */

export interface CollectionCacheConfig {
    idField: string;
    searchFields?: string[];
}

export class GenericCollectionCache<T extends Record<string, any>> {
    private items = new Map<string, T>();
    private warmed = false;
    private readonly idField: string;
    private readonly searchFields: string[];

    constructor(config: CollectionCacheConfig) {
        this.idField = config.idField;
        this.searchFields = config.searchFields || [];
    }

    warmCache(entities: T[]): void {
        this.items.clear();
        for (const entity of entities) {
            for (const field of this.searchFields) {
                const val = entity[field];
                if (typeof val === 'string') {
                    (entity as any)[`_search_${field}`] = val.toLowerCase();
                }
            }
            this.items.set(String(entity[this.idField]), entity);
        }
        this.warmed = true;
    }

    get(id: string | number): T | null {
        return this.items.get(String(id)) || null;
    }

    getAll(): T[] {
        return Array.from(this.items.values());
    }

    search(query: string, limit = 20): T[] {
        if (!query || query.length < 2) return [];
        const lowerQuery = query.toLowerCase();
        const results: T[] = [];

        for (const item of this.items.values()) {
            if (results.length >= limit) break;
            for (const field of this.searchFields) {
                if ((item as any)[`_search_${field}`]?.includes(lowerQuery)) {
                    results.push({ ...item });
                    break;
                }
            }
        }

        return results;
    }

    upsert(entity: T): void {
        for (const field of this.searchFields) {
            const val = entity[field];
            if (typeof val === 'string') {
                (entity as any)[`_search_${field}`] = val.toLowerCase();
            }
        }
        this.items.set(String(entity[this.idField]), entity);
    }

    clear(): void {
        this.items.clear();
        this.warmed = false;
    }

    isReady(): boolean {
        return this.warmed;
    }

    get size(): number {
        return this.items.size;
    }

    values(): IterableIterator<T> {
        return this.items.values();
    }
}
