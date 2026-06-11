import { sendMessageToSW } from '../core/messaging/sender.js';
import { ACTIONS } from '../core/messaging/protocol.js';

let currentFontSize = 16;
let darkMode = false;
let showRaw = false;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const bookmarkId = params.get('id');

  darkMode = localStorage.getItem('readerDarkMode') === 'true';
  if (darkMode) {
    document.body.classList.add('dark');
    document.getElementById('dark-toggle').textContent = 'LIGHT';
  }

  document.getElementById('back-link').addEventListener('click', () => window.close());
  document.getElementById('font-up').addEventListener('click', () => changeFontSize(2));
  document.getElementById('font-down').addEventListener('click', () => changeFontSize(-2));
  document.getElementById('dark-toggle').addEventListener('click', toggleDark);
  document.getElementById('raw-toggle').addEventListener('click', toggleRaw);

  if (bookmarkId) {
    const response = await sendMessageToSW({
      action: ACTIONS.GET_BOOKMARK,
      id: parseInt(bookmarkId),
    });

    if (response.ok && response.data) {
      renderReader(response.data);
    }
  }
});

function changeFontSize(delta) {
  currentFontSize = Math.max(12, Math.min(28, currentFontSize + delta));
  document.getElementById('reader-content').style.setProperty('--reader-font-size', currentFontSize + 'px');
}

function toggleDark() {
  darkMode = !darkMode;
  document.body.classList.toggle('dark', darkMode);
  document.getElementById('dark-toggle').textContent = darkMode ? 'LIGHT' : 'DARK';
  localStorage.setItem('readerDarkMode', darkMode);
}

function toggleRaw() {
  showRaw = !showRaw;
  document.getElementById('raw-content').style.display = showRaw ? 'block' : 'none';
  document.getElementById('raw-toggle').textContent = showRaw ? 'HIDE RAW' : 'SHOW RAW';
}

function renderReader(bookmark) {
  document.title = bookmark.title || 'Reader';
  document.getElementById('reader-title').textContent = bookmark.title || 'Untitled';

  const meta = document.getElementById('reader-meta');
  meta.innerHTML = `
    <span class="tag">${bookmark.domain || ''}</span>
    ${bookmark.suggestedCategory ? `<span class="tag tag--cat">${bookmark.suggestedCategory}</span>` : ''}
    <span class="tag tag--ai">${new Date(bookmark.savedAt).toLocaleDateString()}</span>
  `;

  const readingTime = bookmark.wordCount ? Math.ceil(bookmark.wordCount / 200) + ' min read' : '';
  document.getElementById('reading-time').textContent = readingTime;

  const body = document.getElementById('reader-body');
  if (bookmark.aiSummary) {
    body.innerHTML = `
      <blockquote style="border-left: 4px solid #ff6b35; padding-left: var(--space-md); margin-bottom: var(--space-lg); font-style: italic;">
        ${escapeHtml(bookmark.aiSummary)}
      </blockquote>
    `;
  } else {
    body.innerHTML = '<p style="color:#999">No AI summary available.</p>';
  }

  document.getElementById('raw-text').textContent = bookmark.textContent || 'No raw content available.';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
