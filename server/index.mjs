import {ratchetStatement} from '../public/envelope-auth.js';
import {registerViewTimer,visibleMessages,replayDeadline} from './message-retention.mjs';
import {validLifetime,hasViewTimer} from '../public/message-lifetime.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual, createPublicKey, verify } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import webpush from 'web-push';
import {gzipSync} from 'node:zlib';
import { createStore } from './store.mjs';
import {messageEventRoutes} from './message-events.mjs';
import {attachmentRoutes} from './attachments.mjs';
import {transferLimits} from './transfer-limits.mjs';
import {CHUNK_SIZE} from '../public/attachments.js';
import {validAttribution,defaultAttribution} from '../public/location.js';
import {createCallAlerts,notificationPayload} from './call-alerts.mjs';
import {ratchetRoutes} from './ratchet.mjs';
import {ntfyAlerts} from './ntfy.mjs';
import {dialing} from './dialing.mjs';

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
  const mapTileURL=env.MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const mapProvider=new URL(mapTileURL,origin);
  if((mapProvider.protocol!=='https:'&&mapProvider.origin!==origin)||mapProvider.username||mapProvider.password||!['{z}','{x}','{y}'].every(part=>mapTileURL.includes(part)))throw new Error('MAP_TILE_URL must be an HTTPS tile template (or same-origin) with {z}, {x} and {y}.');
  const mapAttribution={text:env.MAP_TILE_ATTRIBUTION||defaultAttribution.text,url:env.MAP_TILE_ATTRIBUTION_URL||defaultAttribution.url};
  if(!validAttribution(mapAttribution))throw new Error('Invalid map attribution. Supply text and an HTTPS copyright URL.');
  const mapImageSource=mapProvider.origin===origin?'':mapProvider.origin;

  const store = createStore(options.dataDir || env.DATA_DIR || './data');
  const acquireTransfer=transferLimits();
  const sockets = new Map(), tickets = new Map(), calls = new Map(), rates = new Map(), disconnectTimers=new Map();
  const alertTests=new Map(),testTimers=new Set();
  const pushReady = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  if (pushReady) webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  let directory;
  const contacts = (id) => {const saved=store.all('SELECT users.* FROM users JOIN contacts ON contacts.b=users.id WHERE contacts.a=?', id).map(userView);return directory?directory.roster(id,saved):saved;};
  const related = (a, b) => !directory?.blocked(a,b)&&!!store.get('SELECT 1 FROM contacts WHERE a=? AND b=?', a, b);
  const canContact=(a,b)=>related(a,b)||!!directory?.pending(a,b);
  const handleAttachment=attachmentRoutes({store,related,validateEnvelope,fail,body,env,cancelled:a=>{emit(a.sender,{type:'transfer-ended',id:a.message_id});emit(a.recipient,{type:'transfer-ended',id:a.message_id});}});
  const emit = (id, event) => { for (const ws of sockets.get(id) || []) if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)); };
  const handleMessageEvents=messageEventRoutes({store,body,fail,validateEnvelope,emit});
  const handleRatchet=ratchetRoutes({store,related:canContact,body,fail,emit});
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
  directory=dialing({store,body,fail,rate,emit,userView,validKeys,validName,hash,publicURL:publicURL.href,enabled:env.DIAL_CODES_ENABLED!=='false'});
  async function push(id, payload, ttl = 60, topic, endpoint) {
    if (!pushReady) return;
    const rows = endpoint?store.all('SELECT * FROM push WHERE owner=? AND endpoint=?',id,endpoint):store.all('SELECT * FROM push WHERE owner=?', id);
    await Promise.allSettled(rows.map(async (row) => {
      try { await (options.sendPush||webpush.sendNotification)(JSON.parse(row.subscription), JSON.stringify(payload), { TTL: ttl, urgency: 'high', timeout: 10000, ...(topic?{topic}:{}) }); }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) store.run('DELETE FROM push WHERE endpoint=?', row.endpoint); }
    }));
  }
  const extraAlerts=ntfyAlerts({env,publicURL:publicURL.href,store,body,fail,rate,fetcher:options.ntfyFetch||fetch,testDelay:options.testAlertDelay??8000});
  const alerts=createCallAlerts({isWaiting:id=>{const c=calls.get(id);return !!c&&!c.answered&&c.expiresAt>Date.now();},
    ...(options.alertTiming||{}),onStop:id=>extraAlerts.stop(id),send:async(c,revision,expiresAt)=>{
      if(c.alertTransport!=='web-push'&&await extraAlerts.call(c,revision,expiresAt))return;
      // A failed publish can finish after answer/hang-up. Never send a fallback
      // for an ended call, and keep this call's remaining reminders on web push.
      if(calls.get(c.id)!==c||c.answered||c.expiresAt<=Date.now()||expiresAt<=Date.now())return;
      c.alertTransport='web-push';
      return push(c.to,notificationPayload({type:'call',callId:c.id,revision,url:publicURL.href.replace(/\/$/,'')+'/',expiresAt,callExpiresAt:c.expiresAt}),
        Math.max(0,Math.floor((expiresAt-Date.now())/1000)),hash(c.id).slice(0,32));
    }});
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
    'Content-Security-Policy': `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob: ${mapImageSource}; connect-src 'self'; media-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), speaker-selection=(self)',
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
        if (route === '/config' && req.method === 'GET') return json(200, { base, mapTileURL, mapAttribution, ntfyAvailable:extraAlerts.available, dialCodes:env.DIAL_CODES_ENABLED!=='false', publicURL: publicURL.href.replace(/\/$/, ''), vapidPublicKey: env.VAPID_PUBLIC_KEY || null, bootstrap: !store.get('SELECT id FROM users LIMIT 1'), turnConfigured: Boolean((env.TURN_SECRET && env.TURN_URLS) || (env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN)) });
        if(route==='/dial/connect'&&req.method==='POST')return await directory.connect(req,json);
        if(route==='/invite-info'&&req.method==='POST'){
          rate(`invite-info:${req.socket.remoteAddress}`,30);const b=await body(req);
          if(typeof b.invite!=='string'||b.invite.length>100)fail(400,'Open the full invitation link');
          const invitation=store.get('SELECT * FROM invites WHERE hash=? AND expires>?',hash(b.invite),Date.now());
          if(!invitation)fail(410,'This invitation has expired or was already accepted. Ask for a new invitation.');
          const owner=store.get('SELECT * FROM users WHERE id=?',invitation.owner);
          if(b.fingerprint!==hash(owner.keys))fail(403,'This invitation could not be verified. Ask for a new link.');
          return json(200,{from:owner.name,name:invitation.name,expiresAt:invitation.expires});
        }
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
            if(existing&&directory.blocked(id,invite.owner))fail(403,'This contact is blocked');
            if (!existing) store.run('INSERT INTO users VALUES(?,?,?,?)', id, b.name.trim(), JSON.stringify(b.keys), hash(token));
            store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)', invite.owner, id);
            store.run('INSERT OR IGNORE INTO contacts VALUES(?,?)', id, invite.owner);
            store.run('DELETE FROM invites WHERE hash=?', invite.hash);
            return { token, user: userView(store.get('SELECT * FROM users WHERE id=?', id)), contact: userView(owner), contacts: contacts(id) };
          });
          emit(result.contact.id, { type: 'contacts' });
          return json(201, result);
        }
        const u = auth(req);
        if(route.startsWith('/attachments')){
          const release=acquireTransfer(u.id);res.once('finish',release);res.once('close',release);
        }else rate(u.id);
        if(await directory.routes(req,route,u,json))return;
        if(await extraAlerts.routes(req,route,u,json))return;
        if(await handleRatchet(req,res,route,u,json))return;
        if(await handleAttachment(req,res,route,u,json))return;
        if(await handleMessageEvents(req,res,route,u,json))return;
        if (route === '/me' && req.method === 'GET') return json(200, { user: userView(u), contacts: contacts(u.id) });
        const removeContact=route.match(/^\/contacts\/([a-f0-9-]{36})$/);
        if(removeContact&&req.method==='DELETE'){
          const peer=removeContact[1];if(peer===u.id)fail(400,'Choose a contact');store.purge();
          const block=url.searchParams.get('block')==='1';if(block&&!store.get('SELECT 1 FROM users WHERE id=?',peer))fail(404,'Contact unavailable');
          // Deleted IDs remain until their original expiry, preventing late upload
          // commits/replays from restoring history, even after a fresh invitation.
          const deleted=store.transaction(()=>{
            const pair=[u.id,peer,peer,u.id];
            const rows=store.all('SELECT id,sender,recipient,expires FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) UNION SELECT message_id AS id,sender,recipient,expires FROM attachments WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',...pair,...pair);
            for(const m of rows)store.run('INSERT OR IGNORE INTO message_deletions VALUES(?,?,?,?)',m.id,m.sender,m.recipient,replayDeadline(store,m.id,m.expires));
            store.run('DELETE FROM attachments WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',...pair);
            store.run('DELETE FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',...pair);
            store.run('DELETE FROM contacts WHERE (a=? AND b=?) OR (a=? AND b=?)',...pair);
            store.run('DELETE FROM contact_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',...pair);
            if(block)store.run('INSERT OR IGNORE INTO contact_blocks VALUES(?,?,?)',u.id,peer,Date.now());
            return store.all('SELECT id,expires FROM message_deletions WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',...pair);
          });
          for(const [id,c]of calls)if([c.from,c.to].includes(u.id)&&[c.from,c.to].includes(peer)){
            alerts.stop(id);calls.delete(id);const event={type:'call-ended',callId:id,reason:'Contact removed.'};emit(c.from,event);emit(c.to,event);
          }
          // Send revocation first so visible clients stop transfers immediately;
          // their ordinary resync also learns all deletion IDs when reconnecting.
          emit(u.id,{type:'contacts'});emit(peer,{type:'contacts'});
          return json(200,{ok:true,contacts:contacts(u.id),deleted});
        }
        if (route === '/invite' && req.method === 'POST') {
          rate(`invite:${u.id}`, 10);
          const b=await body(req);if(b.name!==undefined&&b.name!==''&&!validName(b.name))fail(400,'Use a name of up to 48 characters');
          const token = secret(), expiresAt = Date.now() + 86400000;
          store.run('INSERT INTO invites(hash,owner,expires,name) VALUES(?,?,?,?)', hash(token), u.id, expiresAt,(b.name||'').trim());
          return json(201, { url: `${publicURL.href.replace(/\/$/,'')}/#invite=${token}.${hash(u.keys)}`, expiresAt });
        }
        if (route === '/ice' && req.method === 'GET') { rate(`ice:${u.id}`, 12); return json(200, await ice(u.id)); }
        if (route === '/ticket' && req.method === 'POST') {
          const ticket = secret(); tickets.set(ticket, { id: u.id, expires: Date.now() + 15000 }); return json(200, { ticket });
        }
        if (route === '/messages' && req.method === 'GET') {
          store.purge();
          return json(200, visibleMessages(store,u.id).reverse().map(r => JSON.parse(r.envelope)));
        }
        if(route==='/message-deletions'&&req.method==='GET'){
          store.purge();return json(200,store.all('SELECT id,expires FROM message_deletions WHERE sender=? OR recipient=?',u.id,u.id));
        }
        const deletion=route.match(/^\/messages\/([a-f0-9-]{36})$/);
        if(deletion&&req.method==='DELETE'){
          store.purge();const m=store.get('SELECT * FROM messages WHERE id=?',deletion[1])||store.get('SELECT * FROM message_deletions WHERE id=?',deletion[1]);
          if(!m||![m.sender,m.recipient].includes(u.id))fail(404,'Message unavailable');
          store.transaction(()=>{
            store.run('INSERT OR IGNORE INTO message_deletions VALUES(?,?,?,?)',m.id,m.sender,m.recipient,replayDeadline(store,m.id,m.expires));
            store.run('DELETE FROM attachments WHERE message_id=?',m.id);
            store.run('DELETE FROM messages WHERE id=?',m.id);
          });
          const event={type:'message-deleted',id:m.id,expires:m.expires};emit(m.sender,event);emit(m.recipient,event);
          return json(200,{ok:true});
        }
        if (route === '/messages' && req.method === 'POST') {
          const b = await body(req),attachment=store.get('SELECT * FROM attachments WHERE message_id=?',b.id);
          // Reserved uploads were validated at creation; a slow upload can exceed five minutes.
          validateEnvelope(b,u.id,false,attachment?.sender===u.id);
          if(b.v===3&&!hasViewTimer(b))fail(400,'Invalid message lifetime mode');
          if(store.get('SELECT id FROM message_deletions WHERE id=?',b.id))fail(410,'Message was deleted');
          if (!canContact(u.id, b.to)) fail(403, 'Connect with this person first');
          const prior = store.get('SELECT sender,envelope FROM messages WHERE id=?', b.id);
          if (prior) { if (prior.sender !== u.id || prior.envelope !== JSON.stringify(b)) fail(409, 'Message identifier conflict'); return json(200, { id: b.id }); }
          directory.beforeMessage(u.id,b);
          if(attachment){
            if(attachment.sender!==u.id||attachment.envelope!==JSON.stringify(b))fail(409,'Attachment message does not match');
            if(attachment.expires<=Date.now())fail(410,'Upload expired. Please send the file again.');
            if(store.get('SELECT COUNT(*) AS n FROM attachment_chunks WHERE attachment=?',attachment.id).n!==Math.ceil(attachment.size/CHUNK_SIZE))fail(409,'Finish uploading the file first');
          }
          store.transaction(()=>{
            store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)', b.id, u.id, b.to, b.expiresAt, b.createdAt, JSON.stringify(b));
            registerViewTimer(store,b);
            directory.countMessage(u.id,b.to);
            if(attachment)store.run('UPDATE attachments SET committed=1,expires=? WHERE id=?',b.expiresAt,attachment.id);
          });
          emit(b.to, { type: 'message', envelope: b }); emit(u.id, { type: 'message', envelope: b });
          void push(b.to, notificationPayload({type:'message',messageId:b.id,peerId:b.from,recipientId:b.to,url:publicURL.href.replace(/\/$/,'')+'/',expiresAt:b.expiresAt}), Math.max(0, Math.min(60, Math.floor((b.expiresAt-Date.now())/1000))));
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
          const subscription=JSON.stringify({endpoint:b.endpoint,keys:{auth:b.keys.auth,p256dh:b.keys.p256dh}});
          const prior=store.get('SELECT subscription,confirmed FROM push WHERE endpoint=?',b.endpoint);
          store.run('INSERT OR REPLACE INTO push(owner,endpoint,subscription,confirmed) VALUES(?,?,?,?)', u.id, b.endpoint, subscription,prior?.subscription===subscription?prior.confirmed:0); return json(200, { ok: true });
        }
        if(route==='/push/status'&&req.method==='POST'){
          const b=await body(req),row=store.get('SELECT confirmed FROM push WHERE owner=? AND endpoint=?',u.id,b.endpoint||'');
          return json(200,{configured:pushReady,subscribed:!!row,confirmed:!!row?.confirmed});
        }
        if(route==='/push/test'&&req.method==='POST'){
          rate('push-test:'+u.id,3);const b=await body(req);
          if(!pushReady||!store.get('SELECT 1 FROM push WHERE owner=? AND endpoint=?',u.id,b.endpoint||''))fail(409,'Enable call alerts on this phone first');
          const id=randomUUID(),expiresAt=Date.now()+600000;alertTests.set(id,{owner:u.id,endpoint:b.endpoint,expiresAt,sent:false});
          const timer=setTimeout(()=>{testTimers.delete(timer);const test=alertTests.get(id);if(!test)return;test.sent=true;
            void push(u.id,notificationPayload({type:'test',testId:id,url:publicURL.href.replace(/\/$/,'')+'/',expiresAt:Date.now()+15000}),15,hash(id).slice(0,32),test.endpoint);
          },options.testAlertDelay??8000);timer.unref();testTimers.add(timer);
          return json(202,{testId:id,delay:8,expiresAt});
        }
        if(route==='/push/test-result'&&req.method==='POST'){
          const b=await body(req),test=alertTests.get(b.testId);
          if(!test||test.owner!==u.id||test.expiresAt<=Date.now()||!test.sent)fail(410,'Send a fresh test alert first');
          if(b.heard!==true)fail(400,'Only confirm after hearing the alert');
          store.run('UPDATE push SET confirmed=? WHERE owner=? AND endpoint=?',Date.now(),u.id,test.endpoint);alertTests.delete(b.testId);return json(200,{ok:true});
        }
        const declineCall=route.match(/^\/calls\/([a-f0-9-]{36})\/decline$/);
        if(declineCall&&req.method==='POST'){
          const c=calls.get(declineCall[1]);if(!c)return json(200,{ok:true});
          if(c.to!==u.id)fail(404,'Call unavailable');if(c.answered)fail(409,'Call already answered');
          alerts.stop(c.id);calls.delete(c.id);const event={type:'call-ended',callId:c.id,reason:'Call declined'};emit(c.from,event);emit(c.to,event);return json(200,{ok:true});
        }
        const callStatus=route.match(/^\/calls\/([a-f0-9-]{36})$/);
        if(callStatus&&req.method==='GET'){
          const c=calls.get(callStatus[1]);
          if(c&&![c.to,c.from].includes(u.id))fail(404,'Call unavailable');
          const canAnswer=!!c&&c.to===u.id&&!c.answered&&c.expiresAt>Date.now();
          return json(200,{state:!c||c.expiresAt<=Date.now()?'ended':c.answered?'answered':'ringing',canAnswer,expiresAt:c?.expiresAt||null,
            ...(canAnswer&&url.searchParams.get('offer')==='1'?{offer:{kind:'offer',callId:c.id,envelope:c.envelope}}:{})});
        }
        if (route === '/push' && req.method === 'DELETE') { store.run('DELETE FROM push WHERE owner=?', u.id); return json(200, { ok: true }); }
        if (route === '/device' && req.method === 'DELETE') {
          const peers = contacts(u.id);
          extraAlerts.revoke(u.id);
          for(const [id,c] of calls)if(c.to===u.id||c.from===u.id){alerts.stop(id);calls.delete(id);emit(c.to===u.id?c.from:c.to,{type:'call-ended',callId:id,reason:'Device removed'});}
          for(const [id,test] of alertTests)if(test.owner===u.id)alertTests.delete(id);
          store.transaction(() => {
            store.run('DELETE FROM attachments WHERE sender=? OR recipient=?',u.id,u.id);
            store.run('DELETE FROM messages WHERE sender=? OR recipient=?', u.id, u.id);
            store.run('DELETE FROM message_deletions WHERE sender=? OR recipient=?',u.id,u.id);
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
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm':'application/wasm' };
      const data = await readFile(file);
      if(extname(file)==='.wasm'&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){
        const compressed=gzipSync(data);res.writeHead(200,{'Content-Type':'application/wasm','Content-Encoding':'gzip','Vary':'Accept-Encoding','Content-Length':compressed.length});return res.end(req.method==='HEAD'?undefined:compressed);
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (e) { json(e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.status ? e.message : e.code === 'ENOENT' ? 'Not found' : 'Something went wrong. Try again.' }); }
  });
  function validateEnvelope(b, sender, signaling = false, reservedUpload = false) {
    const now = Date.now();
    if (![1,2,3].includes(b?.v) || b.from !== sender || typeof b.to !== 'string' || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/.test(b.id) || !Number.isSafeInteger(b.createdAt) || !Number.isSafeInteger(b.expiresAt) || b.createdAt > now + 30000 || (!reservedUpload && b.createdAt < now - 300000) || b.expiresAt <= now || !validLifetime(b,signaling) || b.expiresAt <= b.createdAt || typeof b.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(b.signature)) fail(400, 'Invalid encrypted message');
    if(b.v===1){
      if(typeof b.ciphertext!=='string'||b.ciphertext.length>24000||typeof b.selfCiphertext!=='string'||b.selfCiphertext.length>24000||typeof b.iv!=='string'||b.iv.length!==16||!b.ephemeral?.x||!b.ephemeral?.y||b.ephemeral.d)fail(400,'Invalid encrypted message');
      if(store.get('SELECT owner FROM ratchet_accounts WHERE owner IN (?,?)',sender,b.to)&&!reservedUpload)fail(426,'Reopen WebCaller on both phones to update secure messaging.');
    }else{
      const r=b.ratchet,key=s=>typeof s==='string'&&/^[A-Za-z0-9+/]{43}$/.test(s);
      if(b.selfCiphertext!==undefined||b.ephemeral!==undefined||r?.protocol!=='olm-v2'||!['chat','events','signal','files','typing','transfer'].includes(r.lane)||typeof r.scope!=='string'||r.scope.length>100||![0,1].includes(r.type)||!key(r.sessionId)||!key(r.identity)||!key(r.recipientIdentity)||typeof r.data!=='string'||!/^[A-Za-z0-9_-]+$/.test(r.data)||r.data.length>24000||typeof r.prekeyId!=='string'||r.prekeyId.length>24)fail(400,'Invalid ratchet message');
      const from=store.get('SELECT identity FROM ratchet_accounts WHERE owner=?',sender),to=store.get('SELECT identity FROM ratchet_accounts WHERE owner=?',b.to);
      if(!from||!to||from.identity!==r.identity||to.identity!==r.recipientIdentity)fail(400,'Secure device identity does not match');
      if(b.v===3){
        const signer=store.get('SELECT keys FROM users WHERE id=?',sender);let authentic=false;
        try{authentic=verify('sha256',Buffer.from(ratchetStatement(b)),{key:createPublicKey({key:JSON.parse(signer.keys).sign,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(b.signature,'base64url'));}catch{}
        if(!authentic)fail(400,'Invalid signed message lifetime');
      }
    }
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
      let b;
      try {
        b = JSON.parse(raw);
        if (!ws.user) {
          const ticket = tickets.get(b.ticket); tickets.delete(b.ticket);
          if (b.type !== 'auth' || !ticket || ticket.expires < Date.now()) return ws.close(4401, 'Ticket expired');
          if ((sockets.get(ticket.id)?.size || 0) >= 4) return ws.close(4429, 'Too many tabs');
          ws.user = ticket.id; clearTimeout(deadline);
          clearTimeout(disconnectTimers.get(ws.user));disconnectTimers.delete(ws.user);
          if (!sockets.has(ws.user)) sockets.set(ws.user, new Set()); sockets.get(ws.user).add(ws);
          ws.send(JSON.stringify({ type: 'ready' }));
          const pending = [...calls.values()].find(c => c.to === ws.user && c.expiresAt > Date.now());
          if (pending&&!pending.answered) ws.send(JSON.stringify({ type: 'signal', envelope: pending.envelope, kind: 'offer', callId: pending.id }));
          return;
        }
        rate(`ws:${ws.user}`, 240);
        if (b.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
        if(b.type==='transfer'){
          validateEnvelope(b.envelope,ws.user,true);if(b.envelope.expiresAt-b.envelope.createdAt>20000)fail(400,'Transfer update expires too late');
          if(!/^[a-f0-9-]{36}$/.test(b.messageId||''))fail(400,'Invalid transfer');
          const a=store.get('SELECT * FROM attachments WHERE message_id=? AND expires>?',b.messageId,Date.now());
          if(!a||a.sender!==ws.user||a.recipient!==b.envelope.to||!related(a.sender,a.recipient))fail(403,'Unknown transfer');
          if(a.committed)return;if(b.envelope.expiresAt>a.expires)fail(400,'Transfer update exceeds file expiry');
          rate(`transfer:${ws.user}`,40);emit(a.recipient,{type:'transfer',messageId:b.messageId,envelope:b.envelope});return;
        }
        if(b.type==='typing'){
          validateEnvelope(b.envelope,ws.user,true);
          if(b.envelope.expiresAt-b.envelope.createdAt>10000)fail(400,'Typing update expires too late');
          if(!related(ws.user,b.envelope.to))fail(403,'Unknown contact');
          rate(`typing:${ws.user}`,40);emit(b.envelope.to,{type:'typing',envelope:b.envelope});return;
        }
        if (b.type !== 'signal' || !['offer','answer','ice','hangup','restart','video','sharing','receipt','sas'].includes(b.kind)) fail(400, 'Invalid signal');
        validateEnvelope(b.envelope, ws.user, true);
        if (!canContact(ws.user, b.envelope.to)) fail(403, 'Unknown contact');
        if (!/^[a-f0-9-]{36}$/.test(b.callId)) fail(400, 'Invalid call');
        const target = b.envelope.to, active = calls.get(b.callId);
        if (b.kind === 'offer') {
          if (active) return;
          if(!related(ws.user,target)){rate('request-call:'+ws.user+':'+target,3);rate('request-call-to:'+target,6);}
          if ([...calls.values()].some(c => [c.from,c.to].includes(ws.user) || [c.from,c.to].includes(target))) {
            ws.send(JSON.stringify({ type: 'busy', callId: b.callId })); return;
          }
          const waiting={ id: b.callId, from: ws.user, to: target, envelope: b.envelope, expiresAt: Math.min(b.envelope.expiresAt, Date.now()+90000), answered: false };
          calls.set(b.callId,waiting);
          emit(target, b);
          alerts.start(waiting);
          return;
        }
        if (b.kind !== 'receipt' && (!active || ![active.from,active.to].includes(ws.user) || ![active.from,active.to].includes(target) || ws.user === target)) fail(403, 'Unknown call');
        if(active?.answered&&ws.user===active.to&&active.answerSocket!==ws&&active.answerSocket?.readyState===1){ws.send(JSON.stringify({type:'call-answered',callId:b.callId}));return;}
        if(b.kind==='sas'){if(!active.answered)fail(403,'Call not answered');rate(`sas:${ws.user}`,50);}
        if (b.kind === 'answer') {
          if(active.to!==ws.user)fail(403,'Only the recipient can answer');
          if(active.answered){if(active.answerSocket!==ws)ws.send(JSON.stringify({type:'call-answered',callId:b.callId}));return;}
          if(!related(active.to,active.from))directory.accept(active.to,active.from);
          active.answered = true;active.answerSocket=ws;active.expiresAt = Date.now()+14400000;alerts.stop(b.callId);
          // Sibling tabs share this device's identity and can all display the
          // pending offer. Only the tab that answered should keep the call UI.
          for(const sibling of sockets.get(ws.user)||[])if(sibling!==ws&&sibling.readyState===1)sibling.send(JSON.stringify({type:'call-answered',callId:b.callId}));
        }
        if (b.kind === 'hangup') { alerts.stop(b.callId);calls.delete(b.callId); emit(ws.user, {type:'call-ended',callId:b.callId}); }
        emit(target, b);
      } catch (e) { ws.send(JSON.stringify({ type: 'error', error: e.status ? e.message : 'Invalid request',...(b?.type==='signal'&&/^[a-f0-9-]{36}$/.test(b.callId)?{callId:b.callId,kind:b.kind}:{}) })); }
    });
    ws.on('close', () => {
      clearTimeout(deadline);
      if (ws.user) { const set = sockets.get(ws.user); set?.delete(ws); if (!set?.size) sockets.delete(ws.user); }
      if (ws.user && !sockets.has(ws.user)) {
        clearTimeout(disconnectTimers.get(ws.user));
        const timer = setTimeout(() => {
          disconnectTimers.delete(ws.user);
          if (sockets.has(ws.user)) return;
          for (const [id,c] of calls) if ([c.from,c.to].includes(ws.user)) {
            // A sleeping recipient must be able to return from its push alert.
            if(!c.answered&&c.to===ws.user)continue;
            alerts.stop(id);
            calls.delete(id); emit(c.from, { type:'call-expired', callId:id }); emit(c.to, { type:'call-expired', callId:id });
          }
        },options.disconnectGraceMs??180000); timer.unref();disconnectTimers.set(ws.user,timer);
      }
    });
    ws.on('error', () => {});
  });
  const cleanup = setInterval(() => {
    const now = Date.now(); store.purge(now);
    for (const [t, v] of tickets) if (v.expires < now) tickets.delete(t);
    for (const [key, v] of rates) if (v.until < now) rates.delete(key);
    for (const [id, c] of calls) if (c.expiresAt < now) { alerts.stop(id);calls.delete(id); emit(c.from, { type: 'call-expired', callId: id }); emit(c.to, { type: 'call-expired', callId: id }); }
    for(const [id,test]of alertTests)if(test.expiresAt<=now)alertTests.delete(id);
  }, 1000); cleanup.unref();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
  }, 30000); heartbeat.unref();
  return { server, store, base, close: async () => { alerts.close();extraAlerts.close();testTimers.forEach(clearTimeout);disconnectTimers.forEach(clearTimeout);clearInterval(cleanup); clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(r => server.close(r));disconnectTimers.forEach(clearTimeout); store.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 8080), host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`WebCaller Calls listening on http://${host}:${port}${app.base}/`));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
