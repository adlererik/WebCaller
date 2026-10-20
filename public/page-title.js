// Per-browser presentation preference. Never changes an identity or server data.
export const DEFAULT_PAGE_TITLE = 'Home';
const storageKey = 'webcaller-page-title';
export function pageTitle(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return null;
  const title = value.trim().replace(/\s+/gu, ' ');
  return title.length <= 48 ? title || DEFAULT_PAGE_TITLE : null;
}
export function pageTitleControls({document, storage}) {
  let title = DEFAULT_PAGE_TITLE;
  try { title = pageTitle(storage?.getItem(storageKey)) || DEFAULT_PAGE_TITLE; } catch {}
  const byId = id => document.getElementById(id), dialog = byId('page-title-dialog'), input = byId('page-title-input');
  function render() {
    document.title = title;
    const value = byId('page-title-value'); if (value) value.textContent = title;
  }
  byId('page-title-open')?.addEventListener('click', () => {
    input.value = title; input.setCustomValidity(''); dialog.showModal(); input.focus();
  });
  input?.addEventListener('input', () => input.setCustomValidity(''));
  byId('page-title-form')?.addEventListener('submit', event => {
    event.preventDefault(); const next = pageTitle(input.value);
    if (next === null) { input.setCustomValidity('Choose a title of up to 48 characters without control characters.'); input.reportValidity(); return; }
    title = next; try { storage?.setItem(storageKey, title); } catch {}
    render(); dialog.close();
  });
  render();
}
if (typeof document !== 'undefined') {
  let storage; try { storage = localStorage; } catch {}
  pageTitleControls({document, storage});
}
