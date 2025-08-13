// Options page logic for managing regex redirect rules (module scope only).
import { createRuleCard } from './components/ruleCard.js';
import { initToolbar } from './components/toolbar.js';
import { initTester } from './components/tester.js';
import { applyI18nAttributes } from './utils/i18n.js';
const STORAGE_KEY = 'redirectRulesV1';
const THEME_KEY = 'uiThemeV1';
const LOCALE_KEY = 'uiLocaleV1';
const BACKUP_KEY = 'redirectRulesBackupV1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Runtime i18n dictionary (for instant EN/JA toggle in Options page)
let CURRENT_LOCALE = 'ja';
let I18N_DICT = {};

async function loadLocaleMessages(locale) {
  try {
    const base = (chrome?.runtime?.getURL ? chrome.runtime.getURL('') : '').replace(/\/?$/, '/');
    const url = base ? `${base}_locales/${locale}/messages.json` : `./_locales/${locale}/messages.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    I18N_DICT = json || {};
    CURRENT_LOCALE = locale;
  } catch (_) {
    // Fallback to empty dict
    I18N_DICT = {};
    CURRENT_LOCALE = locale;
  }
}

// Minimal stub for running options page outside extension (e.g., capture.html)
if (typeof window !== 'undefined' && typeof window.chrome === 'undefined') {
  window.__demoRules = window.__demoRules || [];
  window.chrome = {
    runtime: {
      id: undefined,
      async sendMessage(msg) {
        if (msg?.type === 'get-rules') return { ok: true, rules: window.__demoRules };
        if (msg?.type === 'set-rules') { window.__demoRules = Array.isArray(msg.rules) ? msg.rules : []; return { ok: true }; }
        if (msg?.type === 'export-rules') return { ok: true, rules: window.__demoRules };
        if (msg?.type === 'import-rules') { window.__demoRules = Array.isArray(msg.rules) ? msg.rules : []; return { ok: true }; }
        if (msg?.type === 'test-regex') {
          try { const re = new RegExp(msg.pattern || ''); return { ok: true, result: String(msg.url || '').replace(re, msg.replacement || '') }; }
          catch (e) { return { ok: false, error: String(e) }; }
        }
        if (msg?.type === 'test-rule') {
          try {
            const { url = '', mode = 'redirect', pattern = '', replacement = '', schemeTarget = 'https' } = msg;
            const re = new RegExp(pattern);
            const matched = re.test(url);
            let result = url;
            if (matched) {
              if (mode === 'scheme') {
                if (schemeTarget === 'clear') {
                  result = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
                } else {
                  const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
                  result = `${schemeTarget}://${rest}`;
                }
              } else {
                result = url.replace(re, replacement || '');
              }
            }
            return { ok: true, result, matched };
          } catch (e) { return { ok: false, error: String(e) }; }
        }
        return { ok: false, error: 'unsupported in demo' };
      }
    },
    storage: { local: { async get() { return {}; }, async set() { return {}; } } }
  };
}

// RFC4122 v4 UUID (prefer native, fallback to crypto-based polyfill)
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Per RFC4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }
  // Last resort (very unlikely path)
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

async function loadRules() {
  const res = await chrome.runtime.sendMessage({ type: 'get-rules' });
  if (!res?.ok) return [];
  return res.rules || [];
}

async function saveRules(rules) {
  await chrome.runtime.sendMessage({ type: 'set-rules', rules });
}

function renderRules(rules) {
  const list = $('#rulesList');
  list.innerHTML = '';
  const sendMessage = (payload) => chrome.runtime.sendMessage(payload);
  rules.forEach((r, index) => {
    const card = createRuleCard({
      rule: r,
      index,
      rules,
      saveRules,
      i18n,
      validateRegex,
      sendMessage,
      uuid
    });
    list.append(card);
  });

  // Re-render on component event (duplicate/delete/mode change)
  list.addEventListener('rules:changed', () => renderRules(rules), { once: true });

  // Drag & drop ordering
  let dragIndex = null;
  list.querySelectorAll('.rule-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragIndex = Number(card.dataset.index);
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetIndex = Number(card.dataset.index);
      if (dragIndex === null || targetIndex === dragIndex) return;
      const [moved] = rules.splice(dragIndex, 1);
      rules.splice(targetIndex, 0, moved);
      await saveRules(rules);
      renderRules(rules);
    });
  });
}

function button(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function i18n(id, fallback) {
  // 1) runtime dict
  const fromDict = I18N_DICT?.[id]?.message;
  if (fromDict) return fromDict;
  // 2) chrome.i18n (browser locale)
  try {
    const msg = chrome.i18n.getMessage(id);
    if (msg) return msg;
  } catch { /* ignore */ }
  // 3) fallback
  return fallback;
}

function validateRegex(pattern) {
  if (!pattern) return null;
  try {
    // Validation only; RE2差異は実行時メモに譲る
    new RegExp(pattern);
    return null;
  } catch (e) {
    return String(e.message || e);
  }
}

function applyStaticI18n() {
  const map = [
    ['pageTitle', 'options_title'],
    ['titleText', 'options_title'],
    ['taglineText', 'options_tagline'],
    ['testerTitle', 'tester_title'],
    ['labelUrl', 'tester_label'],
    ['labelPattern', 'rule_pattern'],
    ['labelReplacement', 'rule_target'],
    ['notesTitle', 'notes_title'],
    ['noteRe2', 'note_re2'],
    ['noteBackref', 'note_backref'],
    ['notePriority', 'note_priority'],
    ['jsonEditorTitle', 'json_editor_title']
  ];
  for (const [elId, msgId] of map) {
    const el = document.getElementById(elId);
    if (el) el.textContent = i18n(msgId, el.textContent);
  }
  // Toolbar buttons
  const tb = [
    ['addRule', 'btn_add_rule'],
    ['enableAll', 'btn_enable_all'],
    ['disableAll', 'btn_disable_all'],
    ['importJson', 'btn_import'],
    ['exportJson', 'btn_export'],
    ['backupRules', 'btn_backup'],
    ['restoreRules', 'btn_restore'],
    ['saveBackupFile', 'btn_backup'],
    ['loadBackupFile', 'btn_restore'],
    ['editJson', 'btn_open_json_editor']
  ];
  tb.forEach(([id, msg]) => { const el = document.getElementById(id); if (el) { el.textContent = i18n(msg, el.textContent); el.setAttribute('aria-label', i18n(msg, el.getAttribute('aria-label'))); } });
  const paste = document.getElementById('pasteGlobal'); if (paste) { paste.textContent = i18n('btn_paste', paste.textContent); paste.setAttribute('aria-label', i18n('btn_paste', paste.getAttribute('aria-label'))); }
  const run = document.getElementById('runTest'); if (run) { run.textContent = i18n('btn_test', run.textContent); run.setAttribute('aria-label', i18n('btn_test', run.getAttribute('aria-label'))); }
  const jsonCancel = document.getElementById('jsonCancel'); if (jsonCancel) jsonCancel.textContent = i18n('json_editor_cancel', jsonCancel.textContent);
  const jsonSave = document.getElementById('saveJson'); if (jsonSave) jsonSave.textContent = i18n('json_editor_save', jsonSave.textContent);
}

async function init() {
  let rules = await loadRules();
  if (!Array.isArray(rules)) rules = [];
  const isExtension = !!(chrome?.runtime?.id);
  // Initialize locale
  const { [LOCALE_KEY]: savedLocale } = await chrome.storage.local.get(LOCALE_KEY);
  let locale = savedLocale || 'ja';
  await loadLocaleMessages(locale);
  applyStaticI18n();
  applyI18nAttributes(i18n);

  if (!isExtension && rules.length === 0) {
    // Seed demo rules for screenshots
    rules = [
      { id: uuid(), enabled: true, description: 'https → http（サンプル）', mode: 'scheme', match: '^https://', schemeTarget: 'http' },
      { id: uuid(), enabled: true, description: 'example → new.example', mode: 'redirect', match: '^https://example\\.com/(.*)$', target: 'https://new.example.com/$1' }
    ];
    await saveRules(rules);
  }

  // Theme init
  const themeBtn = document.getElementById('themeToggle');
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'dark' ? '🌙' : '☀';
    themeBtn.setAttribute('aria-label', theme === 'dark' ? 'ダークモード' : 'ライトモード');
  };
  const { [THEME_KEY]: savedTheme } = await chrome.storage.local.get(THEME_KEY);
  applyTheme(savedTheme || 'light');
  themeBtn.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    await chrome.storage.local.set({ [THEME_KEY]: next });
  });

  // For capture.html to toggle theme without accessing storage
  window.addEventListener('message', (ev) => {
    if (ev?.data?.type === 'set-theme') {
      const t = ev.data.theme === 'dark' ? 'dark' : 'light';
      applyTheme(t);
    }
  });

  // Toolbar wiring
  initToolbar({
    getRules: () => rules,
    setRules: (r) => { rules = r; },
    saveRules,
    loadRules,
    renderRules,
    i18n,
    toast,
    showError,
    uuid,
    validateRulesArray,
    sendMessage: (p) => chrome.runtime.sendMessage(p),
  });

  // Tester wiring
  initTester({ i18n, sendMessage: (p) => chrome.runtime.sendMessage(p), toast, showError });

  // i18n toggle (basic, title bar only for now)
  const langBtn = $('#langToggle');
  const applyLocale = (lc) => {
    document.documentElement.lang = lc;
  // Show current locale label: EN for English UI, JA for Japanese UI
  langBtn.textContent = (lc || 'ja').toUpperCase();
  };
  applyLocale(locale);
  langBtn.addEventListener('click', async () => {
    locale = locale === 'ja' ? 'en' : 'ja';
  await loadLocaleMessages(locale);
    applyLocale(locale);
    await chrome.storage.local.set({ [LOCALE_KEY]: locale });
  // Re-apply static labels and rerender rules for dynamic labels
  applyStaticI18n();
  applyI18nAttributes(i18n);
  // Reload current rules to keep latest and re-render
  rules = await loadRules();
  renderRules(rules);
  });

  // JSON direct editor
  $('#editJson').addEventListener('click', async () => {
    const dlg = $('#jsonEditor');
    const ta = $('#jsonText');
    ta.value = JSON.stringify(rules, null, 2);
    dlg.showModal();
  });
  $('#saveJson').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const next = JSON.parse($('#jsonText').value);
      const vr = validateRulesArray(next);
      if (!vr.ok) throw new Error('Invalid rules schema\n' + vr.errors.join('\n'));
      await saveRules(next);
      rules = await loadRules();
      renderRules(rules);
      $('#jsonEditor').close();
    } catch (err) {
      showError((i18n('json_load_failed') || 'Invalid JSON'), err?.message || String(err));
    }
  });

  renderRules(rules);
}

document.addEventListener('DOMContentLoaded', init);

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.bottom = '16px';
  el.style.right = '16px';
  el.style.background = 'var(--card)';
  el.style.color = 'var(--fg)';
  el.style.border = '1px solid var(--border)';
  el.style.padding = '8px 12px';
  el.style.borderRadius = '6px';
  el.style.boxShadow = '0 2px 10px var(--shadow)';
  el.style.zIndex = '2000';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// Better error modal with details
function showError(title, detail) {
  const dlg = document.createElement('dialog');
  dlg.style.maxWidth = '560px';
  dlg.style.border = '1px solid var(--border)';
  dlg.style.background = 'var(--card)';
  dlg.style.color = 'var(--fg)';
  dlg.innerHTML = `
    <form method="dialog" style="margin:0">
      <h3 style="margin:0 0 8px">${escapeHtml(title || 'Error')}</h3>
      <pre style="white-space:pre-wrap;word-wrap:break-word;background:transparent;border:none;margin:0 0 12px">${escapeHtml(detail || '')}</pre>
      <menu style="display:flex;justify-content:flex-end;gap:8px">
        <button value="cancel">OK</button>
      </menu>
    </form>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validateRulesArray(arr) {
  const errors = [];
  if (!Array.isArray(arr)) return { ok: false, errors: ['Rules must be an array'] };
  arr.forEach((r, idx) => {
    if (!r || typeof r !== 'object') { errors.push(`#${idx}: Rule must be an object`); return; }
    if (typeof r.id !== 'string') errors.push(`#${idx}: id must be string`);
    if (typeof r.match !== 'string') errors.push(`#${idx}: match must be string`);
    if ('enabled' in r && typeof r.enabled !== 'boolean') errors.push(`#${idx}: enabled must be boolean`);
    const mode = r.mode || 'redirect';
    if (mode === 'scheme') {
      // schemeTarget: string or 'clear'
      if (typeof r.schemeTarget !== 'string' || r.schemeTarget.length === 0) {
        errors.push(`#${idx}: schemeTarget is required for scheme mode`);
      }
    } else {
      // redirect mode: require target/rewrite (one of them)
      const subst = (r.target && r.target.length > 0 ? r.target : (r.rewrite || ''));
      if (typeof subst !== 'string' || subst.length === 0) {
        errors.push(`#${idx}: target (or rewrite) is required for redirect mode`);
      }
      // Basic URL template check: allow non-http schemes too, but verify it looks like URL-ish ($1 allowed)
      if (subst && !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(subst) && !/^[a-z][a-z0-9+.-]*:/i.test(subst) && !/\$\d+/.test(subst)) {
        errors.push(`#${idx}: target should be a URL or contain backrefs like $1`);
      }
    }
    // Regex validation
    try { new RegExp(r.match); } catch (e) { errors.push(`#${idx}: match invalid regex - ${String(e.message || e)}`); }
  });
  return { ok: errors.length === 0, errors };
}
