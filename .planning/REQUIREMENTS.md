# AI Content Curator — Requirements

## v1 Requirements

### REQ-CORE: Core Save & AI Flow
- REQ-01: One-click save current page from toolbar icon
- REQ-02: Content script extracts page title, URL, OG image, description, full text
- REQ-03: Gemini auto-generates 5-10 tags per saved page
- REQ-04: Gemini auto-categorizes page into top-level category
- REQ-05: Gemini generates 2-4 sentence summary
- REQ-06: AI processing is async — item saves immediately, AI enriches in background
- REQ-07: Auto-dedup — re-saving same URL updates existing bookmark

### REQ-UI: Neo-Brutalism UI
- REQ-08: Popup uses bold borders (3-4px), drop shadows, high contrast black/white
- REQ-09: Accent colors for category tags, buttons
- REQ-10: Responsive popup layout (400x600px default)
- REQ-11: Options page for API key and preferences with matching design

### REQ-SEARCH: Search & Filter
- REQ-12: Full-text search across titles, URLs, tags, summaries
- REQ-13: Filter by category, tags, read status, date range
- REQ-14: Sort by date saved, title, reading time

### REQ-ORG: Collections & Organization
- REQ-15: Create, rename, delete collections (folders)
- REQ-16: Assign collection on save
- REQ-17: Move items between collections
- REQ-18: View items filtered by collection

### REQ-READ: Read/Unread Tracking
- REQ-19: Items default to "unread" on save
- REQ-20: Mark as read, unread, archive from popup
- REQ-21: Filter by read status

### REQ-OFFLINE: Offline Viewing
- REQ-22: Page content stored locally in IndexedDB
- REQ-23: View saved content without internet connection
- REQ-24: Offline indicator when network unavailable

### REQ-CTX: Context Menu
- REQ-25: Right-click page → "Save to AI Content Curator"
- REQ-26: Right-click link → "Save link to AI Content Curator"

### REQ-EXPORT: Export
- REQ-27: Export all data as JSON
- REQ-28: Export as CSV
- REQ-29: Export as standard bookmarks HTML

### REQ-READER: Reader Mode
- REQ-30: Distraction-free reading view for saved articles
- REQ-31: Adjustable font size
- REQ-32: Estimated reading time display

### REQ-SETTINGS: Settings & API Key
- REQ-33: Options page with Gemini API key input (password field)
- REQ-34: "Test API Key" button to validate key
- REQ-35: API key stored securely in chrome.storage.local
- REQ-36: Usage quota display (requests made today)

## v2 (Future)
- Semantic / AI-powered search
- Tag management (merge, rename, delete)
- Batch operations (select multiple, move/tag/delete)
- Smart collections (auto-rules)
- Text-to-speech
- Import from Pocket, Raindrop
- Cloud sync across devices
- Mobile companion

## Out of Scope
- Server-side backend or accounts (local-first only)
- Collaboration / sharing features
- Monetization or premium tiers
- Firefox support (future consideration)
