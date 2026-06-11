import Dexie from 'dexie';

export const db = new Dexie('AIContentCurator');

db.version(1).stores({
  bookmarks: `
    ++id,
    url,
    domain,
    savedAt,
    categoryId,
    *aiTags,
    *userTags,
    aiProcessed,
    syncStatus,
    readStatus
  `,

  tags: `
    ++id,
    &name,
    color,
    createdAt
  `,

  categories: `
    ++id,
    &name,
    icon,
    color,
    sortOrder,
    createdAt
  `,

  syncQueue: `
    ++id,
    bookmarkId,
    action,
    retryCount,
    createdAt
  `,

  sessions: `
    ++id,
    &sessionId,
    startedAt,
    lastActiveAt,
    tabCount
  `
});

export async function initializeDatabase() {
  await db.open();

  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      navigator.storage.persist().catch(() => {});
    }
  }

  return db;
}
