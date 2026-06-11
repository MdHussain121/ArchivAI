export function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
