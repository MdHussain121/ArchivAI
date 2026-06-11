import { sendMessageToSW } from '../core/messaging/sender.js';
import { ACTIONS } from '../core/messaging/protocol.js';

let currentTab = null;
let currentPageData = null;
let port = null;
let currentView = 'save';
let bookmarksCache = [];

function connectToSW() {
  port = chrome.runtime.connect({ name: 'popup-session' });
  port.onMessage.addListener((msg) => {
    if (msg.action === ACTIONS.AI_TAGS_READY) {
      showSaveTags(msg.tags, msg.summary);
    }
  });
  port.onDisconnect.addListener(() => {
    if (!chrome.runtime.lastError) {
      setTimeout(connectToSW, 100);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  connectToSW();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  document.getElementById('nav-save').addEventListener('click', () => switchView('save'));
  document.getElementById('nav-list').addEventListener('click', () => switchView('list'));
  document.getElementById('nav-settings').addEventListener('click', openSettings);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('filter-category').addEventListener('change', applyFilters);
  document.getElementById('filter-status').addEventListener('change', applyFilters);
  document.getElementById('sort-by').addEventListener('change', applyFilters);

  switchView('save');
  loadPageData();
  loadBookmarks();
  loadCategories();
});

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
  if (view === 'list') loadBookmarks();
}

async function loadPageData() {
  const loading = document.getElementById('page-loading');
  const data = document.getElementById('page-data');

  loading.style.display = 'block';
  data.style.display = 'none';
  document.getElementById('ai-card').style.display = 'none';

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
      document.getElementById('page-domain').className = 'tag tag--cat';

      loading.style.display = 'none';
      data.style.display = 'block';
    }
  } catch (err) {
    loading.textContent = 'Navigate to a page first';
  }
}

function showSaveTags(tags, summary) {
  const card = document.getElementById('ai-card');
  const tagsContainer = document.getElementById('ai-tags');
  const summaryEl = document.getElementById('ai-summary');

  if (tags?.length) {
    tagsContainer.innerHTML = tags.map(t => `<span class="tag tag--ai">${t}</span>`).join('');
  }
  if (summary) {
    summaryEl.textContent = summary;
  }
  card.style.display = 'block';
}

async function handleSave() {
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
      showStatus('SAVED!', 'success');
      setTimeout(() => switchView('list'), 1000);
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
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div class="bookmark-item__title">${escapeHtml(b.title || 'Untitled')}</div>
          <div class="bookmark-item__url">${escapeHtml(b.domain || '')}</div>
        </div>
        <span class="tag ${b.readStatus === 'unread' ? 'tag--cat' : 'tag--ai'}" style="font-size:10px">
          ${b.readStatus || 'unread'}
        </span>
      </div>
      <div class="bookmark-item__tags" style="margin-top:6px">
        ${b.suggestedCategory ? `<span class="tag tag--cat">${escapeHtml(b.suggestedCategory)}</span>` : ''}
        ${(b.aiTags || []).slice(0, 3).map(t => `<span class="tag tag--ai">${escapeHtml(t)}</span>`).join('')}
      </div>
    `;
    item.addEventListener('click', () => openReader(b));
    container.appendChild(item);
  });
}

function openReader(bookmark) {
  chrome.tabs.create({
    url: bookmark.url,
  });
}

function showStatus(message, type) {
  const status = document.getElementById('save-status');
  status.textContent = message;
  status.className = 'status-badge status-badge--' + type;
  status.style.display = 'block';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
