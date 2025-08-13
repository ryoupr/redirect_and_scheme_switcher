// Lightweight i18n applicator using data-i18n attributes
// Exports: applyI18nAttributes(i18n)

export function applyI18nAttributes(i18n) {
  const nodes = document.querySelectorAll('[data-i18n]');
  nodes.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const txt = i18n(key);
    if (txt) el.textContent = txt;
  });
}
