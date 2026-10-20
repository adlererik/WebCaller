// Keep aliases on the same origin and the same account/database. No redirects
// between app paths: an existing iPhone Home Screen phone must keep its profile.
export function appPaths(publicURL, aliases = '') {
  const canonical = publicURL.pathname.replace(/\/$/, '') || '/calls';
  const valid = path => /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path);
  const paths = [canonical, ...aliases.split(',').map(p => p.trim()).filter(Boolean).map(p => p.replace(/\/$/, ''))];
  if (paths.length > 9 || paths.some(path => !valid(path))) throw new Error('Use app paths such as /com and comma-separated APP_PATH_ALIASES such as /calls.');
  return [...new Set(paths)].sort((a, b) => b.length - a.length);
}
export const matchAppPath = (path, paths) => paths.find(base => path === base || path.startsWith(base + '/'));
export function manifestIdentity(value, fallback) {
  const path = value || fallback + '/';
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/$/.test(path)) throw new Error('APP_MANIFEST_ID must be an absolute app directory path, such as /calls/.');
  return path;
}
