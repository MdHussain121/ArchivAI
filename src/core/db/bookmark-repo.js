import { db } from '../../lib/dexie-bundle.js';
import { normalizeUrl, getDomain } from '../utils/url-utils.js';

export class BookmarkRepo {
  async add(bookmark) {
    const url = normalizeUrl(bookmark.url);

    const existing = await db.bookmarks.where('url').equals(url).first();

    if (existing) {
      await db.bookmarks.update(existing.id, {
        ...bookmark,
        url,
        updatedAt: Date.now(),
        savedAt: existing.savedAt,
      });
      return { id: existing.id, isUpdate: true };
    }

    const id = await db.bookmarks.add({
      ...bookmark,
      url,
      domain: getDomain(url),
      savedAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'pending_ai',
      aiProcessed: false,
      userTags: bookmark.userTags || [],
      aiTags: [],
    });

    return { id, isUpdate: false };
  }

  async getAll(options = {}) {
    const { categoryId, tags, search, sortBy = 'savedAt', sortDir = 'desc', limit = 50, offset = 0 } = options;
    let collection = db.bookmarks.orderBy(sortBy);

    if (sortDir === 'desc') collection = collection.reverse();

    let results = await collection.offset(offset).limit(limit).toArray();

    if (categoryId) results = results.filter(b => b.categoryId === categoryId);
    if (tags?.length) results = results.filter(b =>
      tags.some(t => b.userTags?.includes(t) || b.aiTags?.includes(t))
    );
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(b =>
        b.title?.toLowerCase().includes(q) ||
        b.url?.toLowerCase().includes(q) ||
        b.aiTags?.some(t => t.includes(q)) ||
        b.userTags?.some(t => t.includes(q))
      );
    }

    return results;
  }

  async getUnprocessed() {
    return db.bookmarks.where('aiProcessed').equals(0).toArray();
  }

  async delete(id) {
    await db.bookmarks.delete(id);
    await db.syncQueue.where('bookmarkId').equals(id).delete();
  }

  async update(id, changes) {
    await db.bookmarks.update(id, { ...changes, updatedAt: Date.now() });
  }
}
