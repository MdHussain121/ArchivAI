# AI Content Curator — Architecture Document

> Chrome Extension (Manifest V3) | Vanilla JS/HTML/CSS | Dexie.js + IndexedDB | Gemini API | Neo-brutalism UI

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Data Flow](#2-data-flow)
3. [Service Worker Lifecycle](#3-service-worker-lifecycle)
4. [Message Passing Patterns](#4-message-passing-patterns)
5. [Gemini API Integration](#5-gemini-api-integration)
6. [Offline Architecture](#6-offline-architecture)
7. [IndexedDB Schema Design](#7-indexeddb-schema-design)
8. [Sync & Session Management](#8-sync--session-management)

---

## 1. System Architecture Overview

### 1.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER LAYER                                │
│                                                                     │
│  ┌──────────┐    ┌──────────────────┐    ┌────────────────────┐    │
│  │ POPUP    │◄──►│ BACKGROUND       │◄──►│ CONTENT SCRIPT     │    │
│  │ (UI)     │    │ SERVICE WORKER   │    │ (Page Extractor)   │    │
│  │          │    │                  │    │                    │    │
│  │ - View   │    │ - Message Router │    │ - Extract text     │    │
│  │   saved  │    │ - Gemini Client  │    │ - Extract meta     │    │
│  │   pages  │    │ - Storage Proxy  │    │ - Extract links    │    │
│  │ - Tag    │    │ - Sync Engine    │    │ - Extract images   │    │
│  │   editor │    │ - Auth/Tokens    │    │ - Readability      │    │
│  │ - Search │    │ - Alarm Manager  │    │   parsing          │    │
│  └────┬─────┘    └────────┬─────────┘    └────────────────────┘    │
│       │                   │                                         │
│       │    ┌──────────────▼──────────────┐                         │
│       │    │       INDEXEDDB (Dexie)      │                         │
│       │    │  ┌──────────────────────┐   │                         │
│       │    │  │ bookmarks            │   │                         │
│       │    │  │ tags                 │   │                         │
│       │    │  │ categories           │   │                         │
│       │    │  │ ai_tags              │   │                         │
│       │    │  │ sync_queue           │   │                         │
│       │    │  │ sessions             │   │                         │
│       │    │  │ settings             │   │                         │
│       │    │  └──────────────────────┘   │                         │
│       │    └──────────────────────────────┘                         │
│       │                   │                                         │
│       │    ┌──────────────▼──────────────┐                         │
│       │    │     CHROME.STORAGE          │                         │
│       │    │  ┌──────────────────────┐   │                         │
│       │    │  │ local: API key,      │   │                         │
│       │    │  │   user prefs         │   │                         │
│       │    │  │ session: ephemeral   │   │                         │
│       │    │  │   state, tab cache   │   │                         │
│       │    │  │ sync: (future)       │   │                         │
│       │    │  └──────────────────────┘   │                         │
│       │    └──────────────────────────────┘                         │
└───────┼────────────────────────────────────┬────────────────────────┘
        │                                    │
        ▼                                    ▼
┌──────────────────┐            ┌──────────────────────┐
│   GEMINI API     │            │    TARGET WEBPAGES    │
│   (REST / SSE)   │            │    (User Browsing)    │
└──────────────────┘            └──────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Context | Responsibility | Key Constraints |
|-------|---------|---------------|-----------------|
| **Popup** | `popup/` | UI rendering: view bookmarks, edit tags, search. Zero business logic. | Ephemeral — destroyed on blur. Must load state from DB/storage on each open. |
| **Service Worker** | `background/` | Central orchestrator: message routing, Gemini API calls, storage CRUD, sync queue processing, alarm handlers. Single point of all privileged logic. | Non-persistent, event-driven. Max ~30s idle before termination. No DOM access. Global state lost on restart. |
| **Content Script** | `content/` | Thin page scraper: extract article text, meta tags, Open Graph data, readability snapshot. Sends raw data to SW for processing. | Runs in isolated world per tab. Limited Chrome API access (no `storage`, no direct fetch without CORS). Must stay <100KB. |
| **IndexedDB (Dexie)** | `core/db/` | All persistent structured data: bookmarks, tags, categories, AI tags, sync queue. Client-side source of truth for all curated content. | Async, promise-based. Schema migrations via `db.version(N).stores()`. |
| **chrome.storage** | `background/` | Secrets (Gemini API key), user preferences, session cache, non-structured state. | `local` ~10MB, `session` ~1MB (RAM-backed, cleared on browser close). `sync` ~102KB (throttled). |

### 1.3 Project Structure

```
src/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js              # UI controllers, Dexie live queries
├── background/
│   ├── service-worker.js       # Entry point, listener registration
│   ├── message-router.js       # Central dispatch for all messages
│   ├── gemini-client.js        # API wrapper: fetch, stream, retry
│   ├── sync-engine.js          # Offline queue -> background sync
│   └── alarm-manager.js        # chrome.alarms for periodic tasks
├── content/
│   ├── content.js              # Main scraper, injected per page
│   └── readability.js          # Lightweight readability parser
├── core/
│   ├── db/
│   │   ├── schema.js           # Dexie db definition + versioning
│   │   ├── bookmark-repo.js    # CRUD for bookmarks table
│   │   ├── tag-repo.js         # Tag operations
│   │   └── sync-queue-repo.js  # Offline queue management
│   ├── messaging/
│   │   ├── protocol.js         # Shared message types/constants
│   │   └── sender.js           # Helper: sendMessage with timeout
│   └── utils/
│       ├── retry.js            # Exponential backoff + jitter
│       ├── url-utils.js        # Normalize, validate, extract domain
│       └── network.js          # Online/offline detection
├── lib/
│   ├── dexie.js                # Dexie.js (bundled)
│   └── dexie-export-import.js  # Optional: backup/restore
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 2. Data Flow

### 2.1 Full Save Flow

```
User clicks extension icon
         │
         ▼
┌─────────────────────────────────┐
│ POPUP OPENS                     │
│ - chrome.action.onClicked       │
│ - OR user clicks toolbar icon   │
│ - popup.html + popup.js load    │
│ - Request active tab info       │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ POPUP → CONTENT SCRIPT          │
│ chrome.tabs.sendMessage({       │
│   action: "EXTRACT_PAGE"        │
│ })                              │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ CONTENT SCRIPT EXTRACTS         │
│ - document.title                │
│ - meta[property="og:*"]         │
│ - meta[name="description"]      │
│ - article text (readability)    │
│ - document.URL (canonical)      │
│ - <link rel="icon"> / favicon   │
│ - main content HTML (cleaned)   │
│ - word count, estimated read    │
│   time                          │
│                                 │
│ Returns: PageData object        │
└─────────────┬───────────────────┘
              │
              │ response via sendResponse
              ▼
┌─────────────────────────────────┐
│ POPUP RECEIVES PAGE DATA        │
│ - Shows preview to user         │
│ - User can add notes/tags       │
│ - User clicks "Save"            │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ POPUP → SERVICE WORKER          │
│ chrome.runtime.sendMessage({    │
│   action: "SAVE_BOOKMARK",      │
│   pageData: {...},              │
│   userTags: ["dev","ai"],       │
│   notes: "..."                  │
│ })                              │
└─────────────┬───────────────────┘
              │
              ├─────────────────────────────┐
              ▼                             ▼
┌────────────────────────┐    ┌────────────────────────────┐
│ SAVE TO INDEXEDDB      │    │ INITIATE AI TAGGING        │
│ Dexie: bookmarks.add() │    │ (fire-and-forget or await) │
│ Dexie: tags.bulkPut()  │    │                            │
└────────────┬───────────┘    └────────────┬───────────────┘
             │                             │
             ▼                             ▼
    ┌────────────────┐           ┌──────────────────────┐
    │ Confirm saved   │           │ GEMINI API CALL      │
    │ to popup        │           │ POST /v1/models/     │
    └────────────────┘           │   gemini-2.0-flash:   │
                                 │   generateContent     │
                                 │                       │
                                 │ Prompt: "Analyze this │
                                 │ article and generate  │
                                 │ 5 tags, category,     │
                                 │ and 1-line summary"   │
                                 └──────────┬────────────┘
                                            │
                                            ▼
                                 ┌──────────────────────┐
                                 │ SAVE AI RESULTS       │
                                 │ Dexie: bookmarks      │
                                 │   .update(id, {       │
                                 │     aiTags,           │
                                 │     aiSummary,        │
                                 │     category,         │
                                 │     aiProcessedAt     │
                                 │   })                  │
                                 └──────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────────┐
                                 │ POPUP (if still open) │
                                 │ receives update via   │
                                 │ port message or       │
                                 │ next time opened      │
                                 └──────────────────────┘
```

### 2.2 View / Browse Flow

```
User opens popup
       │
       ▼
┌──────────────────────────────┐
│ POPUP LIFTS LIVE QUERY       │
│ db.bookmarks                 │
│   .orderBy("savedAt")        │
│   .reverse()                 │
│   .toArray()                 │
│                               │
│ Renders list with Dexie       │
│ live query (db.bookmarks      │
│ .filter(...).toArray())       │
│ → auto-updates on DB change   │
└──────────────────────────────┘
```

### 2.3 Search Flow

```
User types in search bar
       │
       ▼
┌──────────────────────────────┐
│ LOCAL SEARCH (offline-safe)  │
│ db.bookmarks                 │
│   .where("title")            │
│   .startsWithIgnoreCase(q)   │
│   .or("url")                 │
│   .equals(q)                 │
│   .toArray()                 │
│                               │
│ OR: full-text via Dexie       │
│   .filter(b =>               │
│     b.title.includes(q) ||   │
│     b.aiTags.includes(q) ||  │
│     b.notes.includes(q)      │
│   )                          │
└──────────────────────────────┘
```

---

## 3. Service Worker Lifecycle

### 3.1 Lifecycle States

```
         ┌──────────┐
         │ INSTALL  │  ← Extension installed/updated
         └────┬─────┘
              │
         ┌────▼─────┐
         │ ACTIVATE │  ← Ready to handle events
         └────┬─────┘
              │
    ┌─────────▼──────────┐
    │   IDLE (waiting)    │  ← Listening for events
    └─────────┬──────────┘
              │
    Event fires (alarm, message, action click...)
              │
         ┌────▼─────┐
         │ WAKE UP  │  ← Fresh global scope
         └────┬─────┘
              │
         ┌────▼─────┐
         │ HANDLE   │  ← Execute handler(s)
         │ EVENTS   │
         └────┬─────┘
              │
    ~30s of inactivity
              │
         ┌────▼─────┐
         │ TERMINATE│  ← Global state lost
         └──────────┘
```

### 3.2 Implications for Architecture

| MV2 (Background Page) | MV3 (Service Worker) | Our Adaptation |
|------------------------|----------------------|----------------|
| Persistent — always in memory | Ephemeral — terminates on idle | Store all state in IndexedDB or `chrome.storage` |
| Global variables survive | Globals reset on wake | Re-initialize DB connection, caches on wake |
| `setTimeout` / `setInterval` work | Unreliable — worker can terminate | Use `chrome.alarms` for all scheduled tasks |
| DOM access available | No DOM access | DOM work → content script or offscreen document |
| `XMLHttpRequest` available | Use `fetch()` | All API calls via `fetch()` in SW |
| Full console access | Console via `chrome://extensions` inspect | Use structured logging pattern |

### 3.3 Service Worker Entry Point

```javascript
// background/service-worker.js
// All listener registration at TOP LEVEL (synchronous)

import { MessageRouter } from './message-router.js';
import { GeminiClient } from './gemini-client.js';
import { SyncEngine } from './sync-engine.js';
import { AlarmManager } from './alarm-manager.js';
import { db } from '../core/db/schema.js';

// ─── Initialize on each wake ────────────────────────────────────
let router, gemini, syncEngine, alarmManager;

async function initialize() {
  await db.open();
  gemini = new GeminiClient();
  router = new MessageRouter(gemini);
  syncEngine = new SyncEngine(db);
  alarmManager = new AlarmManager(syncEngine);
}

// Lazy init on first event
async function ensureInitialized() {
  if (!router) await initialize();
}

// ─── Event Listeners (synchronous registration!) ────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ensureInitialized().then(() => router.handle(msg, sender, sendResponse));
  return true; // keep channel open for async response
});

chrome.runtime.onConnect.addListener((port) => {
  ensureInitialized().then(() => router.handlePort(port));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  ensureInitialized().then(() => alarmManager.handle(alarm));
});

chrome.action.onClicked.addListener((tab) => {
  // open side panel or popup
});
```

### 3.4 Keep-Alive Strategy

Use `chrome.alarms` with minimum interval (1 minute) only when the sync queue has pending items:

```javascript
// alarm-manager.js
export class AlarmManager {
  constructor(syncEngine) {
    this.syncEngine = syncEngine;
  }

  async handle(alarm) {
    switch (alarm.name) {
      case 'sync-pending':
        await this.syncEngine.processQueue();
        if (await this.syncEngine.hasPending()) {
          // Re-arm if more items remain
          chrome.alarms.create('sync-pending', { delayInMinutes: 1 });
        }
        break;
      case 'cleanup-old':
        await this.syncEngine.cleanupExpired();
        break;
    }
  }

  start() {
    chrome.alarms.create('cleanup-old', { periodInMinutes: 60 });
  }
}
```

> **Rule**: Do NOT use blanket keep-alive. Only keep alive when there is queued work. Let the worker terminate naturally otherwise — this is the MV3 design goal.

---

## 4. Message Passing Patterns

### 4.1 Communication Matrix

```
┌──────────────────────┬──────────┬──────────────┬──────────────────┐
│ Sender \ Receiver    │ Popup    │ SW (Worker)  │ Content Script   │
├──────────────────────┼──────────┼──────────────┼──────────────────┤
│ Popup                │ N/A      │ runtime.     │ tabs.sendMessage │
│                      │          │ sendMessage  │ (to active tab)  │
├──────────────────────┼──────────┼──────────────┼──────────────────┤
│ SW (Worker)          │ runtime. │ N/A          │ tabs.sendMessage │
│                      │ sendMsg  │              │ (to specific     │
│                      │ (to      │              │ tabId)           │
│                      │ views)   │              │                  │
├──────────────────────┼──────────┼──────────────┼──────────────────┤
│ Content Script       │ runtime. │ runtime.     │ N/A              │
│                      │ sendMsg  │ sendMessage  │                  │
│                      │ (to ext) │              │                  │
└──────────────────────┴──────────┴──────────────┴──────────────────┘
```

### 4.2 One-Time Request Pattern (Preferred for Most Operations)

```javascript
// ---------------------------------------------------------------
// Sender helper in core/messaging/sender.js
// ---------------------------------------------------------------
export async function sendMessageToSW(message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('SW message timed out'));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

export async function sendMessageToContentScript(tabId, message, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Content script message timed out'));
    }, timeoutMs);

    chrome.tabs.sendMessage(tabId, message, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ---------------------------------------------------------------
// Protocol constants in core/messaging/protocol.js
// ---------------------------------------------------------------
export const ACTIONS = {
  // Popup → Content Script
  EXTRACT_PAGE:        'EXTRACT_PAGE',
  GET_PAGE_META:       'GET_PAGE_META',

  // Popup → SW
  SAVE_BOOKMARK:       'SAVE_BOOKMARK',
  UPDATE_BOOKMARK:     'UPDATE_BOOKMARK',
  DELETE_BOOKMARK:     'DELETE_BOOKMARK',
  GET_BOOKMARKS:       'GET_BOOKMARKS',
  SEARCH_BOOKMARKS:    'SEARCH_BOOKMARKS',
  GET_TAGS:            'GET_TAGS',
  CREATE_TAG:          'CREATE_TAG',
  DELETE_TAG:          'DELETE_TAG',
  GET_CATEGORIES:      'GET_CATEGORIES',
  PROCESS_AI_TAGS:     'PROCESS_AI_TAGS',  // trigger AI re-tag
  EXPORT_DATA:         'EXPORT_DATA',
  GET_SETTINGS:        'GET_SETTINGS',
  UPDATE_SETTINGS:     'UPDATE_SETTINGS',

  // Content Script → SW
  PAGE_DATA_READY:     'PAGE_DATA_READY',

  // SW → Popup (port-based)
  AI_TAGS_READY:       'AI_TAGS_READY',
  SYNC_STATUS:         'SYNC_STATUS',
  BOOKMARK_UPDATED:    'BOOKMARK_UPDATED',
};

// ---------------------------------------------------------------
// Response envelope
// ---------------------------------------------------------------
export function success(data) {
  return { ok: true, data };
}

export function error(message, code = 'UNKNOWN') {
  return { ok: false, error: message, code };
}
```

### 4.3 Content Script → SW → Popup (Extract & Save Example)

```javascript
// ─── content/content.js ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === ACTIONS.EXTRACT_PAGE) {
    const pageData = extractPageData();
    sendResponse(success(pageData));
  }
});

function extractPageData() {
  const og = getOpenGraph();
  return {
    url: document.URL,
    title: og.title || document.title,
    description: og.description || getMeta('description'),
    favicon: getFavicon(),
    ogImage: og.image,
    textContent: extractMainText(),  // readability-alike
    wordCount: estimateWordCount(),
    publishedAt: getMeta('article:published_time'),
    domain: new URL(document.URL).hostname,
  };
}

// ─── background/message-router.js ──────────────────────────────
export class MessageRouter {
  constructor(gemini) {
    this.gemini = gemini;
    this.handlers = {
      [ACTIONS.SAVE_BOOKMARK]: this.handleSaveBookmark.bind(this),
      [ACTIONS.PROCESS_AI_TAGS]: this.handleProcessAITags.bind(this),
      // ...
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

  async handleSaveBookmark(msg) {
    const id = await db.bookmarks.add({
      ...msg.pageData,
      userTags: msg.userTags || [],
      notes: msg.notes || '',
      categoryId: msg.categoryId || null,
      savedAt: Date.now(),
      aiProcessed: false,
    });

    // Fire-and-forget AI tagging (don't block the response)
    this.handleProcessAITags({ bookmarkId: id }).catch(console.warn);

    return { id };
  }

  async handleProcessAITags(msg) {
    const bookmark = await db.bookmarks.get(msg.bookmarkId);
    if (!bookmark) throw new Error('Bookmark not found');

    const aiResult = await this.gemini.analyze(bookmark.textContent, bookmark.title);

    await db.bookmarks.update(msg.bookmarkId, {
      aiTags: aiResult.tags,
      aiSummary: aiResult.summary,
      suggestedCategory: aiResult.category,
      aiProcessed: true,
      aiProcessedAt: Date.now(),
    });

    // Notify popup if open via port
    this.broadcastToPopups({
      action: ACTIONS.AI_TAGS_READY,
      bookmarkId: msg.bookmarkId,
    });

    return aiResult;
  }

  broadcastToPopups(msg) {
    // Get all popup connections via ports
    this.ports.forEach(port => {
      try { port.postMessage(msg); } catch {}
    });
  }
}
```

### 4.4 Port-Based Long-Lived Connection (Popup Open → SW)

```javascript
// ─── popup/popup.js ────────────────────────────────────────────
let port;

function connectToSW() {
  port = chrome.runtime.connect({ name: 'popup-session' });

  port.onMessage.addListener((msg) => {
    switch (msg.action) {
      case ACTIONS.AI_TAGS_READY:
        updateBookmarkTags(msg.bookmarkId);
        break;
      case ACTIONS.SYNC_STATUS:
        showSyncIndicator(msg.status);
        break;
      case ACTIONS.BOOKMARK_UPDATED:
        refreshList();
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    // Reconnect if popup still open (rare, but handle)
    if (!chrome.runtime.lastError) {
      setTimeout(connectToSW, 100);
    }
  });
}

connectToSW();

// ─── background/message-router.js (add to class) ───────────────
handlePort(port) {
  this.ports.add(port);
  port.onDisconnect.addListener(() => this.ports.delete(port));
  port.onMessage.addListener((msg) => {
    // Handle port messages if needed
  });
}
```

### 4.5 Popup → Content Script (Direct Tab Communication)

```javascript
// ─── popup/popup.js ────────────────────────────────────────────
async function getPageDataFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab');

  const response = await sendMessageToContentScript(tab.id, {
    action: ACTIONS.EXTRACT_PAGE,
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}
```

### 4.6 Critical Message Passing Rules

1. **Always call `return true`** in the SW `onMessage` listener when using async `sendResponse`.
2. **Always handle `chrome.runtime.lastError`** — content scripts may not be injected, popup may have closed.
3. **Popup may close mid-operation** — save critical state to `chrome.storage.session` before sending.
4. **Content script may not be injected** — use `chrome.scripting.executeScript` as fallback.
5. **Timeout all messages** — SW may be cold-starting (up to ~500ms).
6. **Use ports for streaming** or frequent updates; one-shot for individual requests.

---

## 5. Gemini API Integration

### 5.1 API Client Architecture

All Gemini API calls happen exclusively in the Service Worker. The API key is stored in `chrome.storage.local` and never exposed to content scripts or popup.

```javascript
// background/gemini-client.js
export class GeminiClient {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-2.0-flash';  // fast, cheap for tagging
    this.proModel = 'gemini-2.0-flash-lite'; // for bulk/re-tagging
  }

  async getApiKey() {
    const result = await chrome.storage.local.get('geminiApiKey');
    if (!result.geminiApiKey) throw new Error('Gemini API key not configured');
    return result.geminiApiKey;
  }

  // ─── Non-streaming: tagging, summarization ─────────────────
  async analyze(text, title) {
    const apiKey = await this.getApiKey();
    const prompt = this.buildTaggingPrompt(text, title);

    const response = await retryWithBackoff(() =>
      fetch(`${this.baseUrl}/models/${this.model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,       // low temp for consistent tagging
            maxOutputTokens: 256,
            responseMimeType: 'application/json',
          }
        }),
      })
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return this.parseTaggingResponse(data);
  }

  // ─── Streaming: for preview/real-time analysis ─────────────
  async *analyzeStreaming(text, title) {
    const apiKey = await this.getApiKey();
    const prompt = this.buildTaggingPrompt(text, title);

    const response = await retryWithBackoff(() =>
      fetch(`${this.baseUrl}/models/${this.model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }),
      })
    );

    if (!response.ok) throw new Error(`Gemini stream error ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const json = line.slice(6).trim();
          if (json && json !== '[DONE]') {
            yield JSON.parse(json);
          }
        }
      }
    }
  }

  buildTaggingPrompt(text, title) {
    return `You are a content analysis engine. Analyze the following article and return ONLY valid JSON.

Title: ${title}

Content: ${text.slice(0, 8000)}

Return JSON with this exact structure:
{
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "summary": "One sentence summary (max 30 words)",
  "category": "one of: technology, science, design, business, health, education, entertainment, lifestyle, news, other",
  "readingTime": estimated minutes as number
}`;
  }

  parseTaggingResponse(data) {
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = text.replace(/```(json)?/g, '').trim();
    return JSON.parse(cleaned);
  }
}
```

### 5.2 Retry Logic with Exponential Backoff + Jitter

```javascript
// core/utils/retry.js
export const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  shouldRetry: (error) => {
    // Retry on 429 (rate limit) and 5xx (server errors)
    const msg = error?.message || '';
    return msg.includes('429') || /5\d{2}/.test(msg);
  },
};

export async function retryWithBackoff(fn, options = {}) {
  const { maxAttempts, initialDelayMs, maxDelayMs, shouldRetry } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) break;

      // Add jitter: ±30% of current delay
      const jitter = delay * 0.3 * (Math.random() * 2 - 1);
      const actualDelay = Math.max(0, delay + jitter);

      await new Promise(r => setTimeout(r, actualDelay));

      delay = Math.min(maxDelayMs, delay * 2);
    }
  }

  throw lastError;
}
```

### 5.3 API Key Management

```javascript
// Stored in chrome.storage.local (not IndexedDB, not sync)
// Set via options page or onboarding

// background/gemini-client.js (within class)
async setApiKey(key) {
  if (!key || !key.startsWith('AI')) {
    throw new Error('Invalid Gemini API key format');
  }
  await chrome.storage.local.set({ geminiApiKey: key });
}

async validateApiKey() {
  try {
    const apiKey = await this.getApiKey();
    const res = await fetch(
      `${this.baseUrl}/models?key=${apiKey}`
    );
    return res.ok;
  } catch {
    return false;
  }
}
```

### 5.4 Quota & Rate Limit Handling

```javascript
// background/gemini-client.js
// Track usage to avoid hitting free tier limits
export class GeminiUsageTracker {
  constructor() {
    this.RPM_LIMIT = 60;   // Gemini free tier: 60 requests per minute
    this.RPD_LIMIT = 1500; // 1500 requests per day
  }

  async checkQuota() {
    const { usage } = await chrome.storage.local.get('geminiUsage') || { usage: null };
    if (!usage) return { ok: true };

    const now = Date.now();
    const minuteAgo = now - 60000;
    const dayAgo = now - 86400000;

    const recentMinute = usage.filter(r => r > minuteAgo);
    const recentDay = usage.filter(r => r > dayAgo);

    if (recentMinute.length >= this.RPM_LIMIT) {
      return { ok: false, reason: 'rate_limited', retryAfter: 60 };
    }
    if (recentDay.length >= this.RPD_LIMIT) {
      return { ok: false, reason: 'daily_quota_exceeded' };
    }

    return { ok: true };
  }

  async recordRequest() {
    const { usage = [] } = await chrome.storage.local.get('geminiUsage');
    usage.push(Date.now());
    // Keep only last 24h
    const cutoff = Date.now() - 86400000;
    const trimmed = usage.filter(t => t > cutoff);
    await chrome.storage.local.set({ geminiUsage: trimmed });
  }
}
```

---

## 6. Offline Architecture

### 6.1 Offline Principles

1. **IndexedDB is the source of truth** — all bookmarks, tags, and metadata are stored locally.
2. **Reads never require network** — viewing, searching, filtering all operate on local IndexedDB.
3. **Writes queue when offline** — new bookmarks go directly to IndexedDB; AI tagging is deferred.
4. **Graceful degradation** — UI indicates offline status; AI features show "available when online."

### 6.2 Offline Flow

```
┌─────────────────────────────────────────────────────┐
│ USER SAVES A BOOKMARK (offline)                      │
│                                                      │
│  1. Write to IndexedDB immediately                   │
│     → bookmark.syncStatus = 'pending_ai'             │
│     → bookmark.savedAt = Date.now()                  │
│                                                      │
│  2. Enqueue in sync_queue table                      │
│     { bookmarkId, action: 'process_ai',              │
│       payload: { textContent, title },               │
│       createdAt, retryCount: 0 }                     │
│                                                      │
│  3. Show to user immediately in popup                │
│     → Bookmarks appear with "processing" badge       │
│     → AI tags shown as "pending..."                  │
│                                                      │
│  4. SW registers chrome.alarms for periodic retry    │
│     → every 1 minute while queue non-empty           │
└──────────────────────────────────────────────────────┘
```

### 6.3 Online Detection & Queue Processing

```javascript
// background/sync-engine.js
export class SyncEngine {
  constructor(db) {
    this.db = db;
    this.processing = false;
  }

  async processQueue() {
    if (this.processing || !navigator.onLine) return;
    this.processing = true;

    try {
      const queue = await this.db.syncQueue
        .where('retryCount').below(5)
        .toArray();

      for (const item of queue) {
        try {
          await this.processItem(item);
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

    // Re-arm if still items remain
    const remaining = await this.db.syncQueue.count();
    if (remaining > 0 && navigator.onLine) {
      chrome.alarms.create('sync-pending', { delayInMinutes: 1 });
    }
  }

  async processItem(item) {
    switch (item.action) {
      case 'process_ai': {
        const gemini = new GeminiClient();
        const result = await gemini.analyze(
          item.payload.textContent,
          item.payload.title
        );
        await this.db.bookmarks.update(item.bookmarkId, {
          aiTags: result.tags,
          aiSummary: result.summary,
          suggestedCategory: result.category,
          aiProcessed: true,
          aiProcessedAt: Date.now(),
          syncStatus: 'synced',
        });
        break;
      }
      // future: add 'sync_to_server', 'export', etc.
    }
  }

  async hasPending() {
    const count = await this.db.syncQueue.count();
    return count > 0;
  }
}
```

### 6.4 Offline UI State

```javascript
// popup/popup.js
const networkStatus = document.getElementById('network-status');

window.addEventListener('online', () => {
  networkStatus.textContent = '';
  networkStatus.className = '';
  processPendingSync();
});

window.addEventListener('offline', () => {
  networkStatus.textContent = 'Offline — AI tagging will process when connected';
  networkStatus.className = 'offline-badge';
});
```

---

## 7. IndexedDB Schema Design

### 7.1 Dexie Schema Definition

```javascript
// core/db/schema.js
import Dexie from 'dexie';

export const db = new Dexie('AIContentCurator');

db.version(1).stores({
  // ─── Bookmarks (primary data) ──────────────────────────────
  bookmarks: `
    ++id,
    url,                  // indexed for dedup lookup
    domain,               // indexed for domain-based queries
    savedAt,              // indexed for sort by date
    categoryId,           // indexed for category filter
    *aiTags,              // multi-entry index (each tag indexed)
    *userTags,            // multi-entry index
    aiProcessed,          // indexed for "processing" filter
    syncStatus            // 'pending_ai', 'synced', 'failed'
  `,

  // ─── Tags (user-defined) ────────────────────────────────────
  tags: `
    ++id,
    name,                 // unique tag name
    &name,                // unique constraint
    color,                // hex color for UI badge
    createdAt
  `,

  // ─── Categories (user-defined folders) ──────────────────────
  categories: `
    ++id,
    &name,                // unique category name
    icon,                 // emoji or icon name
    color,                // hex color
    sortOrder,            // for drag-reorder
    createdAt
  `,

  // ─── Offline sync queue ─────────────────────────────────────
  syncQueue: `
    ++id,
    bookmarkId,           // FK to bookmarks (not enforced by Dexie)
    action,               // 'process_ai', 'sync_to_server'
    retryCount,
    createdAt
  `,

  // ─── Sessions (browser sessions) ────────────────────────────
  sessions: `
    ++id,
    &sessionId,           // UUID
    startedAt,
    lastActiveAt,
    tabCount
  `
});

// ─── Indexes explained ─────────────────────────────────────────
// bookmarks:
//   ++id           → auto-increment PK
//   url            → lookup by URL (dedup check)
//   domain         → group by domain
//   savedAt        → sort by recency
//   *aiTags        → multi-entry: one index entry per tag value
//   *userTags      → multi-entry: allows filtering by any tag
//   aiProcessed    → filter unprocessed bookmarks
//   syncStatus     → filter pending/failed sync items
//
// tags:
//   ++id           → auto-increment PK
//   &name          → unique constraint, indexed
//
// categories:
//   ++id           → auto-increment PK
//   &name          → unique constraint, indexed
```

### 7.2 Document Shape

```javascript
// ─── Bookmark Document ────────────────────────────────────────
const bookmarkExample = {
  // Auto-generated
  id: 1,

  // Page metadata (from content script)
  url: 'https://example.com/article',
  title: 'How to Build Chrome Extensions',
  description: 'A comprehensive guide...',
  favicon: 'https://example.com/favicon.ico',
  ogImage: 'https://example.com/og-image.jpg',
  domain: 'example.com',
  textContent: 'Full extracted text...', // stored for AI processing & offline reading
  wordCount: 2450,
  publishedAt: '2026-01-15T00:00:00Z',  // original publish date

  // User-defined metadata
  userTags: ['development', 'chrome'],
  notes: 'Great reference for MV3 patterns',
  categoryId: 2,  // FK to categories.id
  isFavorite: false,
  readStatus: 'unread',  // 'unread' | 'reading' | 'read' | 'archived'

  // AI-generated metadata
  aiTags: ['web-dev', 'browser-extensions', 'tutorial', 'javascript'],
  aiSummary: 'Guide to building Chrome extensions with Manifest V3 patterns.',
  suggestedCategory: 'technology',
  aiProcessed: true,
  aiProcessedAt: 1705012345678,

  // Timestamps
  savedAt: 1705012345678,
  updatedAt: 1705012345678,

  // Sync status
  syncStatus: 'synced',  // 'pending_ai' | 'synced' | 'failed'
};

// ─── Tag Document ─────────────────────────────────────────────
const tagExample = {
  id: 1,
  name: 'development',
  color: '#3B82F6',
  createdAt: 1705012345678,
};

// ─── Category Document ────────────────────────────────────────
const categoryExample = {
  id: 1,
  name: 'Tech',
  icon: '💻',
  color: '#6366F1',
  sortOrder: 0,
  createdAt: 1705012345678,
};

// ─── Sync Queue Document ──────────────────────────────────────
const syncQueueExample = {
  id: 1,
  bookmarkId: 1,
  action: 'process_ai',
  payload: {
    textContent: 'Full extracted text...',
    title: 'How to Build Chrome Extensions',
  },
  retryCount: 0,
  lastError: null,
  lastAttemptAt: null,
  createdAt: 1705012345678,
};
```

### 7.3 Repository Layer

```javascript
// core/db/bookmark-repo.js
export class BookmarkRepo {
  async add(bookmark) {
    // Dedup check by URL
    const existing = await db.bookmarks
      .where('url')
      .equals(bookmark.url)
      .first();

    if (existing) {
      // Update existing bookmark
      await db.bookmarks.update(existing.id, {
        ...bookmark,
        updatedAt: Date.now(),
        savedAt: existing.savedAt, // preserve original save date
      });
      return { id: existing.id, isUpdate: true };
    }

    const id = await db.bookmarks.add({
      ...bookmark,
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
    return db.bookmarks
      .where('aiProcessed')
      .equals(0)
      .toArray();
  }

  async delete(id) {
    await db.bookmarks.delete(id);
    // Also clean up related sync queue items
    await db.syncQueue
      .where('bookmarkId')
      .equals(id)
      .delete();
  }
}
```

### 7.4 Dexie Live Queries for Popup

```javascript
// popup/popup.js
import { db } from '../core/db/schema.js';
import { liveQuery } from 'dexie';

// Reactive bookmark list — auto-updates when DB changes
const bookmarkObservable = liveQuery(() =>
  db.bookmarks
    .orderBy('savedAt')
    .reverse()
    .limit(50)
    .toArray()
);

bookmarkObservable.subscribe({
  next: (bookmarks) => renderBookmarkList(bookmarks),
  error: (err) => showError(err),
});
```

---

## 8. Sync & Session Management

### 8.1 Session Cache (`chrome.storage.session`)

Use `chrome.storage.session` (RAM-backed, survives SW restarts within browser session) for ephemeral state:

```javascript
// core/utils/session.js
export const SessionCache = {
  async get(key) {
    const result = await chrome.storage.session.get(key);
    return result[key];
  },

  async set(key, value) {
    await chrome.storage.session.set({ [key]: value });
  },

  async getOrFetch(key, fetchFn, ttlMs = 300000) {
    const cached = await this.get(key);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) {
      return cached.data;
    }
    const data = await fetchFn();
    await this.set(key, { data, fetchedAt: Date.now() });
    return data;
  },
};

// Usage: cache Gemini model list for 5 min
const models = await SessionCache.getOrFetch(
  'gemini-models',
  () => geminiClient.listModels(),
  300000
);
```

### 8.2 Session Management Data

```javascript
// core/db/schema.js (sessions table)
// Keeps track of user's current browsing session stats

const sessionExample = {
  id: 1,
  sessionId: 'uuid-v4',
  startedAt: 1705012345678,
  lastActiveAt: 1705012345678,
  bookmarksSavedThisSession: 3,
  tabsProcessed: 12,
};
```

### 8.3 Storage Strategy Summary

| Data Type | Storage | Why |
|-----------|---------|-----|
| Bookmarks, Tags, Categories | IndexedDB (Dexie) | Structured, queryable, large data, offline-first |
| Gemini API key | `chrome.storage.local` | Secret, small, never synced |
| User preferences (theme, sort order) | `chrome.storage.local` | Small, key-value |
| Current tab cache, transient state | `chrome.storage.session` | RAM-backed, survives SW restart |
| AI usage counters | `chrome.storage.local` | Small, persisted across sessions |
| Sync queue | IndexedDB (Dexie) | Needs querying by status, retry count |
| Export/backup | Dexie export + file download | Full DB snapshot as JSON |

### 8.4 Background Sync Architecture (Queue-Based)

```
              ┌──────────────────┐
              │ User saves       │
              │ bookmark (online)│
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Write to Dexie   │  ← Always immediate
              │ syncStatus =     │
              │ 'pending_ai'     │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Add to syncQueue │  ← Queue item
              │ { action:        │
              │   'process_ai' } │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │ Check online?    │
              └────────┬─────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
       ┌─────────┐         ┌──────────────┐
       │ Online  │         │ Offline      │
       └────┬────┘         └──────┬───────┘
            │                     │
            ▼                     ▼
    ┌────────────────┐    ┌─────────────────┐
    │ Process queue   │    │ Reg alarm to    │
    │ immediately     │    │ retry in 1 min  │
    │ (throttled)     │    │ (chrome.alarms) │
    └────────────────┘    └─────────────────┘
            │
            ▼
    ┌────────────────┐
    │ On success:     │
    │ delete queue    │
    │ item, update    │
    │ bookmark sync   │
    │ status          │
    └────────────────┘
```

### 8.5 Export / Restore (Backup)

```javascript
// background/message-router.js
async handleExport() {
  const blob = await db.export();
  const url = URL.createObjectURL(blob);

  // Use offscreen document to trigger download
  await chrome.offscreen.createDocument({
    url: 'offscreen/export.html',
    reasons: ['DOWNLOAD'],
    justification: 'Export bookmark data as JSON',
  });

  // Send blob URL to offscreen via message
  chrome.runtime.sendMessage({
    action: 'download',
    url,
    filename: `ai-content-curator-backup-${Date.now()}.json`,
  });

  return { exported: true };
}
```

---

## Appendix: Performance & Security Guidelines

### Security

1. **API key**: Stored in `chrome.storage.local` only. Never in content scripts, never in IndexedDB, never in URLs or headers visible to pages.
2. **Content scripts**: Have zero access to the API key. They send raw page data to SW; SW adds the key.
3. **Message validation**: All `onMessage` handlers must validate `sender.origin` or `sender.id` to prevent cross-extension spoofing.
4. **CORS**: All Gemini API calls originate from SW (extension context), not content scripts, avoiding CORS issues.
5. **No remote code**: MV3 bans remote code execution. All JS is bundled. Gemini response parsing uses `JSON.parse` only — never `eval`.

### Performance

1. **Batch AI calls**: If user saves multiple pages rapidly, debounce or batch AI tagging (e.g., process max 1 per 2 seconds to stay under rate limits).
2. **IndexedDB limits**: ~60% of available disk space (Chrome). Monitor via `navigator.storage.estimate()`.
3. **textContent truncation**: Truncate extracted text to 8000 characters for Gemini prompts (token limit safety).
4. **Live queries**: Use Dexie `liveQuery` in popup but unsubscribe when popup closes (via `port.onDisconnect`).
5. **SW cold start**: First message after SW restart may be slow (~300-800ms). Show loading state in UI. Use `chrome.storage.session` to cache frequently accessed data.

### Error Recovery Matrix

| Failure Point | Impact | Recovery |
|---------------|--------|----------|
| SW terminates mid-Gemini-call | Lost API result | Queue item remains; retry on next wake |
| Popup closes mid-save | Bookmark not saved | Use `chrome.storage.session` to stage before SW call |
| Content script not injected | No page data | Fallback: inject via `chrome.scripting.executeScript` |
| Gemini API rate limit (429) | AI tagging fails | Retry with backoff; show "pending" in UI |
| IndexedDB full | Cannot save | Show warning; offer export option |
| Network offline | AI tagging deferred | Queue item; process when online |

---

*Document generated for AI Content Curator project — Chrome Extension Manifest V3*
