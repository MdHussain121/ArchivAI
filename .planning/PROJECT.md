# AI Content Curator

A Chrome extension that intelligently saves, organizes, and rediscover web content using Google Gemini AI.

## Core Value Proposition

One-click save any webpage → Gemini automatically categorizes, tags, and summarizes it → Instantly find anything later through smart search and discovery.

## Target Users

- Knowledge workers who save lots of browser tabs/bookmarks
- Researchers collecting sources
- Developers saving technical articles and docs
- Anyone who wants to "read later" with context

## Key Differentiators

1. **True auto-organization** - No manual tagging. Gemini understands content and organizes it intelligently
2. **Neo-brutalism UI** - Bold, raw, high-contrast design that stands out from typical extensions
3. **Local-first** - All data stays in your browser. Private, fast, no account needed
4. **Universal** - Works on any webpage, not just specific platforms

## Tech Stack

- Chrome Extension Manifest V3
- Google Gemini API (gemini-2.0-flash for speed/cost balance)
- Vanilla JS/HTML/CSS (no framework overhead for an extension)
- IndexedDB (via Dexie.js wrapper) for local storage
- Neo-brutalism CSS design system

## Constraints

- Must work offline for viewing saved content
- Gemini API key required (user-provided)
- Chrome extension store compliant
- Lightweight - minimal impact on browser performance
