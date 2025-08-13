// Global tester initializer (bottom section)
// Exports initTester(ctx)
// ctx: { i18n, sendMessage, toast, showError }

export function initTester(ctx) {
  const { i18n, sendMessage } = ctx;
  const $ = (sel, root = document) => root.querySelector(sel);

  $('#runTest')?.addEventListener('click', async () => {
    const url = $('#testUrl').value;
    const pattern = $('#testPattern').value;
    const replacement = $('#testReplacement').value;
    try {
      const res = await sendMessage({ type: 'test-regex', url, pattern, replacement });
      if (res?.ok) {
        $('#testResult').textContent = res.result;
      } else {
        $('#testResult').textContent = (i18n('error_prefix') || 'Error') + ': ' + res.error;
      }
    } catch (e) {
      $('#testResult').textContent = (i18n('error_prefix') || 'Error') + ': ' + e;
    }
  });

  $('#pasteGlobal')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      $('#testUrl').value = text;
    } catch {
      // keep toast on caller side if needed
    }
  });
}
