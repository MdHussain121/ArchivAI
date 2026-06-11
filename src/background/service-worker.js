import { MessageRouter } from './message-router.js';
import { AlarmManager } from './alarm-manager.js';
import { db, initializeDatabase } from '../lib/dexie-bundle.js';

let router = null;
let alarmManager = null;

const DEFAULT_CATEGORIES = [
  { name: 'Technology', icon: '💻', color: '#0047ab', sortOrder: 0, createdAt: Date.now() },
  { name: 'Design', icon: '🎨', color: '#ff6b35', sortOrder: 1, createdAt: Date.now() },
  { name: 'Science', icon: '🔬', color: '#00aa00', sortOrder: 2, createdAt: Date.now() },
  { name: 'Business', icon: '💼', color: '#8b4513', sortOrder: 3, createdAt: Date.now() },
  { name: 'Health', icon: '💪', color: '#cc0000', sortOrder: 4, createdAt: Date.now() },
  { name: 'Education', icon: '📚', color: '#9932cc', sortOrder: 5, createdAt: Date.now() },
  { name: 'Entertainment', icon: '🎬', color: '#ff1493', sortOrder: 6, createdAt: Date.now() },
  { name: 'News', icon: '📰', color: '#444444', sortOrder: 7, createdAt: Date.now() },
  { name: 'Other', icon: '📁', color: '#999999', sortOrder: 8, createdAt: Date.now() },
];

async function seedDefaultCategories() {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
  }
}

async function ensureInitialized() {
  if (!router) {
    await initializeDatabase();
    await seedDefaultCategories();
    router = new MessageRouter();
    alarmManager = new AlarmManager(db);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInitialized();

  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save to AI Curator',
    contexts: ['page', 'link'],
  });

  if (details.reason === 'install') {
    chrome.alarms.create('cleanup-old', { periodInMinutes: 60 });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'apiKeyUpdated') {
    ensureInitialized().then(() => router.handleApiKeyUpdated());
    sendResponse({ ok: true });
    return;
  }

  ensureInitialized().then(() => router.handle(msg, sender, sendResponse));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  ensureInitialized().then(() => router.handlePort(port));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  ensureInitialized().then(() => alarmManager.handle(alarm));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  ensureInitialized().then(() => router.handleContextMenu(info, tab));
});
