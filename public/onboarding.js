// Fragments stay out of HTTP requests. Invitations take precedence over owner setup.
export function readEntryFragment(hash) {
  const params=new URLSearchParams(hash.replace(/^#/,''));
  const invitation=params.get('invite');
  const rawSetup=params.get('setup');
  const setupCode=!invitation&&rawSetup&&/^[A-Za-z0-9_-]{16,128}$/.test(rawSetup)?rawSetup:null;
  return {invitation,setupCode,name:setupCode?(params.get('name')||'').trim().slice(0,48):''};
}
export function clearEntryFragment(location,history) {
  const params=new URLSearchParams(location.hash.replace(/^#/,''));
  if(params.has('invite')||params.has('setup'))history.replaceState(null,'',location.pathname+location.search);
}
