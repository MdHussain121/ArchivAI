# AI Content Curator — Roadmap

## Phase 1: Foundation & Scaffolding
**Goal:** Extension skeleton that loads in Chrome with all wiring in place

| Task | Description |
|------|-------------|
| 1.1 | Create manifest.json with MV3, permissions, service worker, popup config |
| 1.2 | Create folder structure (popup/, background/, content/, core/, lib/, assets/) |
| 1.3 | Set up Dexie.js with IndexedDB schema (bookmarks, tags, categories, syncQueue) |
| 1.4 | Create neo-brutalism CSS design system (variables, components, layout) |
| 1.5 | Create service worker entry point (background.js with event listeners) |
| 1.6 | Create port-based message passing protocol (core/messaging/) |
| 1.7 | Generate icon assets (16, 48, 128 PNG/SVG) |

## Phase 2: Content Extraction & Save Flow
**Goal:** One-click save that extracts page content and stores it locally

| Task | Description |
|------|-------------|
| 2.1 | Implement content script (content.js) — extract title, URL, OG meta, full text |
| 2.2 | Implement readability-light text extraction (strip ads, nav, get main content) |
| 2.3 | Build popup save UI with neo-brutalism — preview card, save button |
| 2.4 | Wire popup → content script → background → IndexedDB save flow |
| 2.5 | Implement context menu save (right-click page/link → save) |
| 2.6 | Implement auto-dedup (update existing bookmark if same URL) |
| 2.7 | Show confirmation toast/animation on successful save |

## Phase 3: Gemini AI Integration
**Goal:** Auto-tagging, summarization, and categorization powered by Gemini

| Task | Description |
|------|-------------|
| 3.1 | Build Gemini API client with retry + exponential backoff |
| 3.2 | Build AI tagging prompt — returns JSON with tags, category, summary |
| 3.3 | Implement async AI processing queue (save first, AI enriches in background) |
| 3.4 | Build options page with API key input, test button, neo-brutalism styling |
| 3.5 | Store API key securely in chrome.storage.local |
| 3.6 | Add usage quota tracking (requests made, rate limit awareness) |
| 3.7 | Update popup to show AI tags/summary when ready |

## Phase 4: Browse, Search & Organization
**Goal:** Full library view with search, filters, and collection management

| Task | Description |
|------|-------------|
| 4.1 | Build bookmark list view in popup (card grid, neo-brutalism) |
| 4.2 | Implement full-text search across titles, URLs, tags, summaries |
| 4.3 | Add filter bar — by category, tags, read status, date |
| 4.4 | Implement collections CRUD (create, rename, delete, move items) |
| 4.5 | Add read/unread/archive toggle per item |
| 4.6 | Add sort options (newest, oldest, title, reading time) |
| 4.7 | Build category browser with item counts |

## Phase 5: Reader Mode, Export & Offline
**Goal:** Read saved articles beautifully and get data out

| Task | Description |
|------|-------------|
| 5.1 | Build distraction-free reader view (full page, clean typography) |
| 5.2 | Add font size controls in reader mode |
| 5.3 | Show estimated reading time on article cards |
| 5.4 | Implement export — JSON format |
| 5.5 | Implement export — CSV format |
| 5.6 | Implement export — standard bookmarks HTML |
| 5.7 | Ensure offline viewing works (IndexedDB as source of truth) |
| 5.8 | Add offline/online detection and UI indicator |

## Phase 6: Polish, Testing & Store Prep
**Goal:** Production-ready extension ready for Chrome Web Store

| Task | Description |
|------|-------------|
| 6.1 | Comprehensive error handling (API errors, DB errors, network errors) |
| 6.2 | Performance optimization (message size limits, batch operations) |
| 6.3 | Write privacy policy (hosted publicly) |
| 6.4 | Create Chrome Web Store listing assets (screenshots, description, icons) |
| 6.5 | End-to-end testing of all flows |
| 6.6 | Edge case testing (empty states, long pages, offline, rapid saves) |
| 6.7 | Final manifest audit (permissions, CSP, store compliance) |
