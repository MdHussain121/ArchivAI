# Privacy Policy for AI Content Curator

Last updated: June 11, 2026

## Data Collection
AI Content Curator collects and stores the following data locally in your browser:
- URLs and titles of web pages you choose to save
- Full text content of saved pages (for offline reading and AI analysis)
- Your Gemini API key (stored securely in Chrome's local storage)

## How Data Is Used
- Page content is sent to Google's Gemini API for AI-powered tagging, categorization, and summarization ONLY when you save a page
- All data is stored locally in your browser's IndexedDB and Chrome storage
- No data is sent to any server other than Google's Gemini API (for AI processing)
- No data is shared with third parties
- No analytics or tracking is implemented

## Data Storage
- Bookmarks and page content: IndexedDB (local browser storage)
- API key and preferences: chrome.storage.local
- All data remains on your device
- Data persists until you delete it or uninstall the extension

## User Control
- You can delete individual bookmarks at any time
- You can export all your data as JSON, CSV, or HTML bookmarks
- Uninstalling the extension removes all stored data
- Your Gemini API key is never shared or transmitted except to Google's API

## Third-Party Services
This extension uses Google Gemini API (generativelanguage.googleapis.com) for AI analysis. When you save a page, its content is sent to Google for processing. Google's data handling policies apply to this data. See: https://ai.google.dev/gemini-api/docs/data-processing

## Contact
For privacy questions, please open an issue on the extension's GitHub repository.

## Limited Use Disclosure
This extension's use of the Google Gemini API complies with Google's Limited Use requirements. User data is only sent to Gemini API when the user explicitly saves a page, and is not used for model training or improvement.
