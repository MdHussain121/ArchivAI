import { MessageRouter } from './message-router.js';
import { AlarmManager } from './alarm-manager.js';
import { db, initializeDatabase } from '../lib/dexie-bundle.js';

let router = null;
let alarmManager = null;

async function ensureInitialized() {
  if (!router) {
    await initializeDatabase();
    router = new MessageRouter();
    alarmManager = new AlarmManager();
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureInitialized();

  if (details.reason === 'install') {
    chrome.alarms.create('cleanup-old', { periodInMinutes: 60 });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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

chrome.contextMenus.create({
  id: 'save-page',
  title: 'Save to AI Curator',
  contexts: ['page', 'link'],
});
