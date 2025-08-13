// Minimal test harness for utilities in options.js
// Run these tests by opening tests/test_runner.html in a browser context.

function assert(name, cond) {
  const el = document.createElement('div');
  el.textContent = (cond ? 'PASS' : 'FAIL') + ' - ' + name;
  el.style.color = cond ? 'green' : 'red';
  document.body.appendChild(el);
}

// Bring in functions by re-defining simple copies (to avoid module import complexity in extension env)
function validateRegex(pattern) {
  if (!pattern) return null;
  try { new RegExp(pattern); return null; } catch (e) { return String(e.message || e); }
}

function simpleDiff(a, b) {
  if (a === b) return { prefix: a, aMid: '', bMid: '', suffix: '' };
  let i = 0; const maxPrefix = Math.min(a.length, b.length);
  while (i < maxPrefix && a[i] === b[i]) i++;
  let j = 0; const aRest = a.length - i; const bRest = b.length - i; const maxSuffix = Math.min(aRest, bRest);
  while (j < maxSuffix && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const prefix = a.slice(0, i), aMid = a.slice(i, a.length - j), bMid = b.slice(i, b.length - j), suffix = a.slice(a.length - j);
  return { prefix, aMid, bMid, suffix };
}

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10,16).join('')}`;
  }
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Tests
window.addEventListener('DOMContentLoaded', () => {
  // validateRegex
  assert('validateRegex ok', validateRegex('^https://example\\.com/(.*)$') === null);
  assert('validateRegex error', validateRegex('(') !== null);

  // simpleDiff
  const d = simpleDiff('https://a.com/x', 'https://a.com/y');
  assert('simpleDiff prefix', d.prefix === 'https://a.com/');
  assert('simpleDiff aMid', d.aMid === 'x');
  assert('simpleDiff bMid', d.bMid === 'y');

  // uuid format
  const u = uuid();
  assert('uuid format', /^(r-|[0-9a-f]{8}-)/.test(u));
});
