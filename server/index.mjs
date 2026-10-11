import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual, createPublicKey } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import webpush from 'web-push';
import { createStore } from './store.mjs';
import {attachmentRoutes} from './attachments.mjs';
import {CHUNK_SIZE} from '../public/attachments.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const hash = (v) => createHash('sha256').update(v).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const userView = (u) => ({ id: u.id, name: u.name, keys: JSON.parse(u.keys) });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const validName = (s) => typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 48;
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function validKeys(keys) {
  try {
    for (const k of [keys.dh, keys.sign]) {
      if (k.kty !== 'EC' || k.crv !== 'P-256' || k.d || typeof k.x !== 'string' || typeof k.y !== 'string') return false;
      createPublicKey({ key: k, format: 'jwk' });
    }
    return true;
  } catch { return false; }
}
async function body(req) {
  let n = 0; const parts = [];
  for await (const part of req) { n += part.length; if (n > 65536) fail(413, 'Request too large'); parts.push(part); }
  try { return JSON.parse(Buffer.concat(parts).toString() || '{}'); } catch { fail(400, 'Invalid JSON'); }
}

export function createApp(options = {}) {
  const env = { ...process.env, ...options.env };
  const publicURL = new URL(env.PUBLIC_URL || 'http://localhost:8080/calls');
  const base = publicURL.pathname.replace(/\/$/, '') || '/calls';
  const origin = publicURL.origin;
  const store = createStore(options.dataDir || env.DATA_DIR || './data');
  const sockets = new Map(), tickets = new Map(), calls = new Map(), rates = new Map();
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (pushReady) webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const contacts = (id) => store.all('SELECT users.* FROM users JOIN contacts ON contacts.b=users.id WHERE contacts.a=?', id).map(userView);
  const related = (a, b) => !!store.get('SELECT 1 FROM contacts WHERE a=? AND b=?', a, b);
  const handleAttachment=attachmentRoutes({store,related,validateEnvelope,fail,body,env});
  const emit = (id, event) => { for (const ws of sockets.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)); };
  const auth = (req) => {
    const token = req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
    const u = token && store.get('SELECT * FROM users WHERE token_hash=?', hash(token));
    if (!u) fail(401, 'Please set up this device again');
    return u;
  };
  const rate = (key, limit = 120) => {
    const now = Date.now(), r = rates.get(key);
    if (!r || r.until < now) rates.set(key, { count: 1, until: now + 60000 });
    else if (++r.count > limit) fail(429, 'Please wait a moment and try again');
  };
  async function push(id, payload, ttl = 60) {
    if (!pushReady) return;
    const rows = store.all('SELECT * FROM push WHERE owner=?', id);
    await Promise.allSettled(rows.map(async (row) => {
      try { await webpush.sendNotification(JSON.parse(row.subscription), JSON.stringify(payload), { TTL: ttl, urgency: 'high', timeout: 10000 }); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) store.run('DELETE FROM push WHERE endpoint=?', row.endpoint); }
    }));
  }
  async function ice(id) {
    if (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN) {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CF_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: 7200 }), signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) fail(503, 'The relay is unavailable. Try again shortly.');
      const result = await r.json();
      return { iceServers: result.iceServers, turn: true, expiresAt: Date.now() + 7200000 };
    }
    const iceServers = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
    if (env.TURN_SECRET && env.TURN_URLS) {
      const username = `${Math.floor(Date.now()/1000)+7200}:${id}`;
      iceServers.push({ urls: env.TURN_URLS.split(',').map(s => s.trim()), username, credential: createHmac('sha1', env.TURN_SECRET).update(username).digest('base64') });
    }
    return { iceServers, turn: iceServers.length > 1, expiresAt: Date.now() + 7200000 };
  }
  const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY'
  };
  const server = http.createServer(async (req, res) => {
    for (const [k,v] of Object.entries(securityHeaders)) res.setHeader(k,v);
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, origin), path = url.pathname;
      if (path === `${base}/health`) return json(200, { ok: true });
      if (!path.startsWith(base + '/') && path !== base) return json(404, { error: 'Not found' });
      if (path.startsWith(`${base}/api/`)) {
        if (req.method !== 'GET' && req.headers.origin !== origin) fail(403, 'Unrecognized origin');
        const route = path.slice((base + '/api').length);
        if (route === '/config' && req.method === 'GET') return json(200, { base, publicURL: publicURL.href.replace(/\/$/, ''), vapidPublicKey: env.VAPID_PUBLIC_KEY || null, bootstrap: !store.get('SELECT id FROM users LIMIT 1'), turnConfigured: Boolean((env.TURN_SECRET && env.TURN_URLS) || (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN)) });
        if (route === '/register' && req.method === 'POST') {
          rate(`register:${req.socket.remoteAddress}`, 10);
          const b = await body(req);
          if (store.get('SELECT id FROM users LIMIT 1')) fail(403, 'You need an invitation');
          if (!env.BOOTSTRAP_TOKEN || !same(b.setupCode, env.BOOTSTRAP_TOKEN)) fail(403, 'Incorrect setup code');
          if (!validName(b.name) || !validKeys(b.keys)) fail(400, 'Invalid name or device keys');
          const token = secret(), id = randomUUID();
          store.run('INSERT INTO users VALUES(?,?,?,?)', id, b.name.trim(), JSON.stringify(b.keys), hash(token));
          return json(201, { token, user: userView(store.get('SELECT * FROM users WHERE id=?', id)), contacts: [] });
        }
        if (route === '/join' && req.method === 'POST') {
          rate(`join:${req.socket.remoteAddress}`, 20);
          const b = await body(req);
          if (!validName(b.name) || !validKeys(b.keys) || typeof b.invite !== 'string' || b.invite.length > 100) fail(400, 'Invalid invitation or device keys');
          const existing = req.headers.authorization ? auth(req) : null;
          const result = store.transaction(() => {
            const invite = store.get('SELECT * FROM invites WHERE hash=? AND expires>?', hash(b.invite), Date.now());
            if (!invite) fail(410, 'This invitation has expired or was already used');
            if (existing?.id === invite.owner) fail(400, 'Open this invitation on the other person’s device');
            const owner = store.get('SELECT * FROM users WHERE id=?', invite.owner);
            if (b.fingerprint !== hash(JSON.stringify(JSON.parse(owner.keys)))) fail(403, 'Invitation identity does not match');
            const id = existing?.id || randomUUID(), token = existing ? null : secret();
            if (!existing) store.run('INSERT INTO users VALUES(?,?,?,?)', id, b.name.trim(), JSON.stringify(b.keys), hash(token));
            store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)', invite.owner, id);
            store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)', id, invite.owner);
            store.run('DELETE FROM invites WHERE hash=?', invite.hash);
            return { token, user: userView(store.get('SELECT * FROM users WHERE id=?', id)), contact: userView(owner), contacts: contacts(id) };
          });
          emit(result.contact.id, { type: 'contacts' });
          return json(201, result);
        }
        const u = auth(req); rate(route.startsWith('/attachments')?'attachment:'+u.id:u.id,route.startsWith('/attachments')?600:120);
        if(await handleAttachment(req,res,route,u,json))return;
        if (route === '/me' && req.method === 'GET') return json(200, { user: userView(u), contacts: contacts(u.id) });
        if (route === '/invite' && req.method === 'POST') {
          rate(`invite:${u.id}`, 10);
          const token = secret(), expiresAt = Date.now() + 86400000;
          store.run('INSERT INTO invites VALUES(?,?,?)', hash(token), u.id, expiresAt);
          return json(201, { url: `${publicURL.href.replace(/\/$/,'')}/#invite=${token}.${hash(u.keys)}`, expiresAt });
        }
        if (route === '/ice' && req.method === 'GET') { rate(`ice:${u.id}`, 12); return json(200, await ice(u.id)); }
        if (route === '/ticket' && req.method === 'POST') {
          const ticket = secret(); tickets.set(ticket, { id: u.id, expires: Date.now() + 15000 }); return json(200, { ticket });
        }
        if (route === '/messages' && req.method === 'GET') {
          store.purge();
          return json(200, store.all('SELECT envelope FROM messages WHERE (recipient=? OR sender=?) AND expires>? ORDER BY created DESC LIMIT 500', u.id, u.id, Date.now()).reverse().map(r => JSON.parse(r.envelope)));
        }
        if (route === '/messages' && req.method === 'POST') {
          const b = await body(req); validateEnvelope(b, u.id);
          if (!related(u.id, b.to)) fail(403, 'Invite this person first');
          const prior = store.get('SELECT sender,envelope FROM messages WHERE id=?', b.id);
          if (prior) { if (prior.sender !== u.id || prior.envelope !== JSON.stringify(b)) fail(409, 'Message identifier conflict'); return json(200, { id: b.id }); }
          const attachment=store.get('SELECT * FROM attachments WHERE message_id=?',b.id);
          if(attachment){
            if(attachment.sender!==u.id||attachment.envelope!==JSON.stringify(b))fail(409,'Attachment message does not match');
            if(store.get('SELECT COUNT(*) AS n FROM attachment_chunks WHERE attachment=?',attachment.id).n!==Math.ceil(attachment.size/CHUNK_SIZE))fail(409,'Finish uploading the file first');
          }
          store.transaction(()=>{
            store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)', b.id, u.id, b.to, b.expiresAt, b.createdAt, JSON.stringify(b));
            if(attachment)store.run('UPDATE attachments SET committed=1 WHERE id=?',attachment.id);
          });
          emit(b.to, { type: 'message', envelope: b }); emit(u.id, { type: 'message', envelope: b });
          void push(b.to, { type: 'message', url: base + '/', expiresAt: b.expiresAt }, Math.max(0, Math.min(60, Math.floor((b.expiresAt-Date.now())/1000))));
          return json(201, { id: b.id });
        }
        if (route === '/push' && req.method === 'POST') {
          if (!pushReady) fail(503, 'Notifications are not configured on the server');
          const b = await body(req);
          // Do not turn push subscriptions into a server-side URL fetch primitive.
          let endpoint; try { endpoint = new URL(b.endpoint); } catch { fail(400, 'Invalid subscription'); }
          const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'push.apple.com'];
          if (endpoint.protocol !== 'https:' || endpoint.port || !allowed.some(h => endpoint.hostname === h || endpoint.hostname.endsWith('.' + h)) || !b.keys?.p256dh || !b.keys?.auth || JSON.stringify(b).length > 4096) fail(400, 'Unsupported push service');
          if (store.get('SELECT endpoint FROM push WHERE endpoint=? AND owner<>?', b.endpoint, u.id)) fail(409, 'Subscription belongs to another device');
          if (store.get('SELECT COUNT(*) AS n FROM push WHERE owner=?', u.id).n >= 5 && !store.get('SELECT endpoint FROM push WHERE endpoint=?', b.endpoint)) fail(429, 'Too many subscriptions');
          store.run('INSERT OR REPLACE INTO push VALUES(?,?,?)', u.id, b.endpoint, JSON.stringify(b)); return json(200, { ok: true });
        }
        if (route === '/push' && req.method === 'DELETE') { store.run('DELETE FROM push WHERE owner=?', u.id); return json(200, { ok: true }); }
        if (route === '/device' && req.method === 'DELETE') {
          const peers = contacts(u.id);
          store.transaction(() => {
            store.run('DELETE FROM attachments WHERE sender=? OR recipient=?',u.id,u.id);
            store.run('DELETE FROM messages WHERE sender=? OR recipient=?', u.id, u.id);
            store.run('DELETE FROM invites WHERE owner=?', u.id);
            store.run('DELETE FROM push WHERE owner=?', u.id);
            store.run('DELETE FROM contacts WHERE a=? OR b=?', u.id, u.id);
            store.run('DELETE FROM users WHERE id=?', u.id);
          });
          for (const peer of peers) emit(peer.id, { type: 'contacts' });
          for (const ws of sockets.get(u.id) || []) ws.close(4401, 'Device removed');
          return json(200, { ok: true });
        }
        return json(404, { error: 'Not found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') fail(405, 'Method not allowed');
      if (path === base) { res.writeHead(308, { Location: base + '/' }); return res.end(); }
      const relative = decodeURIComponent(path.slice(base.length + 1)) || 'index.html';
      const file = resolve(root, relative);
      if (!file.startsWith(root) || !(await stat(file)).isFile()) fail(404, 'Not found');
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) { json(e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.status ? e.message : e.code === 'ENOENT' ? 'Not found' : 'Something went wrong. Try again.' }); }
  });
  function validateEnvelope(b, sender, signaling = false) {
    const now = Date.now();
    if (b?.v !== 1 || b.from !== sender || typeof b.to !== 'string' || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/.test(b.id) || !Number.isSafeInteger(b.createdAt) || !Number.isSafeInteger(b.expiresAt) || b.createdAt > now + 30000 || b.createdAt < now - 300000 || b.expiresAt <= now || b.expiresAt - b.createdAt > (signaling ? 120000 : 604800000) || b.expiresAt <= b.createdAt || typeof b.ciphertext !== 'string' || b.ciphertext.length > 24000 || typeof b.selfCiphertext !== 'string' || b.selfCiphertext.length > 24000 || typeof b.signature !== 'string' || b.signature.length > 128 || typeof b.iv !== 'string' || b.iv.length !== 16 || !b.ephemeral?.x || !b.ephemeral?.y || b.ephemeral.d) fail(400, 'Invalid encrypted message');
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.origin !== origin || req.url !== base + '/ws') return socket.destroy();
    try { rate(`upgrade:${req.socket.remoteAddress}`, 60); } catch { return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    ws.isAlive = true;
    const deadline = setTimeout(() => ws.close(4401, 'Authentication required'), 5000);
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', async raw => {
      try {
        const b = JSON.parse(raw);
        if (!ws.user) {
          const ticket = tickets.get(b.ticket); tickets.delete(b.ticket);
          if (b.type !== 'auth' || !ticket || ticket.expires < Date.now()) return ws.close(4401, 'Ticket expired');
          if ((sockets.get(ticket.id)?.size || 0) >= 4) return ws.close(4429, 'Too many tabs');
          ws.user = ticket.id; clearTimeout(deadline);
          if (!sockets.has(ws.user)) sockets.set(ws.user, new Set()); sockets.get(ws.user).add(ws);
          ws.send(JSON.stringify({ type: 'ready' }));
          const pending = [...calls.values()].find(c => c.to === ws.user && c.expiresAt > Date.now());
          if (pending) ws.send(JSON.stringify({ type: 'signal', envelope: pending.envelope, kind: 'offer', callId: pending.id }));
          return;
        }
        rate(`ws:${ws.user}`, 240);
        if (b.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
        if (b.type !== 'signal' || !['offer','answer','ice','hangup','restart','video','receipt'].includes(b.kind)) fail(400, 'Invalid signal');
        validateEnvelope(b.envelope, ws.user, true);
        if (!related(ws.user, b.envelope.to)) fail(403, 'Unknown contact');
        if (!/^[a-f0-9-]{36}$/.test(b.callId)) fail(400, 'Invalid call');
        const target = b.envelope.to, active = calls.get(b.callId);
        if (b.kind === 'offer') {
          if (active) return;
          if ([...calls.values()].some(c => [c.from,c.to].includes(ws.user) || [c.from,c.to].includes(target))) {
            ws.send(JSON.stringify({ type: 'busy', callId: b.callId })); return;
          }
          calls.set(b.callId, { id: b.callId, from: ws.user, to: target, envelope: b.envelope, expiresAt: Math.min(b.envelope.expiresAt, Date.now()+90000), answered: false });
          emit(target, b);
          void push(target, { type: 'call', url: base + '/', callId: b.callId, expiresAt: Date.now()+60000 });
          return;
        }
        if (b.kind !== 'receipt' && (!active || ![active.from,active.to].includes(ws.user) || ![active.from,active.to].includes(target) || ws.user === target)) fail(403, 'Unknown call');
        if (b.kind === 'answer') { active.answered = true; active.expiresAt = Date.now()+14400000; }
        if (b.kind === 'hangup') { calls.delete(b.callId); emit(ws.user, b); }
        emit(target, b);
      } catch (e) { ws.send(JSON.stringify({ type: 'error', error: e.status ? e.message : 'Invalid request' })); }
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (ws.user) { const set = sockets.get(ws.user); set?.delete(ws); if (!set?.size) sockets.delete(ws.user); }
      if (ws.user && !sockets.has(ws.user)) {
        const timer = setTimeout(() => {
          if (sockets.has(ws.user)) return;
          for (const [id,c] of calls) if ([c.from,c.to].includes(ws.user)) {
            calls.delete(id); emit(c.from, { type:'call-expired', callId:id }); emit(c.to, { type:'call-expired', callId:id });
          }
        },45000); timer.unref();
      }
    });
    ws.on('error', () => {});
  });
  const cleanup = setInterval(() => {
    const now = Date.now(); store.purge(now);
    for (const [t, v] of tickets) if (v.expires < now) tickets.delete(t);
    for (const [key, v] of rates) if (v.until < now) rates.delete(key);
    for (const [id, c] of calls) if (c.expiresAt < now) { calls.delete(id); emit(c.from, { type: 'call-expired', callId: id }); emit(c.to, { type: 'call-expired', callId: id }); }
  }, 1000); cleanup.unref();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 30000); heartbeat.unref();
  return { server, store, base, close: async () => { clearInterval(cleanup); clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(r => server.close(r)); store.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`WebCaller Calls listening on http://${host}:${port}${app.base}/`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
