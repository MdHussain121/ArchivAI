# STACK.md — AI Content Curator

## Technology Stack Research & Best Practices

---

## 1. Manifest V3: Best Practices

### Service Worker Lifecycle (Critical)

Unlike Manifest V2's persistent background page, MV3 uses an **ephemeral service worker** that Chrome terminates after ~30 seconds of inactivity. This is the single most important constraint to design around.

**Key rules:**
- Register all event listeners **synchronously at the top level** — listeners inside async callbacks or functions will not be registered when the worker wakes from hibernation
- Do **not** rely on global variables for state — they are destroyed on termination
- Use `chrome.storage.session` for ephemeral data that survives terminations but not browser restarts
- Use `chrome.storage.local` for persistent data across browser restarts
- Use `chrome.alarms` instead of `setTimeout`/`setInterval` for scheduled tasks (minimum interval: 1 minute)
- The service worker **cannot access the DOM** — use an **offscreen document** if you need DOM operations

### Permissions Model

**Principle of least privilege.** Every permission appears in the Chrome Web Store listing and can deter installs.

| Permission | When to use |
|---|---|
| `storage` | Saving API key, user preferences |
| `activeTab` | Accessing the current tab only when user clicks the extension icon |
| `scripting` | Programmatic script injection (use with `activeTab`) |
| `alarms` | Periodic background tasks |
| `sidePanel` | Side panel UI (if used) |
| `host_permissions` | **Only** for `https://generativelanguage.googleapis.com/*` to call Gemini API |

**Recommended manifest for this project:**
```json
{
  "manifest_version": 3,
  "name": "AI Content Curator",
  "version": "1.0.0",
  "description": "Auto-tag, categorize, and summarize web pages using Gemini AI.",
  "permissions": ["storage", "activeTab", "scripting", "alarms"],
  "host_permissions": ["https://generativelanguage.googleapis.com/*"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
  },
  "options_ui": {
    "page": "options/options.html",
    "open_in_tab": false
  }
}
```

- Use `activeTab` (grants one-time access to the current tab on click) instead of broad `<all_urls>` host permissions
- Request additional permissions at runtime via `chrome.permissions.request()` only when the user triggers a feature that needs them
- The `"host_permissions"` for `https://generativelanguage.googleapis.com/*` is required so the service worker can `fetch()` the Gemini API

### CSP in MV3

- **Inline scripts are banned** in extension pages (popup, options, sidepanel). All JS must be in separate `.js` files
- Move all CSS into external stylesheets; inline styles via `style` attribute are fine but `<style>` tags in HTML are not

---

## 2. Vanilla JS File Organization Pattern

### Recommended Structure

```
ai-content-curator/
├── manifest.json
├── background.js              # Service worker — API calls, storage coordination, message routing
├── content.js                 # Content script — DOM extraction, sends page data to background
├── content.css                # Content script styles (if injecting UI into pages)
├── popup/
│   ├── popup.html
│   ├── popup.js               # Popup UI logic — displays curated tags/summary
│   └── popup.css              # Popup styles — neo-brutalism
├── options/
│   ├── options.html
│   ├── options.js             # Settings — API key input, preferences
│   └── options.css            # Options styles — neo-brutalism
├── lib/
│   ├── db.js                  # Dexie database initialization and schema
│   ├── gemini.js              # Gemini API wrapper (fetch, retry, rate limiting)
│   └── utils.js               # Shared helpers (text truncation, URL parsing, etc.)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Architecture Principle: Layered Responsibility

```
┌──────────────────────────────────────────────────┐
│  POPUP / OPTIONS / SIDEPANEL (UI Layer)          │
│  - Presentation only                             │
│  - Communicates via chrome.runtime.sendMessage   │
├──────────────────────────────────────────────────┤
│  BACKGROUND SERVICE WORKER (Coordination Layer)  │
│  - Gemini API calls, Dexie DB operations         │
│  - Message routing, state coordination           │
│  - chrome.alarms for periodic re-summarization   │
├──────────────────────────────────────────────────┤
│  CONTENT SCRIPT (Page Interaction Layer)         │
│  - Extracts page text, metadata, links           │
│  - Thin — no business logic                      │
│  - Sends extracted data to background via msg    │
└──────────────────────────────────────────────────┘
```

**Key rule:** Content scripts stay thin. The background worker handles all privileged logic (API calls, storage). Popup/Options are pure UI. This prevents scattered logic and makes the codebase maintainable.

---

## 3. Dexie.js + IndexedDB Best Practices

### Why Dexie over raw IndexedDB or chrome.storage

| Feature | chrome.storage | raw IndexedDB | Dexie.js |
|---|---|---|---|
| Query/index support | Key-value only | Complex API | Declarative, chainable |
| Schema versioning | Manual | Manual | Built-in via `db.version()` |
| Large data | 1MB per item (local), 8KB per item (sync) | No limit | No limit |
| Search/filter | No | Manual indexes | `.where()`, `.filter()`, `.toArray()` |
| Live queries | No | No | `liveQuery()` (Dexie 4) |

For an "AI Content Curator" that stores page content, tags, summaries, and metadata, **Dexie.js is the right choice** — you need to query by tags, date, category, and URL.

### Schema Design

```js
// lib/db.js
import Dexie from 'dexie';

const db = new Dexie('AIContentCurator');

db.version(1).stores({
  pages: '++id, url, *tags, category, dateSaved, title',
  summaries: '&url, summary, generatedAt, model',
  cache: '&url, content, capturedAt'
});
```

**Schema syntax:**
- `++id` — auto-incrementing primary key
- `&url` — unique index (only one per URL)
- `*tags` — multi-entry index (array of strings, each value indexed individually)
- `dateSaved` — simple index for range queries

### Database Operations

```js
// Save a page with auto-tags
await db.pages.add({
  url: pageUrl,
  title: pageTitle,
  content: pageContent,      // stored but NOT indexed (keep binary/text out of indexes)
  tags: ['javascript', 'ai'], // *tags makes each searchable
  category: 'development',
  dateSaved: new Date().toISOString()
});

// Query by tag
const taggedPages = await db.pages.where('tags').equals('ai').toArray();

// Query by date range
const recentPages = await db.pages.where('dateSaved')
  .between('2026-01-01', '2026-06-11')
  .toArray();

// Get summary by URL
const summary = await db.summaries.get(pageUrl);
```

### Key Anti-Patterns to Avoid

- **Do not index large text fields** — only `tags`, `category`, `url`, `title`, `dateSaved` should be in the schema. The full page `content` is stored but not indexed.
- **Do not stack version blocks** — in Dexie 3+, edit the existing block and increment the number. Only use multiple version blocks when running an `upgrade()` migrator.
- **Do not assume persistence** — IndexedDB is "best-effort" by default. Call `navigator.storage.persist()` at app init if you want to prevent the browser from evicting your data under disk pressure.

```js
// Request persistent storage (call once on install)
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      await navigator.storage.persist();
    }
  }
}
```

### Where to Initialize Dexie

Initialize the Dexie database **in the service worker** (background.js), since it's the centralized coordinator. The popup and content scripts send messages to the background to perform DB operations rather than directly accessing IndexedDB.

---

## 4. Gemini API Integration from a Chrome Extension

### API Key Handling (Critical Security)

**Never hardcode the API key** in the extension source code. The official Google sample (ai.gemini-in-the-cloud) puts it in `sidepanel/index.js` but warns:

> "It is only OK to put your API key into this file if you're the only user of your extension or for testing."

**For production:**
1. Let users provide their **own API key** via the Options page
2. Store it in `chrome.storage.local` (encrypted at rest by Chrome)
3. Only access it from the **service worker** — never send it to content scripts or popup
4. The API key is used as a URL query parameter: `?key=${apiKey}` — this is only safe when the request originates from the service worker (not a web page)

```js
// lib/gemini.js (loaded by background.js via import or self-contained)
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.0-flash';

async function getApiKey() {
  const result = await chrome.storage.local.get('geminiApiKey');
  return result.geminiApiKey;
}

export async function callGemini(prompt, systemInstruction) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');

  const url = `${API_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,        // Lower temp for more deterministic categorization
        maxOutputTokens: 1024,
        topP: 0.95
      }
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
```

### Message Passing Pattern (Background as API Proxy)

```
CONTENT SCRIPT                    BACKGROUND                     GEMINI API
─────────────                     ──────────                     ──────────
Extracts page text                Receives message               
  ──sendMessage({action:            ──callGemini(prompt,             ──POST /v1beta/...
    "summarize", content})            systemInstruction)               ──response
                                  Stores result in Dexie          
  <──sendResponse({success,       Sends result back               
       data})                                                     
```

```js
// background.js — message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarize(request.content)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keeps channel open for async response
  }

  if (request.action === 'tag') {
    handleTagging(request.content)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});
```

### Rate Limiting & Exponential Backoff

The Gemini API free tier has rate limits (requests per minute). Implement your own exponential backoff with jitter since the Google SDK is not available in a service worker context:

```js
async function fetchWithRetry(url, options, maxRetries = 5) {
  const baseDelay = 1000; // 1 second

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // 429 = rate limited, 5xx = server error — both retryable
      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries) throw new Error(`HTTP ${response.status} after ${maxRetries} retries`);

        const delay = Math.min(baseDelay * Math.pow(2, attempt), 60000);
        const jitter = Math.random() * delay * 0.5;
        await new Promise(r => setTimeout(r, delay + jitter));
        continue;
      }

      // 4xx other than 429 — client error, do not retry
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      // Network errors are also retryable
      const delay = Math.min(baseDelay * Math.pow(2, attempt), 60000);
      const jitter = Math.random() * delay * 0.5;
      await new Promise(r => setTimeout(r, delay + jitter));
    }
  }
}
```

**Retry strategy summary:**
- Retry on `429` (rate limit), `500`/`502`/`503` (server errors), and network failures
- Cap retries at **5 attempts**
- Exponential backoff: `delay = min(1000ms * 2^attempt, 60000ms)`
- Add random jitter (0–50% of delay) to prevent thundering herd
- Do **not** retry on `400`/`401`/`403` (client errors — invalid key or request)

### Chunking Long Content

For long pages, truncate or chunk content to stay within Gemini's context window (gemini-2.0-flash: 1M tokens, but shorter = faster + cheaper):

```js
const MAX_CHARS = 80000; // ~20K tokens, safe buffer

function truncateContent(text) {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + '\n\n[... content truncated ...]';
}
```

---

## 5. Content Script vs Popup vs Background: When to Use What

| Component | Lifetime | DOM Access | Chrome APIs | Purpose |
|---|---|---|---|---|
| **Background (Service Worker)** | Ephemeral, event-driven | No | Full | API calls, DB ops, message routing, alarms |
| **Content Script** | Per page load, per tab | Yes (page DOM) | Limited (storage, runtime, messaging) | Extract page content, metadata |
| **Popup** | While popup is open | No (own DOM only) | Full | Display tags/summary, user actions |
| **Options** | While options tab is open | No (own DOM only) | Full | API key input, preferences |

### Decision Matrix for This Project

| Task | Runs In | Why |
|---|---|---|
| Extract page title, text, meta tags | **Content script** | Needs page DOM |
| Send extracted content to Gemini for tagging/summarization | **Background** | API key security, fetch from non-page origin |
| Store tags, summaries, metadata in IndexedDB | **Background** | Centralized coordinator; Dexie runs here |
| Display curated tags and summary to user | **Popup** | Lightweight UI on toolbar click |
| Auto-tag pages periodically or on navigation | **Background** via alarm | Service worker can trigger re-scan |
| Save user's API key | **Options** page | Dedicated settings page |

### Communication Flow

```
User clicks extension icon
  → Popup opens
  → Popup sends message to background:
       "get me the tags/summary for this URL"
  → Background queries Dexie by URL
  → If found: return cached data
  → If not found: ask content script (via messaging) to extract page
  → Content script extracts DOM, sends it to background
  → Background calls Gemini API
  → Background saves to Dexie
  → Background responds to popup
  → Popup renders tags + summary
```

---

## 6. Secure API Key Storage

### The Problem

The Gemini API key is a query parameter: `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent?key=API_KEY`. If a malicious script on a web page could initiate that request, it could steal the key from the URL. Chrome's extension architecture mitigates this:

### Security Layers

1. **Store in `chrome.storage.local`** — The key is never in a variable that content scripts or web pages can access. Only the service worker can read it.
2. **Service worker only** — All fetch() calls to the Gemini API originate from the service worker, not from content scripts or popup. The API key is never sent to the renderer.
3. **User-provided key** — Each user provides their own key via the Options page. The extension never ships with a hardcoded key.
4. **No backend proxy needed** — Because the call originates from the extension's service worker (not a public web page), the API key in the URL is not exposed to third parties.

### Implementation in Options Page

```html
<!-- options/options.html -->
<form id="settings-form">
  <label for="api-key">Gemini API Key</label>
  <input type="password" id="api-key" placeholder="Paste your Gemini API key" />
  <button type="submit">Save</button>
  <button type="button" id="test-key">Test Key</button>
  <p id="status"></p>
</form>
```

```js
// options/options.js
document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('api-key').value.trim();
  if (!key) return;

  // Store securely — only readable by the extension's own contexts
  await chrome.storage.local.set({ geminiApiKey: key });

  // Notify background to pick up the new key
  await chrome.runtime.sendMessage({ action: 'apiKeyUpdated' });

  document.getElementById('status').textContent = 'Saved!';
});
```

### What NOT to Do

- ❌ Hardcode the API key in source code
- ❌ Store the key in `chrome.storage.sync` (sync is for preferences, not secrets — though it is encrypted, `local` is more appropriate for keys)
- ❌ Pass the key to content scripts via messaging
- ❌ Include the key in the popup's JavaScript context
- ❌ Commit the key to version control (use `.gitignore` if testing locally)

---

## 7. Neo-Brutalism CSS Approach

### Design Characteristics

- **Bold, thick borders** (3–4px solid black)
- **Strong drop shadows** with noticeable offsets (e.g., `4px 4px 0px #000`)
- **High contrast** — black text on white background, or white on black
- **Raw typography** — system fonts or bold grotesk fonts (Space Grotesk, Inter)
- **Vibrant accent colors** — used sparingly for emphasis
- **Simple geometric shapes** — hard corners or minimal border-radius
- **Unpolished, raw aesthetic** — intentionally "ugly-beautiful"

### Recommended Approach: Custom Minimal CSS (No Framework)

For a Chrome extension (size matters), **writing a small custom CSS file** is better than pulling in a full framework. Extensions should be <5MB. A neo-brutalism design system can be expressed in ~200 lines of CSS.

### CSS Custom Properties (Design Tokens)

```css
/* popup/popup.css — neo-brutalism design tokens */
:root {
  /* Colors */
  --color-bg: #ffffff;
  --color-text: #000000;
  --color-accent: #ff6b35;      /* Orange */
  --color-accent-secondary: #0047ab; /* Bold blue */
  --color-border: #000000;
  --color-surface: #f5f5f5;
  --color-error: #ff0000;
  --color-success: #00aa00;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Borders */
  --border-thick: 3px solid var(--color-border);
  --border-thicker: 4px solid var(--color-border);

  /* Shadows */
  --shadow-brutal: 4px 4px 0px var(--color-border);
  --shadow-brutal-lg: 6px 6px 0px var(--color-border);

  /* Typography */
  --font-family: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
  --font-size-sm: 12px;
  --font-size-base: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;

  /* Radius */
  --radius-none: 0px;
  --radius-sm: 4px;
}
```

### Core Neo-Brutalism Components

```css
/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  font-weight: 700;
  border: var(--border-thick);
  box-shadow: var(--shadow-brutal);
  cursor: pointer;
  transition: all 0.05s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--color-accent);
  color: #fff;
}
.btn:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0px var(--color-border);
}
.btn--secondary {
  background: var(--color-bg);
  color: var(--color-text);
}

/* Cards */
.card {
  background: var(--color-bg);
  border: var(--border-thick);
  box-shadow: var(--shadow-brutal);
  padding: var(--space-md);
}
.card__title {
  font-size: var(--font-size-lg);
  font-weight: 800;
  margin: 0 0 var(--space-sm);
  text-transform: uppercase;
}
.card__body {
  font-size: var(--font-size-base);
  line-height: 1.5;
}

/* Tags / Badges */
.tag {
  display: inline-block;
  padding: 2px var(--space-sm);
  font-size: var(--font-size-sm);
  font-weight: 700;
  border: 2px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.tag--ai     { background: #ff6b35; color: #fff; }
.tag--dev    { background: #0047ab; color: #fff; }
.tag--design { background: #00aa00; color: #fff; }

/* Inputs */
.input {
  width: 100%;
  padding: var(--space-sm) var(--space-sm);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  border: var(--border-thick);
  box-shadow: var(--shadow-brutal);
  background: var(--color-bg);
  outline: none;
}
.input:focus {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0px var(--color-border);
}

/* Dividers / Strips (neo-brutalism signature) */
.strip {
  height: 8px;
  width: 100%;
  background: var(--color-accent);
  border: var(--border-thick);
  border-left: none;
  border-right: none;
}
```

### Available Libraries (If You Want to Use One)

| Library | Notes | Best For |
|---|---|---|
| **@thedevrealm/neo-css** | Pure CSS, 0-dependency, design tokens, component classes, animations. Install via `npm i @thedevrealm/neo-css` or CDN. Framework-agnostic. | If you want a drop-in CSS file with a complete neo-brutalism token system |
| **NeoBrutalismCSS** (npm `neobrutalismcss`) | <100KB, pure CSS, component classes, CDN available. By Matias Fandiño. | Lightweight, no-build option |
| **Walikuperek/Neo-brutalism-CSS** | Pure CSS, modular (import what you need), zero dependencies, Space Grotesk font | DIY with modular imports |
| **Custom (recommended for this project)** | ~150 lines of CSS, exactly what you need. No unused styles, minimal size. | Best for a Chrome extension where every KB matters |

**Recommendation:** Custom CSS with the tokens above. It's small, fully under your control, and avoids any dependency issues with extension bundling.

### HTML Example: Popup Layout

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <div class="popup">
    <header class="popup__header">
      <h1 class="popup__title">AI Curator</h1>
      <div class="strip"></div>
    </header>

    <main class="popup__content">
      <div class="card">
        <h2 class="card__title">Page Tags</h2>
        <div class="card__body" id="tags-container">
          <span class="tag tag--ai">AI</span>
          <span class="tag tag--dev">JavaScript</span>
        </div>
      </div>

      <div class="card">
        <h2 class="card__title">Summary</h2>
        <p class="card__body" id="summary-text">
          Click "Summarize" to generate an AI summary of this page.
        </p>
      </div>

      <button class="btn" id="summarize-btn">Summarize Page</button>
    </main>

    <footer class="popup__footer">
      <a href="#" id="open-options">Settings</a>
    </footer>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

---

## 8. Additional Architecture Notes

### Dexie Lifecycle in the Service Worker

Dexie uses IndexedDB in the service worker. Since the service worker terminates, Dexie will reconnect transparently on wake. There is no special handling needed — Dexie handles this.

### Periodic Tasks with chrome.alarms

```js
// background.js
chrome.runtime.onInstalled.addListener(() => {
  // Scan for new content every 30 minutes
  chrome.alarms.create('recurringScan', { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'recurringScan') {
    // Iterate recent pages, check if they need re-summarization
  }
});
```

### Bundle-Free Development

This project uses vanilla JS. No bundler is required. The extension loads individual files. However, if you want to use `npm` packages (Dexie, @google/genai), you need a bundler step:

```
npm install dexie
npx esbuild lib/db.js --bundle --outfile=dist/db-bundle.js --format=esm
```

Or use importmaps in the service worker:

```json
// manifest.json
"background": {
  "service_worker": "background.js",
  "type": "module"
}
```

```js
// background.js with import (needs bundler for npm dependencies)
import Dexie from 'dexie';
```

**Alternative:** Use CDN copies of Dexie in popup/options HTML with `<script>` tags, and keep the service worker lean.

### Error Handling Strategy

- Gemini API errors → show user-friendly message in popup ("API key invalid", "Rate limited, try later")
- Dexie/IndexedDB errors → fall back to `chrome.storage.local` for critical settings
- Network errors → retry with backoff (max 3 attempts), then show "Offline" state
- Content script extraction fails → show "Could not read page content" with fallback manual input option

---

## References

- Official MV3 Docs: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
- Google Gemini in Extension Sample: https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/ai.gemini-in-the-cloud
- Dexie.js Docs: https://dexie.org/docs
- Gemini API Docs: https://ai.google.dev/gemini-api/docs
- Gemini Error Handling: https://ai.google.dev/gemini-api/docs/troubleshooting
- NeoBrutalismCSS Library: https://matifandy8.github.io/NeoBrutalismCSS/
