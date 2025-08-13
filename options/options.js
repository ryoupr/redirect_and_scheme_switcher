// Options page logic for managing regex redirect rules.
const STORAGE_KEY = 'redirectRulesV1';
const THEME_KEY = 'uiThemeV1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
    drag.title = 'ドラッグで並べ替え';
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
    onTxt.textContent = 'ON';
    onWrap.append(on, onTxt);

  const descWrap = document.createElement('label');
    const descLab = document.createElement('span');
    descLab.textContent = '説明';
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
    modeLab.textContent = '動作';
    const modeSel = document.createElement('select');
    const optRedirect = new Option('URLリダイレクト', 'redirect');
    const optScheme = new Option('スキーム変換', 'scheme');
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
    matchLab.textContent = '正規表現（マッチ）';
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
  matchHint.textContent = "ヒント: 特殊文字はエスケープが必要です（例: '?' は \\?、'.' は \\.）";
  matchWrap.append(matchHint);

    // Right side: either rewrite input (redirect) or scheme controls (scheme)
    let rightWrap;
    if ((r.mode || 'redirect') === 'scheme') {
      rightWrap = document.createElement('div');
      const schemeWrap = document.createElement('label');
      const schemeLab = document.createElement('span');
      schemeLab.textContent = '変換後スキーム';
      const schemeSel = document.createElement('select');
      const schemes = [
        ['https', 'https'],
        ['http', 'http'],
        ['obsidian', 'obsidian'],
        ['vscode', 'vscode'],
        ['slack', 'slack'],
        ['clear', 'クリア（先頭スキームのみ削除）'],
        ['custom', 'カスタム']
      ];
      schemes.forEach(([val, label]) => schemeSel.append(new Option(label, val)));
      const current = r.schemeTarget || 'https';
      schemeSel.value = schemes.some(([v]) => v === current) ? current : 'custom';

      const customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.placeholder = 'カスタムスキーム (例: myapp)';
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
      rewriteLab.textContent = '置換（regexSubstitution）';
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
    const run = button('テスト', async () => {
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
          const note = res.matched ? '' : '（未マッチ） ';
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
    const dup = button('複製', async () => {
      const copy = { ...r, id: uuid() };
      rules.splice(index + 1, 0, copy);
      await saveRules(rules);
      renderRules(rules);
    });
    const del = button('削除', async () => {
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

async function init() {
  let rules = await loadRules();
  if (!Array.isArray(rules)) rules = [];

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
      alert('JSONの読み込みに失敗しました: ' + err);
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
