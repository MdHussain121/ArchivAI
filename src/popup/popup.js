import { sendMessageToSW } from '../core/messaging/sender.js';
import { ACTIONS } from '../core/messaging/protocol.js';

let currentTab = null;
let currentPageData = null;
let port = null;
let currentView = 'save';
let bookmarksCache = [];
let hasPageData = false;
let aiPendingTimer = null;
let listRefreshTimer = null;

function connectToSW() {
  port = chrome.runtime.connect({ name: 'popup-session' });
  port.onMessage.addListener((msg) => {
    if (msg.action === ACTIONS.AI_TAGS_READY) {
      clearTimeout(aiPendingTimer);
      showSaveTags(msg.tags, msg.summary, msg.skipped, msg.error);
      loadBookmarks();
    }
    if (msg.action === ACTIONS.API_KEY_STATUS && msg.hasKey) {
      document.getElementById('no-key-banner').style.display = 'none';
      checkApiKey();
    }
    if (msg.action === ACTIONS.BOOKMARK_UPDATED) {
      loadBookmarks();
    }
  });

  aiPendingTimer = setTimeout(() => {
    const pending = document.getElementById('ai-pending');
    if (pending && pending.style.display !== 'none') {
      pending.innerHTML = '<div class="loading-spinner"></div><span>Still analyzing...</span>';
    }
  }, 30000);

  port.onDisconnect.addListener(() => {
    if (!chrome.runtime.lastError) {
      setTimeout(connectToSW, 100);
    }
  });
}

function startListRefresh() {
  stopListRefresh();
  listRefreshTimer = setInterval(loadBookmarks, 5000);
}

function stopListRefresh() {
  if (listRefreshTimer) {
    clearInterval(listRefreshTimer);
    listRefreshTimer = null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  connectToSW();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  await checkApiKey();

  document.getElementById('nav-save').addEventListener('click', () => switchView('save'));
  document.getElementById('nav-list').addEventListener('click', () => switchView('list'));
  document.getElementById('nav-settings').addEventListener('click', openSettings);
  document.getElementById('settings-link').addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
  document.getElementById('nav-export').addEventListener('click', showExportDialog);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('filter-category').addEventListener('change', applyFilters);
  document.getElementById('filter-status').addEventListener('change', applyFilters);
  document.getElementById('sort-by').addEventListener('change', applyFilters);

  document.getElementById('export-json').addEventListener('click', () => handleExport('json'));
  document.getElementById('export-csv').addEventListener('click', () => handleExport('csv'));
  document.getElementById('export-txt').addEventListener('click', () => handleExport('txt'));
  document.getElementById('export-cancel').addEventListener('click', () => {
    document.getElementById('export-confirm').style.display = 'none';
  });

  window.addEventListener('online', () => { document.getElementById('offline-banner').style.display = 'none'; });
  window.addEventListener('offline', () => { document.getElementById('offline-banner').style.display = 'block'; });
  if (!navigator.onLine) { document.getElementById('offline-banner').style.display = 'block'; }

  switchView('save');
  loadPageData();
  loadBookmarks();
  loadCategories();
});

async function checkApiKey() {
  const result = await chrome.storage.local.get('nimApiKey');
  const banner = document.getElementById('no-key-banner');
  banner.style.display = result.nimApiKey ? 'none' : 'block';
}

async function loadCategories() {
  const response = await sendMessageToSW({ action: ACTIONS.GET_CATEGORIES });
  if (response.ok && response.data) {
    const cats = new Set(response.data.map(c => c.name));
    const select = document.getElementById('filter-category');
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });
  }
}

function switchView(view) {
  currentView = view;
  document.getElementById('save-view').style.display = view === 'save' ? 'flex' : 'none';
  document.getElementById('list-view').style.display = view === 'list' ? 'flex' : 'none';
  if (view === 'list') {
    loadBookmarks();
    startListRefresh();
  } else {
    stopListRefresh();
  }
}

async function loadPageData() {
  const loading = document.getElementById('page-loading');
  const data = document.getElementById('page-data');
  const saveBtn = document.getElementById('save-btn');

  loading.style.display = 'block';
  data.style.display = 'none';
  document.getElementById('ai-card').style.display = 'none';
  document.getElementById('ai-pending').style.display = 'none';
  hasPageData = false;
  saveBtn.disabled = true;

  try {
    const response = await sendMessageToSW({
      action: ACTIONS.GET_PAGE_META,
      tabId: currentTab?.id,
    });

    if (response.ok) {
      currentPageData = response.data;
      document.getElementById('page-title').textContent = response.data.title || 'Untitled';
      document.getElementById('page-description').textContent = response.data.description || '';
      document.getElementById('page-domain').textContent = response.data.domain || '';
      document.getElementById('page-domain').className = 'tag';

      loading.style.display = 'none';
      data.style.display = 'block';
      hasPageData = true;
      saveBtn.disabled = false;
    } else {
      loading.textContent = 'Could not extract page data';
    }
  } catch (err) {
    loading.textContent = 'Navigate to a page first';
  }
}

function showSaveTags(tags, summary, skipped, error) {
  document.getElementById('ai-pending').style.display = 'none';
  const card = document.getElementById('ai-card');
  const tagsContainer = document.getElementById('ai-tags');
  const summaryEl = document.getElementById('ai-summary');

  if (skipped) {
    card.innerHTML = `
      <h2 class="card__title">AI UNAVAILABLE</h2>
      <p class="card__body">Add a Nvidia NIM API key in Settings to enable auto-tagging.</p>
    `;
    card.style.display = 'block';
    return;
  }

  if (error) {
    card.innerHTML = `
      <h2 class="card__title">AI FAILED</h2>
      <p class="card__body">${escapeHtml(error)}. It will retry automatically.</p>
    `;
    card.style.display = 'block';
    return;
  }

  if (tags?.length) {
    tagsContainer.innerHTML = tags.map(t => `<span class="tag tag--ai">${escapeHtml(t)}</span>`).join('');
  }
  if (summary) {
    summaryEl.textContent = summary;
  }
  card.style.display = 'block';
}

async function handleSave() {
  if (!hasPageData || !currentPageData) return;

  const btn = document.getElementById('save-btn');
  const status = document.getElementById('save-status');

  btn.disabled = true;
  btn.textContent = 'SAVING...';

  try {
    const response = await sendMessageToSW({
      action: ACTIONS.SAVE_BOOKMARK,
      pageData: currentPageData,
    });

    if (response.ok) {
      showStatus('SAVED! Analyzing with Nvidia NIM...', 'success');
      document.getElementById('ai-pending').style.display = 'flex';
    } else {
      showStatus('FAILED: ' + response.error, 'error');
    }
  } catch (err) {
    showStatus('ERROR: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'SAVE PAGE';
  }
}

async function loadBookmarks() {
  const response = await sendMessageToSW({ action: ACTIONS.GET_BOOKMARKS });
  if (response.ok) {
    bookmarksCache = response.data;
    applyFilters();
  }
}

function applyFilters() {
  const search = (document.getElementById('search-input').value || '').toLowerCase();
  const category = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;
  const sort = document.getElementById('sort-by').value;

  let filtered = [...bookmarksCache];

  if (search) {
    filtered = filtered.filter(b =>
      b.title?.toLowerCase().includes(search) ||
      (b.aiTags || []).some(t => t.toLowerCase().includes(search)) ||
      b.url?.toLowerCase().includes(search)
    );
  }

  if (category) {
    filtered = filtered.filter(b => b.suggestedCategory === category);
  }

  if (status) {
    filtered = filtered.filter(b => b.readStatus === status);
  }

  switch (sort) {
    case 'title': filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
    case 'oldest': filtered.sort((a, b) => a.savedAt - b.savedAt); break;
    default: filtered.sort((a, b) => b.savedAt - a.savedAt); break;
  }

  renderBookmarkList(filtered);
}

async function handleSearch(e) {
  applyFilters();
}

function renderBookmarkList(bookmarks) {
  const container = document.getElementById('bookmark-list');
  container.innerHTML = '';

  if (!bookmarks || bookmarks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__title">NO SAVED PAGES</div>
        <p>Save your first page using the + button</p>
      </div>
    `;
    return;
  }

  bookmarks.forEach(b => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';

    let statusBadge;
    if (!b.aiProcessed) {
      statusBadge = '<span class="tag" style="background:#ffaa00;color:#000;font-size:10px">AI PENDING</span>';
    } else if (b.syncStatus === 'no_key') {
      statusBadge = '<span class="tag" style="background:#999;color:#fff;font-size:10px">NO AI KEY</span>';
    } else if (b.syncStatus === 'failed') {
      statusBadge = '<span class="tag" style="background:#ff0000;color:#fff;font-size:10px">AI FAILED</span>';
    } else {
      statusBadge = `<span class="tag tag--cat" style="font-size:10px">${escapeHtml(b.suggestedCategory || 'uncategorized')}</span>`;
    }

    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="bookmark-item__title">${escapeHtml(b.title || 'Untitled')}</div>
          <div class="bookmark-item__url">${escapeHtml(b.domain || '')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          ${statusBadge}
          <button class="delete-btn" data-id="${b.id}" title="Delete">✕</button>
        </div>
      </div>
      <div class="bookmark-item__tags" style="margin-top:6px">
        ${(b.aiTags || []).slice(0, 3).map(t => `<span class="tag tag--ai">${escapeHtml(t)}</span>`).join('')}
        ${!b.aiProcessed && b.aiTags?.length === 0 ? '<span style="font-size:11px;color:#999">Waiting for AI analysis...</span>' : ''}
      </div>
      ${b.aiSummary ? `<div class="bookmark-item__summary">${escapeHtml(b.aiSummary).slice(0, 120)}${b.aiSummary.length > 120 ? '...' : ''}</div>` : ''}
    `;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      openReader(b);
    });
    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      handleDelete(b);
    });
    container.appendChild(item);
  });
}

async function handleDelete(bookmark) {
  const confirmEl = document.getElementById('delete-confirm');
  const msg = document.getElementById('delete-msg');
  msg.textContent = `"${bookmark.title || 'Untitled'}"`;
  confirmEl.style.display = 'flex';

  document.getElementById('delete-yes').onclick = async () => {
    confirmEl.style.display = 'none';
    const response = await sendMessageToSW({ action: ACTIONS.DELETE_BOOKMARK, id: bookmark.id });
    if (response.ok) {
      bookmarksCache = bookmarksCache.filter(b => b.id !== bookmark.id);
      applyFilters();
    }
  };
  document.getElementById('delete-no').onclick = () => {
    confirmEl.style.display = 'none';
  };
}

function openReader(bookmark) {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`popup/reader.html?id=${bookmark.id}`),
  });
}

function showStatus(message, type) {
  const status = document.getElementById('save-status');
  status.textContent = message;
  status.className = 'status-badge status-badge--' + type;
  status.style.display = 'block';
}

function showExportDialog() {
  document.getElementById('export-confirm').style.display = 'flex';
}

async function handleExport(format) {
  document.getElementById('export-confirm').style.display = 'none';

  const response = await sendMessageToSW({ action: ACTIONS.EXPORT_DATA, format });
  if (response.ok) {
    const blob = new Blob([response.data.data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archivai-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Exported!', 'success');
  }
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
