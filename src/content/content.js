import { ACTIONS, success, error } from '../core/messaging/protocol.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === ACTIONS.EXTRACT_PAGE) {
    const pageData = extractPageData();
    sendResponse(success(pageData));
  }
});

function extractPageData() {
  const og = getOpenGraph();
  const textContent = extractMainText();
  const wordCount = textContent ? textContent.split(/\s+/).filter(Boolean).length : 0;

  return {
    url: document.URL,
    title: og.title || document.title || '',
    description: og.description || getMeta('description') || '',
    favicon: getFavicon(),
    ogImage: og.image || '',
    textContent: textContent || '',
    wordCount,
    domain: new URL(document.URL).hostname,
  };
}

function getOpenGraph() {
  const tags = document.querySelectorAll('meta[property^="og:"]');
  const result = {};
  tags.forEach(tag => {
    const prop = tag.getAttribute('property').replace('og:', '');
    result[prop] = tag.getAttribute('content');
  });
  return result;
}

function getMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute('content') || '';
}

function getFavicon() {
  const link = document.querySelector('link[rel="icon"]') ||
               document.querySelector('link[rel="shortcut icon"]');
  if (link) return link.href;
  return `${document.location.origin}/favicon.ico`;
}

function extractMainText() {
  const article = document.querySelector('article');
  if (article) return article.textContent;

  const main = document.querySelector('main');
  if (main) return main.textContent;

  const body = document.body;
  if (!body) return '';

  const cloned = body.cloneNode(true);
  removeElements(cloned, 'script, style, nav, footer, header, aside, iframe, .sidebar, .ad, .advertisement, [role="complementary"]');
  return cloned.textContent.replace(/\s+/g, ' ').trim().slice(0, 100000);
}

function removeElements(parent, selector) {
  const elements = parent.querySelectorAll(selector);
  elements.forEach(el => el.remove());
}
