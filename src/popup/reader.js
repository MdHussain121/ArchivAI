import { sendMessageToSW } from '../core/messaging/sender.js';
import { ACTIONS } from '../core/messaging/protocol.js';

let currentFontSize = 16;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const bookmarkId = params.get('id');

  document.getElementById('back-link').addEventListener('click', () => window.close());
  document.getElementById('font-up').addEventListener('click', () => changeFontSize(2));
  document.getElementById('font-down').addEventListener('click', () => changeFontSize(-2));

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
      <p>${escapeHtml(bookmark.textContent || 'No content available for offline reading.')}</p>
    `;
  } else {
    body.innerHTML = `<p>${escapeHtml(bookmark.textContent || 'No content available.')}</p>`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
