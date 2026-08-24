import { SYNC_STATUS } from '../types';
import { SyncQueueManager } from './syncQueueManager';

describe('SyncQueueManager canonical retry boundary', () => {
  it('returns only retryable pending work', async () => {
    const db = {
      getAll: jest.fn().mockResolvedValue([
        { id: 1, sync_status: SYNC_STATUS.PENDING, retry_count: 0 },
        { id: 2, sync_status: SYNC_STATUS.CONFLICT, retry_count: 0 },
        { id: 3, sync_status: SYNC_STATUS.PENDING, retry_count: 3 },
        { id: 4, sync_status: SYNC_STATUS.PENDING },
      ]),
    };
    const manager = new SyncQueueManager(async () => db);

    await expect(manager.getSyncQueue()).resolves.toEqual([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 4 }),
    ]);
  });
});
