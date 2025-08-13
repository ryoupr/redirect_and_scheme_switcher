// Options page logic for managing regex redirect rules.
const STORAGE_KEY = 'redirectRulesV1';

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
  const tbody = $('#rulesBody');
  tbody.innerHTML = '';
  for (const r of rules) {
    const tr = document.createElement('tr');

    const tdOn = document.createElement('td');
    const on = document.createElement('input');
    on.type = 'checkbox';
    on.checked = !!r.enabled;
    on.addEventListener('change', async () => {
      r.enabled = on.checked;
      await saveRules(rules);
    });
    tdOn.append(on);

    const tdDesc = document.createElement('td');
    const desc = document.createElement('input');
    desc.type = 'text';
    desc.placeholder = '説明 (任意)';
    desc.value = r.description || '';
    desc.addEventListener('input', debounce(async () => {
      r.description = desc.value;
      await saveRules(rules);
    }, 300));
    tdDesc.append(desc);

    const tdMatch = document.createElement('td');
    const match = document.createElement('input');
    match.type = 'text';
    match.placeholder = '^https://example\\.com/(.*)$';
    match.value = r.match || '';
    match.addEventListener('input', debounce(async () => {
      r.match = match.value;
      await saveRules(rules);
    }, 300));
    tdMatch.append(match);

    const tdRewrite = document.createElement('td');
    const rewrite = document.createElement('input');
    rewrite.type = 'text';
    rewrite.placeholder = 'https://new.example.com/$1';
    rewrite.value = r.target && r.target.length > 0 ? r.target : (r.rewrite || '');
    rewrite.addEventListener('input', debounce(async () => {
      // Store in target to use as regexSubstitution directly.
      r.target = rewrite.value;
      await saveRules(rules);
    }, 300));
    tdRewrite.append(rewrite);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions';
    const up = button('↑', async () => {
      const i = rules.indexOf(r);
      if (i > 0) {
        rules.splice(i - 1, 0, rules.splice(i, 1)[0]);
        await saveRules(rules);
        renderRules(rules);
      }
    });
    const down = button('↓', async () => {
      const i = rules.indexOf(r);
      if (i < rules.length - 1) {
        rules.splice(i + 1, 0, rules.splice(i, 1)[0]);
        await saveRules(rules);
        renderRules(rules);
      }
    });
    const del = button('削除', async () => {
      const i = rules.indexOf(r);
      if (i >= 0) {
        rules.splice(i, 1);
        await saveRules(rules);
        renderRules(rules);
      }
    });

    tdActions.append(up, down, del);

    tr.append(tdOn, tdDesc, tdMatch, tdRewrite, tdActions);
    tbody.append(tr);
  }
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

  $('#addRule').addEventListener('click', async () => {
    rules.push({ id: uuid(), enabled: true, match: '', rewrite: '', target: '' });
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
