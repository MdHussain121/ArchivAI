import { ACTIONS, success, error } from '../core/messaging/protocol.js';
import { db } from '../lib/dexie-bundle.js';
import { getDomain, normalizeUrl } from '../core/utils/url-utils.js';
import { GeminiClient } from './gemini-client.js';

export class MessageRouter {
  constructor() {
    this.ports = new Set();
    this.handlers = {
      [ACTIONS.GET_PAGE_META]: this.handleGetPageMeta.bind(this),
      [ACTIONS.SAVE_BOOKMARK]: this.handleSaveBookmark.bind(this),
      [ACTIONS.GET_BOOKMARK]: this.handleGetBookmark.bind(this),
      [ACTIONS.GET_BOOKMARKS]: this.handleGetBookmarks.bind(this),
      [ACTIONS.SEARCH_BOOKMARKS]: this.handleSearchBookmarks.bind(this),
      [ACTIONS.GET_TAGS]: this.handleGetTags.bind(this),
      [ACTIONS.GET_CATEGORIES]: this.handleGetCategories.bind(this),
      [ACTIONS.GET_SETTINGS]: this.handleGetSettings.bind(this),
      [ACTIONS.UPDATE_SETTINGS]: this.handleUpdateSettings.bind(this),
      [ACTIONS.EXPORT_DATA]: this.handleExportData.bind(this),
    };
  }

  async handle(msg, sender, sendResponse) {
    const handler = this.handlers[msg.action];
    if (!handler) {
      sendResponse(error(`Unknown action: ${msg.action}`));
      return;
    }
    try {
      const result = await handler(msg, sender);
      sendResponse(success(result));
    } catch (err) {
      sendResponse(error(err.message));
    }
  }

  handlePort(port) {
    this.ports.add(port);
    port.onDisconnect.addListener(() => this.ports.delete(port));
  }

  async handleGetPageMeta(msg) {
    if (!msg.tabId) {
      throw new Error('No tab ID provided');
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: msg.tabId },
        files: ['content/content.js'],
      });
    } catch (e) {
      // Content script may already be injected
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Page extraction timed out')), 3000);

      chrome.tabs.sendMessage(msg.tabId, { action: ACTIONS.EXTRACT_PAGE }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Extraction failed'));
        }
      });
    });
  }

  async handleSaveBookmark(msg) {
    const { pageData, userTags, notes } = msg;
    if (!pageData?.url) throw new Error('No URL provided');

    const url = normalizeUrl(pageData.url);
    const domain = getDomain(url);

    const existing = await db.bookmarks.where('url').equals(url).first();

    const bookmark = {
      url,
      domain,
      title: pageData.title || 'Untitled',
      description: pageData.description || '',
      favicon: pageData.favicon || '',
      ogImage: pageData.ogImage || '',
      textContent: pageData.textContent || '',
      wordCount: pageData.wordCount || 0,
      userTags: userTags || [],
      notes: notes || '',
      aiTags: [],
      aiSummary: '',
      suggestedCategory: '',
      aiProcessed: false,
      readStatus: 'unread',
      syncStatus: 'pending_ai',
      updatedAt: Date.now(),
    };

    if (existing) {
      await db.bookmarks.update(existing.id, { ...bookmark, savedAt: existing.savedAt });
      return { id: existing.id, isUpdate: true };
    }

    bookmark.savedAt = Date.now();
    const id = await db.bookmarks.add(bookmark);

    this.processAITags(id, bookmark.textContent, bookmark.title).catch(() => {});

    this.broadcastToPopups({ action: ACTIONS.BOOKMARK_UPDATED });
    return { id, isUpdate: false };
  }

  async handleGetBookmark(msg) {
    return db.bookmarks.get(msg.id);
  }

  async handleGetBookmarks() {
    return db.bookmarks
      .orderBy('savedAt')
      .reverse()
      .limit(50)
      .toArray();
  }

  async handleSearchBookmarks(msg) {
    const q = (msg.query || '').toLowerCase();
    if (!q) return [];

    const all = await db.bookmarks.orderBy('savedAt').reverse().toArray();
    return all.filter(b =>
      b.title?.toLowerCase().includes(q) ||
      b.url?.toLowerCase().includes(q) ||
      b.aiSummary?.toLowerCase().includes(q) ||
      (b.aiTags || []).some(t => t.toLowerCase().includes(q)) ||
      (b.userTags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  async handleGetTags() {
    return db.tags.orderBy('name').toArray();
  }

  async handleGetCategories() {
    return db.categories.orderBy('sortOrder').toArray();
  }

  async handleGetSettings() {
    const result = await chrome.storage.local.get(['geminiApiKey', 'theme', 'sortOrder']);
    return result;
  }

  async handleUpdateSettings(msg) {
    await chrome.storage.local.set(msg.settings);
    return true;
  }

  async handleExportData(msg) {
    const format = msg.format || 'json';
    const all = await db.bookmarks.orderBy('savedAt').toArray();

    const exportData = all.map(b => ({
      url: b.url,
      title: b.title,
      description: b.description,
      domain: b.domain,
      tags: (b.aiTags || []).concat(b.userTags || []),
      category: b.suggestedCategory,
      summary: b.aiSummary,
      savedAt: new Date(b.savedAt).toISOString(),
      readStatus: b.readStatus,
      wordCount: b.wordCount,
    }));

    switch (format) {
      case 'csv': {
        const headers = ['url','title','description','domain','tags','category','summary','savedAt','readStatus','wordCount'];
        const rows = exportData.map(b => [
          `"${(b.url || '').replace(/"/g, '""')}"`,
          `"${(b.title || '').replace(/"/g, '""')}"`,
          `"${(b.description || '').replace(/"/g, '""')}"`,
          `"${(b.domain || '').replace(/"/g, '""')}"`,
          `"${(b.tags || []).join('; ')}"`,
          `"${(b.category || '').replace(/"/g, '""')}"`,
          `"${(b.summary || '').replace(/"/g, '""')}"`,
          b.savedAt,
          b.readStatus,
          b.wordCount || 0,
        ]);
        return { format, data: '\uFEFF' + headers.join(',') + '\n' + rows.map(r => r.join(',')).join('\n') };
      }
      case 'html': {
        const items = exportData.map(b =>
          `<DT><A HREF="${b.url}" ADD_DATE="${Math.floor(new Date(b.savedAt).getTime() / 1000)}" TAGS="${(b.tags || []).join(',')}">${b.title}</A>`
        ).join('\n');
        return { format, data: `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>AI Content Curator Export</H1>\n<DL><p>\n${items}\n</DL>` };
      }
      default: {
        return { format, data: JSON.stringify(exportData, null, 2) };
      }
    }
  }

  async handleContextMenu(info, tab) {
    const url = info.linkUrl || info.pageUrl;
    if (!url) return;

    const pageData = {
      url,
      title: info.selectionText || tab?.title || 'Untitled',
      description: '',
      domain: getDomain(url),
    };

    await this.handleSaveBookmark({ pageData });
  }

  async processAITags(bookmarkId, textContent, title) {
    try {
      const gemini = new GeminiClient();
      const result = await gemini.analyze(textContent, title);

      await db.bookmarks.update(bookmarkId, {
        aiTags: result.tags || [],
        aiSummary: result.summary || '',
        suggestedCategory: result.category || '',
        aiProcessed: true,
        aiProcessedAt: Date.now(),
        syncStatus: 'synced',
      });

      this.broadcastToPopups({
        action: ACTIONS.AI_TAGS_READY,
        bookmarkId,
        tags: result.tags,
        summary: result.summary,
      });
    } catch (err) {
      console.warn('AI processing failed:', err.message);
      const { db } = await import('../lib/dexie-bundle.js');
      await db.syncQueue.add({
        bookmarkId,
        action: 'process_ai',
        payload: { textContent, title },
        retryCount: 0,
        createdAt: Date.now(),
      });
    }
  }

  broadcastToPopups(msg) {
    this.ports.forEach(port => {
      try { port.postMessage(msg); } catch {}
    });
  }
}
