import { NimClient } from './nim-client.js';

export class AlarmManager {
  constructor(db) {
    this.db = db;
    this.processing = false;
  }

  async handle(alarm) {
    switch (alarm.name) {
      case 'cleanup-old':
        await this.cleanupOldData();
        break;
      case 'sync-pending':
        await this.processPendingSync();
        break;
    }
  }

  async cleanupOldData() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    await this.db.syncQueue
      .where('createdAt')
      .below(thirtyDaysAgo)
      .delete();
  }

  async processPendingSync() {
    if (this.processing || !navigator.onLine) return;
    this.processing = true;

    try {
      const { nimApiKey } = await chrome.storage.local.get('nimApiKey');
      if (!nimApiKey) return;

      const queue = await this.db.syncQueue
        .where('retryCount')
        .below(5)
        .toArray();

      if (queue.length === 0) return;

      const nim = new NimClient();

      for (const item of queue) {
        try {
          if (item.action === 'process_ai') {
            const result = await nim.analyze(
              item.payload?.textContent,
              item.payload?.title
            );

            await this.db.bookmarks.update(item.bookmarkId, {
              aiTags: result.tags || [],
              aiSummary: result.summary || '',
              suggestedCategory: result.category || '',
              aiProcessed: true,
              aiProcessedAt: Date.now(),
              syncStatus: 'synced',
            });
          }

          await this.db.syncQueue.delete(item.id);
        } catch (err) {
          await this.db.syncQueue.update(item.id, {
            retryCount: item.retryCount + 1,
            lastError: err.message,
            lastAttemptAt: Date.now(),
          });
        }
      }
    } finally {
      this.processing = false;
    }

    const remaining = await this.db.syncQueue.count();
    if (remaining > 0 && navigator.onLine) {
      chrome.alarms.create('sync-pending', { delayInMinutes: 1 });
    }
  }
}
