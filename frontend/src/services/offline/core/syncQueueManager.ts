import { SyncQueueItem, SYNC_STATUS } from '../types';

export class SyncQueueManager {
    private getDb: () => Promise<any>;

    constructor(getDb: () => Promise<any>) {
        this.getDb = getDb;
    }

    async addToSyncQueue(entityType: string, entityId: string | number, action: 'create' | 'update' | 'delete', data: any = null): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');

        await store.add({
            entity_type: entityType,
            entity_id: entityId,
            action: action,
            data: data,
            created_at: new Date().toISOString(),
            attempts: 0,
            sync_status: SYNC_STATUS.PENDING
        } as SyncQueueItem);

        await tx.done;
    }

    async getSyncQueue(): Promise<SyncQueueItem[]> {
        const db = await this.getDb();
        const items = await db.getAll('sync_queue') as SyncQueueItem[];
        return items.filter(item => (
            item.sync_status === SYNC_STATUS.PENDING
            && ((item as SyncQueueItem & { retry_count?: number }).retry_count || 0) < 3
        ));
    }

    async removeFromSyncQueue(id: number): Promise<void> {
        const db = await this.getDb();
        return db.delete('sync_queue', id);
    }

    async clearSyncQueue(): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('sync_queue', 'readwrite');
        await tx.objectStore('sync_queue').clear();
        await tx.done;
    }

    async markSyncConflict(id: number, error: any): Promise<void> {
        const db = await this.getDb();
        const item = await db.get('sync_queue', id);
        if (item) {
            item.sync_status = SYNC_STATUS.CONFLICT;
            item.conflict_reason = error;
            item.conflict_at = new Date().toISOString();
            return db.put('sync_queue', item);
        }
    }

    async incrementSyncRetry(id: number): Promise<void> {
        const db = await this.getDb();
        const item = await db.get('sync_queue', id);
        if (item) {
            item.retry_count = (item.retry_count || 0) + 1;
            item.last_retry_at = new Date().toISOString();
            return db.put('sync_queue', item);
        }
    }
}
