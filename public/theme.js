const storageKey = 'webcaller-theme';
export const themeChoice = value => ['dark', 'light'].includes(value) ? value : 'system';

export function themeControls({ document, storage, media }) {
  let choice = 'system';
  try { choice = themeChoice(storage?.getItem(storageKey)); } catch {}
  const select = document.getElementById('theme-choice');
  function render() {
    const dark = choice === 'dark' || choice === 'system' && media.matches;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = dark ? '#191b20' : '#fafbfe';
    if (select) select.value = choice;
  }
  select?.addEventListener('change', () => {
    choice = themeChoice(select.value);
    try { storage?.setItem(storageKey, choice); } catch {}
    render();
  });
  if (media.addEventListener) media.addEventListener('change', render);
  else media.addListener?.(render);
  render();
}

if (typeof document !== 'undefined') {
  let storage;
  try { storage = localStorage; } catch {}
  themeControls({ document, storage, media: matchMedia('(prefers-color-scheme: dark)') });
}
