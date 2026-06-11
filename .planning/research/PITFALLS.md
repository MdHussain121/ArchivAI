# PITFALLS.md — AI Content Curator
## Common Pitfalls, Security Concerns & Chrome Web Store Gotchas

**Extension:** AI Content Curator (Manifest V3, Gemini API, IndexedDB/Dexie.js)
**Date:** 2026-06-11

---

## 1. Chrome Web Store Review Gotchas — What Gets Extensions Rejected

Google's review process has both automated scanners and human reviewers. Based on 2025-2026 rejection data, the most common rejection reasons are:

| Reason | How It Bites You |
|--------|-----------------|
| **Unnecessary permissions** | #1 rejection cause. Requesting `<all_urls>` when you only need `activeTab` + specific host permissions triggers rejection or manual review hell. |
| **Insufficient permission justification** | You must explain in your store listing *why* each permission is needed. Vague descriptions get flagged. |
| **Remotely-hosted code** | MV3 bans loading external JS. Any `eval()`, `new Function()`, blob URL workers, or CDN-loaded scripts will get rejected. PostHog had extensions rejected for this in 2024. |
| **Obfuscated/minified code** | Google flags code that is hard to understand during review. If you bundle/minify too aggressively, they may reject as "obfuscated". Ship readable source maps or unminified bundles. |
| **Vague or misleading description** | "AI-powered content tool" is not enough. Be specific: "Saves web pages and automatically tags them with AI via Google Gemini." |
| **Broken functionality** | Dead links, non-functional features, or placeholder UI = instant rejection. |
| **No privacy policy** | If you handle *any* user data (page content, browsing activity, API keys), you MUST have a publicly hosted privacy policy URL. |
| **Single purpose violation** | Your extension must have one clearly defined purpose. Don't bundle unrelated features. |

**Key takeaway:** Audit your `manifest.json` permissions ruthlessly. Every permission must be justified in your store description. Most new extensions take 7-14 days for first review — plan for this.

---

## 2. Manifest V3 Permission Pitfalls (activeTab vs <all_urls>)

MV3 split permissions into three separate manifest keys:

```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://*.googleapis.com/*"],
  "optional_host_permissions": ["https://*/*"]
}
```

### The activeTab Strategy (USE THIS)

`activeTab` grants temporary access to the current tab ONLY when the user explicitly invokes your extension (clicks icon, uses keyboard shortcut, context menu). It:
- Shows **no install warning** to users
- Grants access to the tab's URL, title, and content
- Lets you inject scripts via `chrome.scripting.executeScript`

**For AI Content Curator:** You likely need `activeTab` for reading the current page content when the user clicks "Save". Pair it with `scripting` to inject content scripts that extract the page body/DOM.

### When You Need Host Permissions

You need explicit `host_permissions` for:
- Making fetch calls to the Gemini API (`https://generativelanguage.googleapis.com/*`)
- Accessing sites proactively (without user click) — but you probably don't need this

### The <all_urls> Trap

`<all_urls>` triggers the terrifying permission warning: *"Read and change all your data on all websites"*. This:
- Crushes install conversion rates (estimated 15%+ drop per permission warning)
- Triggers enhanced manual review (2-5x longer)
- Often gets rejected outright if the reviewer thinks you don't need it

**Rule:** Never use `<all_urls>`. Use `activeTab` + specific Gemini API host permissions. If you need broader site access, use `optional_host_permissions` and request at runtime.

---

## 3. Content Security Policy (CSP) Issues — External API Calls

MV3 enforces a strict default CSP on extension pages:

```
script-src 'self'; object-src 'self';
```

### What This Means for Gemini API Calls

**Good news:** CSP only restricts *scripts and resources loaded into extension pages*. Making `fetch()` calls to external APIs (like Gemini) is allowed. You do NOT need to relax CSP for API calls — CSP controls what executes, not what you connect to.

**Bad news:** You CANNOT:
- Use `eval()`, `new Function()`, or `setTimeout(string)` in extension pages
- Load scripts from CDNs in your popup or options page
- Use blob URLs to create workers (this got PostHog's extension rejected)
- Use inline `<script>` tags in extension HTML pages

### The Minimum CSP (you cannot relax it further)

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
}
```

You CAN add `'wasm-unsafe-eval'` for WebAssembly. You CANNOT add `'unsafe-eval'` or external script sources.

### Popup/Options Page Workaround

If you need a third-party library in your popup, bundle it into your extension package. Do not load from a CDN.

---

## 4. Gemini API Key Security — NEVER Hardcode

**This is the #1 security mistake in AI extensions.** Chrome extensions are just ZIP files. Anyone can:
1. Download your `.crx` or find the unpacked extension folder
2. Open the bundled JS files
3. Search for `AIzaSy` or similar patterns
4. Use your key to rack up $10,000+ in Gemini API charges

### The ONLY Safe Approach: Bring Your Own Key (BYOK)

**Never** ship a Gemini API key in your extension code. The correct pattern:

```
User registers for Gemini API key → User enters key in extension settings → Key stored in chrome.storage.sync/local → Extension reads key at runtime for API calls
```

### Storage Options for the API Key

| Storage | Pros | Cons |
|---------|------|------|
| `chrome.storage.sync` | Syncs across Chrome installs | 100KB quota, not encrypted |
| `chrome.storage.local` | Unlimited quota (subject to browser limits) | Local only, not encrypted |
| **`chrome.storage.session`** | In-memory only, cleared when SW restarts | Only for transient use — combine with local for persistence |

**Important:** `chrome.storage` is NOT encrypted at rest on disk. For a production extension, consider using the `chrome.identity` API with OAuth or encrypting the key with a user-provided passphrase.

### Rate Limit Implications of BYOK

Users on the free Gemini tier get ~10 RPM / 250 RPD for Gemini 2.5 Flash. Warn users about this. If you expect heavy usage, prompt them to enable billing (Tier 1+).

---

## 5. IndexedDB Storage Limits in Chrome Extensions

### How Much Can You Store?

IndexedDB in Chrome extensions uses the **same storage pool as the browser profile**. The limit is typically:
- **Chrome:** ~60% of available disk space (shared with all other origins)
- **Extension context:** IndexedDB created from a service worker or popup has its own origin quota

### The Real Problem: QuotaExceededError

When you hit the limit, writes fail with `QuotaExceededError`. This is silent and can corrupt your save flow if not handled.

### chrome.storage.local vs IndexedDB

| | chrome.storage.local | IndexedDB (via Dexie) |
|---|---|---|
| **Quota** | ~10MB (can request more via "unlimitedStorage" permission) | Browser-managed (60% of disk) |
| **Structured data** | Key-value only (JSON-serialized) | Full document store, indexes, queries |
| **Sync** | Built-in to extension lifecycle | Manual |
| **Service worker** | Always available | Available but has quirks (see section 11) |

### Recommendation for AI Content Curator

Use **Dexie/IndexedDB** for:
- Storing saved pages (with full content, title, URL, tags)
- AI-generated tags and metadata
- Search indexes for tags

Use **chrome.storage.local** for:
- User preferences (Gemini key, theme, settings)
- Cached tag lists
- Sync state

### The "unlimitedStorage" Permission

```json
"permissions": ["unlimitedStorage"]
```

This removes the ~10MB cap on `chrome.storage.local` and gives IndexedDB more generous limits. Request it if you plan to store many saved pages.

---

## 6. Service Worker Timeout Issues (Non-Persistent Background Scripts)

**This will be your biggest source of bugs.** MV3 replaced persistent background pages with ephemeral service workers.

### The Hard Truths

| Fact | Implication |
|------|------------|
| SW terminates after **30 seconds of inactivity** | Any in-memory state is lost |
| SW can terminate **mid-execution** | Long IndexedDB transactions can be interrupted |
| SW wakes up on events, not continuously | You cannot have "always-on" background logic |
| `setTimeout`/`setInterval` capped at ~5 minutes | Cannot rely on timers for scheduled work |

### Critical Patterns for AI Content Curator

#### State Persistence
```js
// BAD: In-memory state lost on SW restart
let pendingSaveQueue = [];

// GOOD: Persist to chrome.storage immediately
await chrome.storage.local.set({ pendingSaveQueue: queue });
```

#### Event Listeners Must Be Registered Synchronously
```js
// BAD: Listener registered inside async callback
chrome.runtime.onInstalled.addListener(async () => {
  await initDB();
  chrome.runtime.onMessage.addListener(handler); // May not fire!
});

// GOOD: Register at top level, synchronously
chrome.runtime.onMessage.addListener(handler);
chrome.runtime.onInstalled.addListener(async () => {
  await initDB();
});
```

#### Use Alarms Instead of setTimeout
```js
// Schedule a recurring task
chrome.alarms.create("processQueue", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "processQueue") processPendingSaves();
});
```

#### Port Connections
If using `chrome.runtime.connect()` (long-lived ports), be aware the service worker may terminate, killing the port. Use `runtime.onConnect` and handle reconnection.

---

## 7. Handling Large Pages — Memory Issues with DOM Parsing

Content scripts run in the page's process. Large pages (100K+ DOM nodes, infinite scroll, SPAs) can cause:

### The Problems

1. **Memory bloat:** Your content script reads the entire DOM. On a heavy page like a 5000-line documentation article or a social media feed, this can consume 50-200MB.
2. **Service worker memory pressure:** If you pass the full page content via `chrome.runtime.sendMessage`, the structured clone serialization can crash for very large payloads.
3. **Gemini token limits:** Gemini 2.5 Flash has a 1M token context window, but sending the entire page content is wasteful and slow.

### Mitigations

#### Strategy A: Extract Selectively
Don't send `document.body.innerText`. Extract only:
- Page title (`document.title`)
- Meta description (`meta[name="description"]`)
- Main content (article tags, `main` selector)
- First N characters of body text (e.g., 50,000 chars max)

#### Strategy B: Chunk & Stream
Split the page into chunks and send them via message passing. Track progress so you can resume if the SW resets.

#### Strategy C: Content Script Side Processing
Do the heavy DOM extraction in the content script (which has access to the full DOM) and only send the structured result to the service worker.

```js
// content-script.js — lightweight extraction
const pageData = {
  url: location.href,
  title: document.title,
  metaDescription: document.querySelector('meta[name="description"]')?.content || '',
  text: extractMainContent(document.body).substring(0, 100000),
  tags: []
};
chrome.runtime.sendMessage({ type: 'SAVE_PAGE', data: pageData });
```

#### Avoid DOMParser Memory Leaks
If you're receiving HTML strings and parsing them with `DOMParser`, known memory leak exists where parsed documents are not GC'd. Reuse a single parser instance and avoid creating document fragments unnecessarily.

---

## 8. Privacy Policy Requirements for the Chrome Web Store

Since January 2025, Google enforces stricter data handling disclosures. **Your extension almost certainly needs a privacy policy.**

### When You Need One

You handle user data if your extension can:
- Read page content (yes — you read the page to save it)
- Make network requests (yes — Gemini API calls)
- Store data locally (yes — IndexedDB + chrome.storage)
- Collect browsing activity (yes — user saves pages they visit)

### Privacy Policy Must Include

- What data you collect (page URLs, page content, user-provided API keys)
- How you use it (AI auto-tagging, local storage, no sharing)
- Where data is processed (Gemini API — mention Google's data handling)
- Data retention (e.g., "stored locally until user deletes")
- Third-party sharing (Gemini API — you send page content to Google)
- **Limited Use statement** — must state compliance with Chrome Web Store's limited use requirements
- User rights (access, deletion, export)
- Contact info

### Where to Host

- Must be a **live, publicly accessible URL** (GitHub Pages, your own site, or a privacy policy generator)
- Link must be added in the Chrome Web Store Developer Dashboard
- Must match the data practices in your `manifest.json` (mismatches = rejection)

### Additional Requirements

- Fill out the "Privacy practices" tab in the dashboard accurately
- Select every data type your extension handles
- Your store description must explain why each permission is needed
- Honor deletion requests within 30 days (GDPR)

---

## 9. Cross-Browser Considerations (Firefox Later)

Firefox's MV3 implementation differs from Chrome's in important ways.

### Key Differences

| Feature | Chrome MV3 | Firefox MV3 |
|---------|-----------|-------------|
| **Background** | Service worker (30s timeout) | Event pages (persistent-like) |
| **webRequest blocking** | Removed (use DNR) | Still supported |
| **API namespace** | `chrome.*` | `browser.*` (also supports `chrome.*`) |
| **Promise style** | Callbacks + promises | Promises by default |
| **Host permissions** | Separate `host_permissions` key | Same, but more forgiving |
| **MV2 support** | Ended Jan 2025 | Still supported, no deprecation planned |

### Porting Strategy

1. **Use `webextension-polyfill`** — lets you write `browser.*` API calls that work in both Chrome and Firefox
2. **Avoid `chrome.declarativeNetRequest`** if you can — Firefox supports `webRequest` blocking
3. **Background scripts** — In Firefox, you can use `scripts` array (still supported in MV3) instead of `service_worker`. Firefox rejects `service_worker` key in some versions
4. **Test early** — Firefox's AMO (Add-ons for Mozilla) review is usually faster than Chrome's but they still check for the same issues

### If You Want Cross-Browser from Day 1

Consider using a framework like WXT or Extension.js that handles cross-browser manifest generation. This lets you maintain one codebase that outputs correct manifests for Chrome and Firefox.

---

## 10. Rate Limiting and Cost Concerns with Gemini API

### Free Tier Limits (as of June 2026)

| Model | RPM | TPM | RPD | Cost |
|-------|-----|-----|-----|------|
| Gemini 2.5 Flash | 10 | 250,000 | 250 | Free |
| Gemini 2.5 Flash-Lite | 30 | 1,000,000 | 1,000 | Free |
| Gemini 2.5 Pro | 5 | 250,000 | 25 | Free (limited), paid-only in some regions |

**Critical:** As of April 2026, Google introduced enforced spend caps. Free tier requests may be used for model training — warn your users who care about data privacy.

### Paid Tiers

| Tier | Threshold | Flash RPM | Pro RPM |
|------|-----------|-----------|---------|
| Free | No billing | 10 | 5 |
| Tier 1 | Billing enabled | 150-300 | 30-60 |
| Tier 2 | $250+ spend | 1,000 | 100+ |
| Tier 3 | $1,000+ spend | 4,000+ | Custom |

### How to Handle in Your Extension

1. **Show users their remaining quota** — track recent API call timestamps locally
2. **Implement retry with backoff** — 429 errors are expected; use exponential backoff
3. **Queue and batch** — aggregate save requests to stay under RPM
4. **Warn before sending large content** — tell users "This page is X chars, may count as Y tokens"
5. **Let users configure their own model** — power users may want to switch to Flash-Lite (cheaper) or Pro (more accurate)

### Cost Estimation

Gemini 2.5 Flash pricing (paid tier): $0.30/1M input tokens, $2.50/1M output tokens.

For a typical page save:
- Input (page text): ~5,000 tokens avg → $0.0015
- Output (tags + summary): ~200 tokens avg → $0.0005
- **Cost per save: ~$0.002**

At 100 saves/user/month: ~$0.20/user/month. This is inexpensive for a BYOK setup, but if you offer a "hosted API key" model (bad idea), these costs add up fast.

---

## 11. Known Dexie.js + Chrome Extension Edge Cases

Dexie.js is the go-to wrapper for IndexedDB, but it has specific gotchas in the extension context.

### Issue 1: Database Open in Service Worker

Dexie's `db.open()` is async. In a service worker that can terminate at any moment:

```js
// Problem: SW terminates before db.open() completes
const db = new Dexie('ContentCurator');
db.version(1).stores({ pages: '++id, url, title, savedAt' });
// SW might die here before open() finishes
```

**Fix:** Call `db.open()` eagerly at the top level and handle the promise:

```js
const db = new Dexie('ContentCurator');
db.version(1).stores({ pages: '++id, url, title, savedAt' });
const dbReady = db.open(); // Don't await — initialize and move on
dbReady.catch(err => console.error('DB init failed', err));
```

### Issue 2: Transaction Timeout in Service Workers

IndexedDB transactions in service workers have a shorter timeout (~30s). Long-running bulk operations may fail silently.

**Fix:** Use Dexie's `bulkAdd`/`bulkPut` instead of looping individual `add()` calls. Split very large operations into batches of ~500 items.

### Issue 3: Dexie Version Mismatch on Update

When you update your extension, `chrome.runtime.onInstalled` fires. If you change your Dexie schema at the same time, the version upgrade must happen synchronously with the database open:

```js
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    // Close Dexie, reopen with new version
    await db.close();
    // Dexie handles schema migration via version().stores()
    // Make sure version numbers are bumped
  }
});
```

### Issue 4: Memory Leaks with Dexie.Observable

If you use Dexie's Observable plugin for live queries, be aware that observers maintain references to database objects. In a service worker that restarts frequently, unclosed observers can cause memory leaks.

### Issue 5: Dexie 4.x Bug — Chrome/Edge Crashes

There's a reported issue (GitHub #2143, 2025) where Dexie 4.0.x caused Chrome/Edge to crash on certain systems. The root cause was unclear but appeared related to Vite bundling + Dexie. If you use Vite to bundle your extension, test Dexie 4.x thoroughly or pin to a stable version.

### Issue 6: Dexie + Service Worker Termination

If a service worker terminates mid-transaction, IndexedDB will roll back the transaction. This is IndexedDB's behavior, not Dexie's bug, but it means:

- Don't assume a `db.pages.add()` call completes before the SW dies
- Use `chrome.storage.session` to flag pending operations
- Implement a recovery mechanism on SW wake-up

### Recommended Dexie Schema for AI Content Curator

```js
const db = new Dexie('AIContentCurator');
db.version(1).stores({
  pages: '++id, url, title, *tags, savedAt, updatedAt',
  tags: '++id, name, count',
  settings: 'key'
});
```

- `*tags` = multi-entry index for filtering by tag
- `savedAt` = sort by date
- `pages.url` = unique URL index to prevent duplicates
- Keep `settings` table minimal (mostly use `chrome.storage.sync` for settings)

---

## Summary: Top 5 Actions Before Publishing

1. **Strip all unnecessary permissions** — use `activeTab` + specific Gemini API host permissions only
2. **Never ship an API key** — implement BYOK with `chrome.storage.sync`
3. **Write a privacy policy** — host at a public URL, cover all data practices
4. **Handle SW termination** — persist state, register listeners synchronously, use alarms
5. **Chunk large pages** — extract only the main content, avoid sending full DOM
