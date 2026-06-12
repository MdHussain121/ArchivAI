# ArchivAI

Save web pages and auto-organize them with Nvidia NIM AI. Smart tagging, categorization, and summarization.

## Features

- **One-click save** — Save any page with a single click or right-click context menu
- **AI auto-tagging** — Tags, categories, and summarizes every saved page via Nvidia NIM API
- **Full-text search** — Search across titles, tags, and summaries
- **Reader mode** — Distraction-free reading with adjustable font size and dark mode
- **Offline support** — View saved content without internet
- **Export** — Download your library as JSON, CSV, or TXT
- **Neo-brutalism UI** — Thick borders, high contrast, brutalist design

## Installation

1. Download the latest release or clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `src/` folder
5. Click the extension icon and go to **Settings** to add your Nvidia NIM API key

## Usage

1. Navigate to any web page
2. Click the ArchivAI icon or right-click → **Save to AI Curator**
3. The page is saved locally and AI analysis runs automatically
4. View your library by clicking the **≡** button in the popup
5. Click any saved page to open it in reader mode

## API Key

Get a free API key from [build.nvidia.com](https://build.nvidia.com/settings/api-keys). The extension uses `nvidia/nemotron-3-super-120b-a12b` for analysis.

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (ES Modules)
- Dexie.js (IndexedDB wrapper)
- Nvidia NIM API (OpenAI-compatible)
- No build tools required

## Privacy

All data is stored locally in your browser. Page content is only sent to Nvidia NIM API when you explicitly save a page. No analytics or tracking. See [PRIVACY.md](PRIVACY.md).

## License

MIT
