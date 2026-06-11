# Phase 1: Foundation & Scaffolding — Plan

## Goal
Extension skeleton that loads in Chrome with all wiring in place.

## Tasks (Wave 1 — Parallel)

### 1.1 Create manifest.json
**File:** `src/manifest.json`
- MV3, permissions: storage, activeTab, scripting, alarms
- host_permissions: https://generativelanguage.googleapis.com/*
- service_worker: background/service-worker.js (type: module)
- default_popup: popup/popup.html
- Content script on `<all_urls>` at document_idle
- CSP for extension pages
- 128x128 default icon

### 1.2 Create folder structure
```
src/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   ├── service-worker.js
│   ├── message-router.js
│   ├── gemini-client.js
│   ├── sync-engine.js
│   └── alarm-manager.js
├── content/
│   ├── content.js
│   └── readability.js
├── core/
│   ├── db/
│   │   ├── schema.js
│   │   ├── bookmark-repo.js
│   │   ├── tag-repo.js
│   │   └── sync-queue-repo.js
│   ├── messaging/
│   │   ├── protocol.js
│   │   └── sender.js
│   └── utils/
│       ├── retry.js
│       ├── url-utils.js
│       └── network.js
├── lib/
│   └── (dexie.js will be added later)
└── assets/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 1.3 Dexie.js schema + DB setup
**Files:** `core/db/schema.js`
- Dexie database with 5 tables: bookmarks, tags, categories, syncQueue, sessions
- Proper compound indexes
- `navigator.storage.persist()` call

### 1.4 Neo-brutalism CSS design system
**Files:** `popup/popup.css`
- CSS custom properties (colors, spacing, borders, shadows, typography)
- Component classes: .btn, .card, .tag, .input, .strip, .badge
- Responsive popup layout (400x600px)
- System font stack (Space Grotesk, Inter, system-ui)

### 1.5 Service worker entry point
**Files:** `background/service-worker.js`
- Top-level listener registration (onMessage, onConnect, onAlarm, onInstalled)
- Lazy initialization pattern
- chrome.alarms for periodic tasks
- Handle SW wake/termination

### 1.6 Message passing protocol
**Files:** `core/messaging/protocol.js`, `core/messaging/sender.js`
- Action constants for all messages
- Response envelope (success/error)
- sendMessage helpers with timeout
- Port-based connection for popup

### 1.7 Icon assets
**Files:** `assets/icon16.png`, `assets/icon48.png`, `assets/icon128.png`
- Simple SVG-based icons rendered to PNG
- Use HTML canvas to generate if no SVG tool available

## Success Criteria
- [ ] Extension loads in Chrome (chrome://extensions)
- [ ] Service worker registered and alive
- [ ] Dexie database created in IndexedDB
- [ ] Neo-brutalism CSS renders properly in popup
- [ ] Message passing skeleton works (popup ↔ SW ↔ content)
- [ ] All 41 files created
