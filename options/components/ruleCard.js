// Small, self-contained RuleCard component builder
// Params:
// - rule, index, rules
// - saveRules: async (rules) => void
// - i18n: (id, fallback?) => string
// - validateRegex: (pattern) => string|null
// - sendMessage: (payload) => Promise<any>
// - uuid: () => string

export function createRuleCard(params) {
  const { rule: r, index, rules, saveRules, i18n, validateRegex, sendMessage, uuid } = params;

  const card = document.createElement('div');
  card.className = 'rule-card';
  card.draggable = true;
  card.dataset.index = String(index);

  const drag = document.createElement('div');
  drag.className = 'drag';
  drag.title = i18n('drag_to_reorder') || '';
  drag.textContent = '⋮⋮';

  const main = document.createElement('div');
  main.className = 'rule-main';

  // rowTop
  const rowTop = document.createElement('div');
  rowTop.className = 'row';
  const onWrap = document.createElement('label');
  onWrap.className = 'switch';
  const on = document.createElement('input');
  on.type = 'checkbox';
  on.checked = !!r.enabled;
  on.addEventListener('change', debounce(async () => { r.enabled = on.checked; await saveRules(rules); }, 50));
  const onTxt = document.createElement('span');
  onTxt.textContent = i18n('rule_on') || 'ON';
  onWrap.append(on, onTxt);

  const descWrap = document.createElement('label');
  const descLab = document.createElement('span');
  descLab.textContent = i18n('rule_description') || 'Description';
  const desc = document.createElement('input');
  desc.type = 'text';
  desc.placeholder = i18n('rule_description') || 'Description';
  desc.value = r.description || '';
  desc.addEventListener('input', debounce(async () => { r.description = desc.value; await saveRules(rules); }, 300));
  descWrap.append(descLab, desc);

  const modeWrap = document.createElement('label');
  const modeLab = document.createElement('span');
  modeLab.textContent = i18n('rule_mode') || 'Mode';
  const modeSel = document.createElement('select');
  modeSel.append(new Option(i18n('mode_redirect') || 'Redirect', 'redirect'), new Option(i18n('mode_scheme') || 'Scheme', 'scheme'));
  modeSel.value = r.mode || 'redirect';
  modeSel.addEventListener('change', async () => { r.mode = modeSel.value; await saveRules(rules); rerender(); });
  modeWrap.append(modeLab, modeSel);

  rowTop.append(onWrap, descWrap);

  const rowMid = document.createElement('div');
  rowMid.className = 'row';

  const matchWrap = document.createElement('label');
  const matchLab = document.createElement('span');
  matchLab.textContent = i18n('rule_pattern') || 'Match (regex)';
  const match = document.createElement('input');
  match.type = 'text';
  match.placeholder = i18n('rule_test_input_placeholder') || '^https://example\\.com/(.*)$';
  match.value = r.match || '';
  const matchErr = document.createElement('div');
  matchErr.className = 'field-error';
  const validateAndSave = async () => {
    r.match = match.value;
    const err = validateRegex(r.match);
    if (err) {
      match.classList.add('invalid');
      match.setAttribute('aria-invalid', 'true');
      matchErr.textContent = (i18n('regex_invalid') || 'Invalid regex') + ': ' + err;
    } else {
      match.classList.remove('invalid');
      match.removeAttribute('aria-invalid');
      matchErr.textContent = '';
    }
    await saveRules(rules);
  };
  match.addEventListener('input', debounce(validateAndSave, 300));
  matchWrap.append(matchLab, match);
  const matchHint = document.createElement('small');
  matchHint.className = 'mono';
  matchHint.textContent = i18n('regex_hint') || '';
  matchWrap.append(matchHint, matchErr);

  let rightWrap;
  const buildRight = () => {
    if ((r.mode || 'redirect') === 'scheme') {
      const container = document.createElement('div');
      const schemeWrap = document.createElement('label');
      const schemeLab = document.createElement('span');
      schemeLab.textContent = i18n('rule_scheme_target') || 'Scheme';
      const schemeSel = document.createElement('select');
      const schemes = [
        ['https', 'https'],
        ['http', 'http'],
        ['obsidian', 'obsidian'],
        ['vscode', 'vscode'],
        ['slack', 'slack'],
        ['clear', (i18n('scheme_clear') || 'Clear') + (i18n('scheme_clear_note') ? ` ${i18n('scheme_clear_note')}` : '')],
        ['custom', i18n('scheme_custom') || 'Custom']
      ];
      schemes.forEach(([val, label]) => schemeSel.append(new Option(label, val)));
      const current = r.schemeTarget || 'https';
      schemeSel.value = schemes.some(([v]) => v === current) ? current : 'custom';
      const customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.placeholder = (i18n('scheme_custom') || 'Custom') + ' (e.g. myapp)';
      customInput.value = !schemes.some(([v]) => v === current) ? (r.schemeTarget || '') : '';
      customInput.style.display = schemeSel.value === 'custom' ? 'block' : 'none';
      schemeSel.addEventListener('change', debounce(async () => {
        if (schemeSel.value === 'custom') {
          customInput.style.display = 'block';
          r.schemeTarget = customInput.value || '';
        } else {
          customInput.style.display = 'none';
          r.schemeTarget = schemeSel.value;
        }
        await saveRules(rules);
      }, 50));
      customInput.addEventListener('input', debounce(async () => {
        if (schemeSel.value === 'custom') { r.schemeTarget = customInput.value || ''; await saveRules(rules); }
      }, 300));
      schemeWrap.append(schemeLab, schemeSel);
      container.append(schemeWrap, customInput);
      return container;
    } else {
      const rewriteWrap = document.createElement('label');
      const rewriteLab = document.createElement('span');
      rewriteLab.textContent = i18n('rule_target') || 'Replacement';
      const rewrite = document.createElement('input');
      rewrite.type = 'text';
      rewrite.placeholder = 'https://new.example.com/$1';
      rewrite.value = r.target && r.target.length > 0 ? r.target : (r.rewrite || '');
      rewrite.addEventListener('input', debounce(async () => { r.target = rewrite.value; await saveRules(rules); }, 300));
      rewriteWrap.append(rewriteLab, rewrite);
      return rewriteWrap;
    }
  };
  rightWrap = buildRight();
  rowMid.append(matchWrap, rightWrap);

  // Inline tester with diff preview
  const rowTest = document.createElement('div');
  rowTest.className = 'inline-test';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.placeholder = i18n('tester_label') || 'URL';
  const run = button(i18n('btn_test') || 'Test', async () => {
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
      const res = await sendMessage(payload);
      const out = document.createElement('div');
      out.className = 'diff-out';
      if (!res?.ok) {
        out.textContent = (i18n('error_prefix') || 'Error') + ': ' + (res?.error || 'unknown');
      } else {
        const note = res.matched ? '' : '(' + (i18n('not_matched') || 'No match') + ') ';
        out.innerHTML = note + renderDiff(url, res.result);
      }
      resultWrap.replaceChildren(out);
    } catch (e) {
      const out = document.createElement('div');
      out.textContent = (i18n('error_prefix') || 'Error') + ': ' + e;
      resultWrap.replaceChildren(out);
    }
  });
  rowTest.append(urlInput, run);
  const resultWrap = document.createElement('div');

  main.append(rowTop, modeWrap, rowMid, rowTest, resultWrap);

  const actions = document.createElement('div');
  actions.className = 'rule-actions';
  const dup = button(i18n('rule_duplicate') || 'Duplicate', async () => {
    const copy = { ...r, id: uuid() };
    rules.splice(index + 1, 0, copy);
    await saveRules(rules);
    rerender();
  });
  const del = button(i18n('rule_delete') || 'Delete', async () => {
    const i = rules.indexOf(r);
    if (i >= 0) { rules.splice(i, 1); await saveRules(rules); rerender(); }
  });
  del.classList.add('danger');
  actions.append(dup, del);

  card.append(drag, main, actions);

  return card;

  // helpers
  function rerender() {
    // Parent should re-render list; simplest path is dispatch a custom event
    card.dispatchEvent(new CustomEvent('rules:changed', { bubbles: true }));
  }
}

function renderDiff(a, b) {
  const { prefix, aMid, bMid, suffix } = simpleDiff(a, b);
  const esc = escapeHtml;
  const arrow = ' → ';
  return `${esc(prefix)}<del class="diff-del">${esc(aMid)}</del>${esc(suffix)}${arrow}${esc(prefix)}<ins class="diff-ins">${esc(bMid)}</ins>${esc(suffix)}`;
}

function simpleDiff(a, b) {
  if (a === b) return { prefix: a, aMid: '', bMid: '', suffix: '' };
  let i = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (i < maxPrefix && a[i] === b[i]) i++;
  let j = 0;
  const aRest = a.length - i;
  const bRest = b.length - i;
  const maxSuffix = Math.min(aRest, bRest);
  while (j < maxSuffix && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const prefix = a.slice(0, i);
  const aMid = a.slice(i, a.length - j);
  const bMid = b.slice(i, b.length - j);
  const suffix = a.slice(a.length - j);
  return { prefix, aMid, bMid, suffix };
}

function button(text, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
