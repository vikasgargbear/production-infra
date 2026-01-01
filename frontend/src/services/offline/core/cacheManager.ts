import { IDBPDatabase } from 'idb';

export class CacheManager {
    private getDb: () => Promise<any>;

    constructor(getDb: () => Promise<any>) {
        this.getDb = getDb;
    }

    /**
     * Store data in generic app cache
     */
    async setCache(key: string, data: any): Promise<void> {
        const db = await this.getDb();
        await db.put('app_cache', {
            key,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Get data from generic app cache
     */
    async getCache<T = any>(key: string, maxAgeMinutes: number | null = null): Promise<T | null> {
        const db = await this.getDb();
        const result = await db.get('app_cache', key);

        if (!result) return null;

        if (maxAgeMinutes) {
            const age = (Date.now() - result.timestamp) / 1000 / 60;
            if (age > maxAgeMinutes) {
                return null;
            }
        }

        return result.data as T;
    }

    /**
     * Clear generic app cache
     */
    async clearCache(key: string | null = null): Promise<void> {
        const db = await this.getDb();
        if (key) {
            await db.delete('app_cache', key);
        } else {
            await db.clear('app_cache');
        }
    }
}
