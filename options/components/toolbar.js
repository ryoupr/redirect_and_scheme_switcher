// Toolbar initializer: wires toolbar buttons and file pickers
// Exports initToolbar(ctx)
// ctx: { getRules, setRules, saveRules, loadRules, renderRules, i18n, toast, showError, uuid, validateRulesArray, sendMessage }

export function initToolbar(ctx) {
  const { getRules, setRules, saveRules, loadRules, renderRules, i18n, toast, showError, uuid, validateRulesArray, sendMessage } = ctx;

  const $ = (sel, root = document) => root.querySelector(sel);

  $('#addRule')?.addEventListener('click', async () => {
    const rules = getRules();
    rules.push({ id: uuid(), enabled: true, match: '', rewrite: '', target: '' });
    await saveRules(rules);
    renderRules(rules);
  });

  $('#enableAll')?.addEventListener('click', async () => {
    const rules = getRules();
    rules.forEach(r => r.enabled = true);
    await saveRules(rules);
    renderRules(rules);
  });

  $('#disableAll')?.addEventListener('click', async () => {
    const rules = getRules();
    rules.forEach(r => r.enabled = false);
    await saveRules(rules);
    renderRules(rules);
  });

  $('#exportJson')?.addEventListener('click', async () => {
    const res = await sendMessage({ type: 'export-rules' });
    if (!res?.ok) return;
    const blob = new Blob([JSON.stringify(res.rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'url-redirecter-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#saveBackupFile')?.addEventListener('click', async () => {
    const rules = getRules();
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'url-redirecter-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  $('#loadBackupFile')?.addEventListener('click', () => {
    $('#backupFilePicker')?.click();
  });

  $('#backupFilePicker')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const vr = validateRulesArray(data);
      if (!vr.ok) throw new Error('Invalid rules schema\n' + vr.errors.join('\n'));
      await saveRules(data);
      const rules = await loadRules();
      setRules(rules);
      renderRules(rules);
      toast(i18n('toast_restored'));
    } catch (err) {
      showError(i18n('toast_error') || 'Error occurred', err?.message || String(err));
    } finally {
      e.target.value = '';
    }
  });

  $('#backupRules')?.addEventListener('click', async () => {
    const rules = getRules();
    await chrome.storage.local.set({ redirectRulesBackupV1: rules });
    toast(i18n('btn_backup') || 'Saved backup');
  });

  $('#restoreRules')?.addEventListener('click', async () => {
    const { redirectRulesBackupV1: backup = null } = await chrome.storage.local.get('redirectRulesBackupV1');
    if (!Array.isArray(backup)) { toast(i18n('backup_missing') || 'No backup found'); return; }
    await saveRules(backup);
    const rules = await loadRules();
    setRules(rules);
    renderRules(rules);
    toast(i18n('toast_restored') || 'Restored');
  });

  $('#importJson')?.addEventListener('click', () => {
    $('#filePicker')?.click();
  });

  $('#filePicker')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const vr = validateRulesArray(data);
      if (!vr.ok) throw new Error('Invalid rules schema\n' + vr.errors.join('\n'));
      const res = await sendMessage({ type: 'import-rules', rules: data });
      if (res?.ok) {
        const rules = await loadRules();
        setRules(rules);
        renderRules(rules);
      }
    } catch (err) {
      showError(i18n('json_load_failed') || 'Failed to load JSON', String(err));
    } finally {
      e.target.value = '';
    }
  });
}
