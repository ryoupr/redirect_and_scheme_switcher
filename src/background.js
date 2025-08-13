// Background service worker (Manifest V3)
// Maintains dynamic redirect rules built from user regex rules saved in storage.

const STORAGE_KEY = 'redirectRulesV1';
const DNR_RULESET_ID = 'dynamicRegexRedirects';

/**
 * User rule shape (stored in chrome.storage.sync):
 * {
 *   id: string,                  // stable id
 *   enabled: boolean,
 *   description?: string,
 *   match: string,               // regex pattern string
 *   rewrite: string,             // replacement string for URL
 *   isRegex: true,               // reserved for future, always true for now
 *   target?: string,             // if provided, final target URL template (optional)
 *   methods?: string[]           // HTTP methods to match, default all
 * }
 */

chrome.runtime.onInstalled.addListener(async () => {
  await ensureInitialized();
});

chrome.runtime.onStartup?.addListener(async () => {
  await ensureInitialized();
});

// Open options page in a full tab when the action icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

async function ensureInitialized() {
  const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  await rebuildDynamicRules(rules);
}

// Listen to storage changes to rebuild rules in real time.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes[STORAGE_KEY]) return;
  const rules = changes[STORAGE_KEY].newValue || [];
  await rebuildDynamicRules(rules);
});

/**
 * Convert user regex rules into DNR regexRedirect rules.
 * Note: declarativeNetRequest supports regexFilter and regexSubstitution.
 */
async function rebuildDynamicRules(userRules) {
  // Remove all previous rules for our ruleset ID
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);
  if (removeRuleIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }

  // Build new rules
  let nextId = 1;
  const addRules = [];
  for (let i = 0; i < userRules.length; i++) {
    const r = userRules[i];
    if (!r?.enabled) continue;
    if (!r?.match) continue;
    // Validate regex to avoid runtime errors in DNR
    try {
      // This will throw if invalid
      // Note: DNR uses RE2, but basic validation via JS RegExp helps catch typos.
      new RegExp(r.match);
    } catch (_) {
      console.warn('Invalid regex ignored:', r.match);
      continue;
    }

    const id = nextId++;
    const regexFilter = r.match;
    // If target provided, use it directly; else use rewrite
    const regexSubstitution = (r.target && r.target.length > 0 ? r.target : r.rewrite || '').toString();

    // Build action as redirect using regexSubstitution
    addRules.push({
      id,
      // Higher priority for rules earlier in the list
      priority: Math.max(1, 1000000 - i),
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution,
        },
      },
      condition: {
        regexFilter,
        resourceTypes: ['main_frame', 'sub_frame'],
      },
      description: r.description || undefined,
    });
  }

  if (addRules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
  }
}

// Message API for options page to import/export or preview
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'export-rules') {
        const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
        sendResponse({ ok: true, rules });
      } else if (msg?.type === 'import-rules') {
        const rules = Array.isArray(msg.rules) ? msg.rules : [];
        await chrome.storage.sync.set({ [STORAGE_KEY]: rules });
        sendResponse({ ok: true });
      } else if (msg?.type === 'get-rules') {
        const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
        sendResponse({ ok: true, rules });
      } else if (msg?.type === 'set-rules') {
        const rules = Array.isArray(msg.rules) ? msg.rules : [];
        await chrome.storage.sync.set({ [STORAGE_KEY]: rules });
        sendResponse({ ok: true });
      } else if (msg?.type === 'test-regex') {
        const { url, pattern, replacement } = msg;
        const re = new RegExp(pattern);
        const result = url.replace(re, replacement ?? '');
        sendResponse({ ok: true, result });
      } else {
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  // return true to indicate async response
  return true;
});
