import { sendMessageToSW } from '../core/messaging/sender.js';
import { ACTIONS } from '../core/messaging/protocol.js';

let currentTab = null;
let currentPageData = null;
let port = null;

function connectToSW() {
  port = chrome.runtime.connect({ name: 'popup-session' });
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

  document.getElementById('nav-save').addEventListener('click', showSaveView);
  document.getElementById('nav-list').addEventListener('click', showListView);
  document.getElementById('nav-settings').addEventListener('click', openSettings);
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('search-input').addEventListener('input', handleSearch);

  showSaveView();
  loadPageData();
});

async function loadPageData() {
  const preview = document.getElementById('page-preview');
  const loading = document.getElementById('page-loading');
  const data = document.getElementById('page-data');

  loading.style.display = 'block';
  data.style.display = 'none';

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
    loading.textContent = 'Could not load page data. Try navigating to a page first.';
  }
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
      showStatus('Page saved! AI analysis in progress...', 'success');
    } else {
      showStatus('Save failed: ' + response.error, 'error');
    }
  } catch (err) {
    showStatus('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'SAVE PAGE';
  }
}

async function handleSearch(e) {
  const query = e.target.value.trim();
  if (!query) return;

  const response = await sendMessageToSW({
    action: ACTIONS.SEARCH_BOOKMARKS,
    query,
  });

  if (response.ok) {
    renderBookmarkList(response.data);
  }
}

function showStatus(message, type) {
  const status = document.getElementById('save-status');
  status.textContent = message;
  status.className = 'status-badge status-badge--' + type;
  status.style.display = 'block';
  setTimeout(() => { status.style.display = 'none'; }, 3000);
}

function showSaveView() {
  document.getElementById('save-view').style.display = 'flex';
  document.getElementById('list-view').style.display = 'none';
}

async function showListView() {
  document.getElementById('save-view').style.display = 'none';
  document.getElementById('list-view').style.display = 'flex';

  const response = await sendMessageToSW({ action: ACTIONS.GET_BOOKMARKS });
  if (response.ok) {
    renderBookmarkList(response.data);
  }
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
      <div class="bookmark-item__title">${b.title || 'Untitled'}</div>
      <div class="bookmark-item__url">${b.domain || ''}</div>
      <div class="bookmark-item__tags">
        ${(b.aiTags || []).slice(0, 3).map(t => `<span class="tag tag--ai">${t}</span>`).join('')}
      </div>
    `;
    container.appendChild(item);
  });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}
