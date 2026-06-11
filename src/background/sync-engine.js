import { GeminiClient } from './gemini-client.js';
import { db } from '../lib/dexie-bundle.js';

export class SyncEngine {
  constructor() {
    this.processing = false;
    this.gemini = new GeminiClient();
  }

  async processQueue() {
    if (this.processing || !navigator.onLine) return;
    this.processing = true;

    try {
      const queue = await db.syncQueue
        .where('retryCount')
        .below(5)
        .toArray();

      for (const item of queue) {
        try {
          await this.processItem(item);
          await db.syncQueue.delete(item.id);
        } catch (err) {
          await db.syncQueue.update(item.id, {
            retryCount: item.retryCount + 1,
            lastError: err.message,
            lastAttemptAt: Date.now(),
          });
        }
      }
    } finally {
      this.processing = false;
    }

    const remaining = await db.syncQueue.count();
    if (remaining > 0 && navigator.onLine) {
      chrome.alarms.create('sync-pending', { delayInMinutes: 1 });
    }
  }

  async processItem(item) {
    switch (item.action) {
      case 'process_ai': {
        const { geminiApiKey } = await chrome.storage.local.get('geminiApiKey');
        if (!geminiApiKey) {
          console.log('Sync: AI skipped — no API key');
          return;
        }

        const result = await this.gemini.analyze(
          item.payload?.textContent,
          item.payload?.title
        );
        await db.bookmarks.update(item.bookmarkId, {
          aiTags: result.tags || [],
          aiSummary: result.summary || '',
          suggestedCategory: result.category || '',
          aiProcessed: true,
          aiProcessedAt: Date.now(),
          syncStatus: 'synced',
        });
        break;
      }
    }
  }

  async hasPending() {
    const count = await db.syncQueue.count();
    return count > 0;
  }
}
