export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.role = 'status';
  el.ariaLive = 'polite';
  el.style.position = 'fixed';
  el.style.bottom = '16px';
  el.style.right = '16px';
  el.style.background = type === 'error' ? 'var(--danger-bg, #622)' : 'var(--card)';
  el.style.color = 'var(--fg)';
  el.style.border = '1px solid var(--border)';
  el.style.padding = '8px 12px';
  el.style.borderRadius = '6px';
  el.style.boxShadow = '0 2px 10px var(--shadow)';
  el.style.zIndex = '2000';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

export function showError(message, detail) {
  console.error(message, detail || '');
  toast(message, 'error');
}
