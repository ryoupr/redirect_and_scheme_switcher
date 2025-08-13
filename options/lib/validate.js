// Lightweight schema validation for rules
// Returns { ok: boolean, errors: string[], data: Rule[] }
export function validateRules(input) {
  const errors = [];
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['Rules must be an array'], data: [] };
  }
  const out = [];
  input.forEach((r, idx) => {
    const path = `rules[${idx}]`;
    if (typeof r !== 'object' || r === null) {
      errors.push(`${path}: must be an object`);
      return;
    }
    const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : '';
    const enabled = !!r.enabled;
    const mode = (r.mode === 'scheme' || r.mode === 'redirect') ? r.mode : 'redirect';
    const match = typeof r.match === 'string' ? r.match : '';
    if (!match) errors.push(`${path}.match: required`);
    // Regex validation (best effort)
    if (match) {
      try { new RegExp(match); } catch (e) { errors.push(`${path}.match: invalid regex (${e.message || e})`); }
    }
    const description = typeof r.description === 'string' ? r.description : '';
    let target = typeof r.target === 'string' ? r.target : (typeof r.rewrite === 'string' ? r.rewrite : '');
    let schemeTarget = typeof r.schemeTarget === 'string' ? r.schemeTarget : undefined;

    if (mode === 'redirect') {
      if (target === '') errors.push(`${path}.target: empty; redirect rules should provide a replacement`);
    } else if (mode === 'scheme') {
      const okSchemes = ['http','https','obsidian','vscode','slack','clear'];
      if (schemeTarget && !okSchemes.includes(schemeTarget) && !/^[a-z][a-z0-9+.-]*$/i.test(schemeTarget)) {
        errors.push(`${path}.schemeTarget: invalid scheme '${schemeTarget}'`);
      }
    }

    out.push({ id, enabled, mode, match, description, target, schemeTarget });
  });
  return { ok: errors.length === 0, errors, data: out };
}
