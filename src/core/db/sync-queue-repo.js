import { db } from '../../lib/dexie-bundle.js';

export class SyncQueueRepo {
  async add(bookmarkId, action, payload) {
    return db.syncQueue.add({
      bookmarkId,
      action,
      payload,
      retryCount: 0,
      lastError: null,
      lastAttemptAt: null,
      createdAt: Date.now(),
    });
  }

  async getPending() {
    return db.syncQueue.where('retryCount').below(5).toArray();
  }

  async remove(id) {
    await db.syncQueue.delete(id);
  }

  async markFailed(id, error) {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, {
        retryCount: item.retryCount + 1,
        lastError: error.message,
        lastAttemptAt: Date.now(),
      });
    }
  }

  async count() {
    return db.syncQueue.count();
  }
}
