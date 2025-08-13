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
    if ((r.mode || 'redirect') === 'scheme') {
      // Scheme conversion is handled in webNavigation; skip DNR
      continue;
    }
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

    // Only add to DNR if substitution looks http(s) to avoid custom-scheme failures
    if (!/^https?:/i.test(regexSubstitution)) {
      continue;
    }

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
      } else if (msg?.type === 'test-rule') {
        const { url, mode = 'redirect', pattern, replacement, schemeTarget } = msg;
        const re = new RegExp(pattern);
        if (!re.test(url)) {
          sendResponse({ ok: true, result: url });
          return;
        }
        if (mode === 'scheme') {
          const out = transformScheme(url, schemeTarget || 'https');
          sendResponse({ ok: true, result: out });
        } else {
          const out = url.replace(re, replacement ?? '');
          sendResponse({ ok: true, result: out });
        }
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

// ------------------------------
// Non-HTTP scheme redirect fallback (e.g., obsidian://)
// We watch http/https navigations and if a regex rule redirects to a custom scheme,
// perform the redirect via tabs.update/create because DNR can't redirect to non-http.
let nonHttpRulesCache = [];
let schemeRulesCache = [];
const redirectingTabs = new Set();

async function refreshNonHttpRules() {
  const { [STORAGE_KEY]: rules = [] } = await chrome.storage.sync.get(STORAGE_KEY);
  const enabled = rules.filter(r => r?.enabled && r?.match);
  nonHttpRulesCache = enabled
    .filter(r => (r.mode || 'redirect') === 'redirect')
    .map(r => ({ match: r.match, target: r.target || r.rewrite || '' }))
    .filter(r => /^[a-z][a-z0-9+.-]*:/i.test(r.target) && !/^https?:/i.test(r.target));

  schemeRulesCache = enabled
    .filter(r => (r.mode || 'redirect') === 'scheme')
    .map(r => ({ match: r.match, schemeTarget: r.schemeTarget || 'https' }));
}

chrome.runtime.onInstalled.addListener(refreshNonHttpRules);
chrome.runtime.onStartup?.addListener(refreshNonHttpRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[STORAGE_KEY]) refreshNonHttpRules();
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  try {
    if (details.frameId !== 0) return; // main frame only
    const url = details.url || '';
    if (!/^https?:/i.test(url)) return;
    if (redirectingTabs.has(details.tabId)) return;

    // 1) Non-http redirect rules (target is custom scheme)
    for (const r of nonHttpRulesCache) {
      let target = null;
      try {
        const re = new RegExp(r.match);
        if (re.test(url)) target = url.replace(re, r.target);
      } catch { /* ignore invalid regex */ }
      if (target && target !== url) {
        redirectingTabs.add(details.tabId);
        chrome.tabs.update(details.tabId, { url: target }, () => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: target, index: details.tabId + 1 });
          }
          setTimeout(() => redirectingTabs.delete(details.tabId), 1500);
        });
        return;
      }
    }

    // 2) Scheme-conversion rules
    for (const r of schemeRulesCache) {
      let match = false;
      try {
        const re = new RegExp(r.match);
        match = re.test(url);
      } catch { /* ignore invalid regex */ }
      if (match) {
        const target = transformScheme(url, r.schemeTarget || 'https');
        if (target && target !== url) {
          redirectingTabs.add(details.tabId);
          chrome.tabs.update(details.tabId, { url: target }, () => {
            if (chrome.runtime.lastError) {
              chrome.tabs.create({ url: target, index: details.tabId + 1 });
            }
            setTimeout(() => redirectingTabs.delete(details.tabId), 1500);
          });
          return;
        }
      }
    }
  } catch (e) {
    // swallow
  }
}, { url: [{ schemes: ['http', 'https'] }] });

function transformScheme(inputUrl, schemeTarget) {
  try {
    const u = new URL(inputUrl);
    const rest = `${u.host}${u.pathname}${u.search}${u.hash}`;
    if (!schemeTarget || schemeTarget === 'https' || schemeTarget === 'http' || schemeTarget === 'custom' || /^[a-z][a-z0-9+.-]*$/i.test(schemeTarget)) {
      if (schemeTarget === 'clear') {
        // Schemeless URL
        return `//${rest}`;
      }
      const scheme = schemeTarget === 'custom' ? '' : schemeTarget;
      if (!scheme) return `//${rest}`;
      return `${scheme}://${rest}`;
    }
  } catch {
    // Fallback regex if URL parsing fails
  }
  // Fallback: replace up to '://' at the start
  if (schemeTarget === 'clear') return inputUrl.replace(/^([a-z][a-z0-9+.-]*:)?\/\//i, '//');
  const scheme = schemeTarget === 'custom' ? '' : schemeTarget;
  if (!scheme) return inputUrl.replace(/^([a-z][a-z0-9+.-]*:)?\/\//i, '//');
  return inputUrl.replace(/^([a-z][a-z0-9+.-]*:)?/i, `${scheme}:`).replace(/^([a-z][a-z0-9+.-]*:)?(?=\/\/)/i, `${scheme}:`);
}
