// Options page logic for managing regex redirect rules.
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

function uuid() {
  return 'r_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  rules.forEach((r, index) => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.draggable = true;
    card.dataset.index = String(index);

    // Drag handle
  const drag = document.createElement('div');
  drag.className = 'drag';
  drag.title = i18n('drag_to_reorder', 'ドラッグで並べ替え');
    drag.textContent = '⋮⋮';

    // Main inputs
    const main = document.createElement('div');
    main.className = 'rule-main';

  const rowTop = document.createElement('div');
  rowTop.className = 'row';
    const onWrap = document.createElement('label');
    onWrap.className = 'switch';
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !!r.enabled;
    on.addEventListener('change', debounce(async () => {
      r.enabled = on.checked;
      await saveRules(rules);
    }, 50));
    const onTxt = document.createElement('span');
  onTxt.textContent = i18n('rule_on', 'ON');
    onWrap.append(on, onTxt);

  const descWrap = document.createElement('label');
    const descLab = document.createElement('span');
  descLab.textContent = i18n('rule_description', '説明');
  const desc = document.createElement('input');
    desc.type = 'text';
    desc.placeholder = '説明 (任意)';
    desc.value = r.description || '';
    desc.addEventListener('input', debounce(async () => {
      r.description = desc.value;
      await saveRules(rules);
    }, 300));
    descWrap.append(descLab, desc);
    // Mode selector
    const modeWrap = document.createElement('label');
    const modeLab = document.createElement('span');
  modeLab.textContent = i18n('rule_mode', 'モード');
    const modeSel = document.createElement('select');
  const optRedirect = new Option(i18n('mode_redirect', 'リダイレクト'), 'redirect');
  const optScheme = new Option(i18n('mode_scheme', 'スキーム変換'), 'scheme');
    modeSel.append(optRedirect, optScheme);
    modeSel.value = r.mode || 'redirect';
    modeSel.addEventListener('change', async () => {
      r.mode = modeSel.value;
      await saveRules(rules);
      renderRules(rules);
    });
    modeWrap.append(modeLab, modeSel);

    rowTop.append(onWrap, descWrap);

    const rowMid = document.createElement('div');
    rowMid.className = 'row';
    const matchWrap = document.createElement('label');
    const matchLab = document.createElement('span');
  matchLab.textContent = i18n('rule_pattern', '正規表現（マッチ）');
    const match = document.createElement('input');
    match.type = 'text';
    match.placeholder = '^https://example\\.com/(.*)$';
    match.value = r.match || '';
    match.addEventListener('input', debounce(async () => {
      r.match = match.value;
      await saveRules(rules);
    }, 300));
  matchWrap.append(matchLab, match);
  const matchHint = document.createElement('small');
  matchHint.className = 'mono';
  matchHint.textContent = i18n('regex_hint', "ヒント: 特殊文字はエスケープが必要です（例: '?' は \\?、'.' は \\.）");
  matchWrap.append(matchHint);

    // Right side: either rewrite input (redirect) or scheme controls (scheme)
    let rightWrap;
    if ((r.mode || 'redirect') === 'scheme') {
      rightWrap = document.createElement('div');
      const schemeWrap = document.createElement('label');
  const schemeLab = document.createElement('span');
  schemeLab.textContent = i18n('rule_scheme_target', 'スキーム');
      const schemeSel = document.createElement('select');
      const schemes = [
        ['https', 'https'],
        ['http', 'http'],
        ['obsidian', 'obsidian'],
        ['vscode', 'vscode'],
        ['slack', 'slack'],
        ['clear', i18n('scheme_clear', 'クリア') + '（先頭スキームのみ削除）'],
        ['custom', i18n('scheme_custom', 'カスタム')]
      ];
      schemes.forEach(([val, label]) => schemeSel.append(new Option(label, val)));
      const current = r.schemeTarget || 'https';
      schemeSel.value = schemes.some(([v]) => v === current) ? current : 'custom';

      const customInput = document.createElement('input');
      customInput.type = 'text';
  customInput.placeholder = i18n('scheme_custom', 'カスタム') + ' (e.g. myapp)';
      customInput.value = !schemes.some(([v]) => v === current) ? (r.schemeTarget || '') : '';
      customInput.style.display = schemeSel.value === 'custom' ? 'block' : 'none';

      schemeSel.addEventListener('change', debounce(async () => {
        if (schemeSel.value === 'custom') {
          customInput.style.display = 'block';
          r.schemeTarget = customInput.value || '';
        } else {
          customInput.style.display = 'none';
          r.schemeTarget = schemeSel.value; // 'https' | 'http' | 'obsidian' | 'vscode' | 'slack' | 'clear'
        }
        await saveRules(rules);
      }, 50));

      customInput.addEventListener('input', debounce(async () => {
        if (schemeSel.value === 'custom') {
          r.schemeTarget = customInput.value || '';
          await saveRules(rules);
        }
      }, 300));

      schemeWrap.append(schemeLab, schemeSel);
      rightWrap.append(schemeWrap);
      rightWrap.append(customInput);
    } else {
      const rewriteWrap = document.createElement('label');
  const rewriteLab = document.createElement('span');
  rewriteLab.textContent = i18n('rule_target', '置換');
      const rewrite = document.createElement('input');
      rewrite.type = 'text';
  rewrite.placeholder = 'https://new.example.com/$1';
      rewrite.value = r.target && r.target.length > 0 ? r.target : (r.rewrite || '');
      rewrite.addEventListener('input', debounce(async () => {
        r.target = rewrite.value; // regexSubstitution
        await saveRules(rules);
      }, 300));
      rewriteWrap.append(rewriteLab, rewrite);
      rightWrap = rewriteWrap;
    }

    rowMid.append(matchWrap, rightWrap);

    // Inline tester
    const rowTest = document.createElement('div');
    rowTest.className = 'inline-test';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'テスト用URLを貼り付け';
  const testOut = document.createElement('output');
  const run = button(i18n('btn_test', 'テスト'), async () => {
      const url = urlInput.value;
      try {
        const payload = {
          type: 'test-rule',
          url,
          mode: r.mode || 'redirect',
          pattern: match.value,
          replacement: (r.mode || 'redirect') === 'scheme' ? '' : (r.target && r.target.length > 0 ? r.target : (r.rewrite || '')),
          schemeTarget: (r.mode || 'redirect') === 'scheme' ? (r.schemeTarget || 'https') : undefined
        };
        const res = await chrome.runtime.sendMessage(payload);
        if (!res?.ok) {
          testOut.textContent = 'エラー: ' + (res?.error || 'unknown');
        } else {
          const note = res.matched ? '' : '（' + i18n('not_matched', '未マッチ') + '） ';
          testOut.textContent = note + res.result;
        }
      } catch (e) {
        testOut.textContent = 'エラー: ' + e;
      }
    });
    rowTest.append(urlInput, run);
    const rowTest2 = document.createElement('div');
    rowTest2.append(testOut);

  main.append(rowTop, modeWrap, rowMid, rowTest, rowTest2);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'rule-actions';
  const dup = button(i18n('rule_duplicate', '複製'), async () => {
      const copy = { ...r, id: uuid() };
      rules.splice(index + 1, 0, copy);
      await saveRules(rules);
      renderRules(rules);
    });
  const del = button(i18n('rule_delete', '削除'), async () => {
      const i = rules.indexOf(r);
      if (i >= 0) {
        rules.splice(i, 1);
        await saveRules(rules);
        renderRules(rules);
      }
    });
    del.classList.add('danger');
    actions.append(dup, del);

    card.append(drag, main, actions);
    list.append(card);
  });

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
  tb.forEach(([id, msg]) => { const el = document.getElementById(id); if (el) el.textContent = i18n(msg, el.textContent); });
  const paste = document.getElementById('pasteGlobal'); if (paste) paste.textContent = i18n('btn_paste', paste.textContent);
  const run = document.getElementById('runTest'); if (run) run.textContent = i18n('btn_test', run.textContent);
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

  $('#addRule').addEventListener('click', async () => {
    rules.push({ id: uuid(), enabled: true, match: '', rewrite: '', target: '' });
    await saveRules(rules);
    renderRules(rules);
  });

  $('#enableAll').addEventListener('click', async () => {
    rules.forEach(r => r.enabled = true);
    await saveRules(rules);
    renderRules(rules);
  });
  $('#disableAll').addEventListener('click', async () => {
    rules.forEach(r => r.enabled = false);
    await saveRules(rules);
    renderRules(rules);
  });

  $('#exportJson').addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ type: 'export-rules' });
    if (!res?.ok) return;
    const blob = new Blob([JSON.stringify(res.rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'url-redirecter-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Save backup to file
  $('#saveBackupFile').addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'url-redirecter-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });
  // Load backup from file
  $('#loadBackupFile').addEventListener('click', () => {
    $('#backupFilePicker').click();
  });
  $('#backupFilePicker').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Invalid backup format');
      await saveRules(data);
      rules = await loadRules();
      renderRules(rules);
      toast(i18n('toast_restored', '復元しました'));
    } catch (err) {
      alert(i18n('toast_error', 'エラーが発生しました') + ': ' + err.message);
    } finally {
      e.target.value = '';
    }
  });

  // One-click backup/restore (local only)
  $('#backupRules').addEventListener('click', async () => {
    await chrome.storage.local.set({ [BACKUP_KEY]: rules });
    toast(i18n('btn_backup', 'バックアップ保存'));
  });
  $('#restoreRules').addEventListener('click', async () => {
    const { [BACKUP_KEY]: backup = null } = await chrome.storage.local.get(BACKUP_KEY);
    if (!Array.isArray(backup)) { toast(i18n('backup_missing', 'バックアップが見つかりません')); return; }
    await saveRules(backup);
    rules = await loadRules();
    renderRules(rules);
    toast(i18n('toast_restored', '復元しました'));
  });

  $('#importJson').addEventListener('click', () => {
    $('#filePicker').click();
  });
  $('#filePicker').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const res = await chrome.runtime.sendMessage({ type: 'import-rules', rules: data });
      if (res?.ok) {
        rules = await loadRules();
        renderRules(rules);
      }
    } catch (err) {
      alert(i18n('json_load_failed', 'JSONの読み込みに失敗しました') + ': ' + err);
    } finally {
      e.target.value = '';
    }
  });

  $('#runTest').addEventListener('click', async () => {
    const url = $('#testUrl').value;
    const pattern = $('#testPattern').value;
    const replacement = $('#testReplacement').value;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'test-regex', url, pattern, replacement });
      if (res?.ok) {
        $('#testResult').textContent = res.result;
      } else {
        $('#testResult').textContent = 'エラー: ' + res.error;
      }
    } catch (e) {
      $('#testResult').textContent = 'エラー: ' + e;
    }
  });

  // Paste from clipboard to test URL
  $('#pasteGlobal').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('#testUrl').value = text;
    } catch {
      alert(i18n('clipboard_read_failed', 'クリップボードの読み取りに失敗しました'));
    }
  });

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
      if (!Array.isArray(next)) throw new Error('配列ではありません');
      await saveRules(next);
      rules = await loadRules();
      renderRules(rules);
      $('#jsonEditor').close();
    } catch (err) {
      alert('JSONが不正です: ' + err.message);
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
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}
