let DICT = {};
export async function loadDict(locale) {
  try {
    const base = (chrome?.runtime?.getURL ? chrome.runtime.getURL('') : '').replace(/\/?$/, '/');
    const url = base ? `${base}_locales/${locale}/messages.json` : `./_locales/${locale}/messages.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    DICT = await res.json();
  } catch (_) {
    DICT = {};
  }
}
export function t(key, fallback = '') {
  try {
    const m = DICT?.[key]?.message || chrome.i18n.getMessage(key);
    return m || fallback;
  } catch {
    return DICT?.[key]?.message || fallback;
  }
}
