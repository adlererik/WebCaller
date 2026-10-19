// Runs independently of the module graph, which can stall on a weak connection.
// Retrying reloads this page; it never changes saved device or message storage.
(() => {
  const notice = document.getElementById('startup-notice');
  const message = document.getElementById('startup-detail');
  const retry = document.getElementById('startup-retry');
  let finished = false;
  function show(text, failed = false) {
    if (finished) return;
    message.textContent = text;
    notice.hidden = false;
    if (failed) document.getElementById('connection').textContent = 'Unable to load';
  }
  const timer = setTimeout(() => show('WebCaller is taking longer to load. You can wait or reload. Keep this browser’s site data.'), 12000);
  window.addEventListener('webcaller-startup', event => {
    const state = event.detail?.state;
    if (state === 'ready' || state === 'setup') {
      finished = true;
      clearTimeout(timer);
      notice.hidden = true;
    } else if (state === 'failed') {
      clearTimeout(timer);
      show(event.detail.message || 'WebCaller could not finish loading. Reload to try again. Keep this browser’s site data.', true);
    }
  });
  window.addEventListener('error', event => {
    if (event.target === window || event.target?.tagName === 'SCRIPT') {
      clearTimeout(timer);
      show('A required app file could not load. Reload to try again. Keep this browser’s site data.', true);
    }
  }, true);
  retry.addEventListener('click', () => location.reload());
})();
