export class AlarmManager {
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
    const { db } = await import('../lib/dexie-bundle.js');

    await db.syncQueue
      .where('createdAt')
      .below(thirtyDaysAgo)
      .delete();
  }

  async processPendingSync() {
    const { db } = await import('../lib/dexie-bundle.js');
    const pending = await db.syncQueue
      .where('retryCount')
      .below(5)
      .toArray();

    if (pending.length === 0) return;

    const remaining = await db.syncQueue.count();
    if (remaining > 0 && navigator.onLine) {
      chrome.alarms.create('sync-pending', { delayInMinutes: 1 });
    }
  }
}
