import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createApp} from '../server/index.mjs';
import {newIdentity,seal as legacySeal,unb64} from '../public/crypto.js';
import {secureStore} from '../public/secure-store.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {checkContactTrust} from '../public/contact-trust.js';
import {loadOlm} from '../public/vendor/vodozemac/load.js';
import {orderedEnvelopes,olmFraming} from '../public/olm-wire.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {WebSocket} from 'ws';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function fixture(t,{before,clock=Date.now}={}){
  const app=createApp({dataDir:':memory:',env:{PUBLIC_URL:'https://example.com/calls',BOOTSTRAP_TOKEN:'synthetic-owner-code'}});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>app.close());const url='http://127.0.0.1:'+app.server.address().port+'/calls/api';
  async function request(path,method='GET',body,token){
    const response=await fetch(url+path,{method,headers:{Origin:'https://example.com',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();
    if(!response.ok)throw Object.assign(new Error(value.error),{status:response.status});return value;
  }
  const aliceIdentity=await newIdentity(),alice=await request('/register','POST',{name:'Synthetic Alice',keys:aliceIdentity.keys,setupCode:'synthetic-owner-code'});
  const invitation=await request('/invite','POST',{},alice.token),[invite,fingerprint]=new URL(invitation.url).hash.slice(8).split('.');
  const bobIdentity=await newIdentity(),bob=await request('/join','POST',{name:'Synthetic Bob',keys:bobIdentity.keys,invite,fingerprint});
  alice.identity=aliceIdentity;bob.identity=bobIdentity;alice.pins={[bob.user.id]:bob.user};bob.pins={[alice.user.id]:alice.user};
  const apiA=(p,m,b)=>request(p,m,b,alice.token),apiB=(p,m,b)=>request(p,m,b,bob.token),idbA=new IDBFactory(),idbB=new IDBFactory();
  const optionsA={api:apiA,store:secureStore({indexedDB:idbA,name:'synthetic-a',now:clock}),now:clock},optionsB={api:apiB,store:secureStore({indexedDB:idbB,name:'synthetic-b',now:clock}),now:clock};
  if(before)await before({alice,bob,apiA,apiB});
  const a=secureMessaging(optionsA),b=secureMessaging(optionsB);await a.initialize(alice);await b.initialize(bob);
  const sendA=(text,ttl=3600)=>a.seal(alice.identity,alice.user.id,bob.user,{kind:'text',text},ttl);
  const sendB=text=>b.seal(bob.identity,bob.user.id,alice.user,{kind:'text',text},3600);
  const openA=e=>a.open(alice.identity,alice.user.id,bob.user,e),openB=e=>b.open(bob.identity,bob.user.id,alice.user,e);
  async function socket(d,api){const {ticket}=await api('/ticket','POST',{}),ws=new WebSocket(url.replace('/api','/ws').replace('http:','ws:'),{origin:'https://example.com'});await once(ws,'open');const ready=once(ws,'message');ws.send(JSON.stringify({type:'auth',ticket}));await ready;return ws;}
  return {app,alice,bob,a,b,apiA,apiB,sendA,sendB,openA,openB,optionsA,optionsB,socket};
}
test('ratcheted delivery, replies and encrypted history survive reload without static self-copies',async t=>{
  const f=await fixture(t),first=await f.sendA('Synthetic secret');assert.equal(first.v,2);assert.equal(first.selfCiphertext,undefined);assert.equal(first.ephemeral,undefined);assert.ok(!JSON.stringify(first).includes('Synthetic secret'));
  await f.apiA('/messages','POST',first);assert.equal((await f.openB(first)).text,'Synthetic secret');assert.equal((await f.openA(first)).text,'Synthetic secret');
  const reply=await f.sendB('Response');assert.equal(reply.ratchet.sessionId,first.ratchet.sessionId);assert.equal((await f.openA(reply)).text,'Response');
  const a=secureMessaging(f.optionsA),b=secureMessaging(f.optionsB);await a.initialize(f.alice);await b.initialize(f.bob);
  assert.equal((await a.open(f.alice.identity,f.alice.user.id,f.bob.user,first)).text,'Synthetic secret');assert.equal((await b.open(f.bob.identity,f.bob.user.id,f.alice.user,first)).text,'Synthetic secret');
  const next=await a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'After reload'},3600);assert.equal((await b.open(f.bob.identity,f.bob.user.id,f.alice.user,next)).text,'After reload');
  const rows=await f.a.store.lock(f.alice.user.id,db=>db.list());assert.ok(!JSON.stringify(rows).includes('Synthetic secret'));assert.equal(rows.find(r=>r.kind==='meta').key.extractable,false);
});
test('dropped and reordered packets, duplicate hydration and tampering do not desynchronize sessions',async t=>{
  const f=await fixture(t),packets=[];for(let i=0;i<6;i++)packets.push(await f.sendA('Message '+i));
  assert.equal((await f.openB(packets[4])).text,'Message 4');assert.equal((await f.openB(packets[0])).text,'Message 0');assert.equal((await f.openB(packets[3])).text,'Message 3');assert.equal((await f.openB(packets[4])).text,'Message 4');
  for(const patch of [{expiresAt:packets[5].expiresAt+1},{ratchet:{...packets[5].ratchet,data:'AAAA'}},{to:crypto.randomUUID()}])await assert.rejects(f.openB({...packets[5],...patch}));
  assert.equal((await f.openB(packets[5])).text,'Message 5');assert.equal((await f.openA(await f.sendB('Still works'))).text,'Still works');
});
test('two tabs send concurrently with atomic state, and simultaneous first sends converge',async t=>{
  const f=await fixture(t),secondTab=secureMessaging(f.optionsA);await secondTab.initialize(f.alice);
  const packets=await Promise.all(Array.from({length:8},(_,i)=>(i%2?secondTab:f.a).seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Concurrent '+i},3600)));
  assert.equal(new Set(packets.map(e=>e.ratchet.sessionId)).size,1);for(const e of packets.reverse())assert.match((await f.openB(e)).text,/Concurrent/);
  const g=await fixture(t),[left,right]=await Promise.all([g.sendA('First A'),g.sendB('First B')]);await Promise.all([g.openA(right),g.openB(left)]);
  const [laterA,laterB]=await Promise.all([g.sendA('Next A'),g.sendB('Next B')]);assert.equal(laterA.ratchet.sessionId,laterB.ratchet.sessionId);assert.equal((await g.openA(laterB)).text,'Next B');assert.equal((await g.openB(laterA)).text,'Next A');
});
test('only pre-upgrade legacy envelopes are readable; new traffic cannot downgrade',async t=>{
  let old;
  const f=await fixture(t,{before:async({alice,bob,apiA})=>{old=await legacySeal(alice.identity,alice.user.id,bob.user,{kind:'text',text:'Before upgrade'},3600);await apiA('/messages','POST',old);}});
  assert.equal((await f.openB(old)).text,'Before upgrade');assert.equal((await f.openA(old)).text,'Before upgrade');
  const forged=await legacySeal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Legacy after upgrade'},3600);
  await assert.rejects(f.openB(forged),/old encryption format/);await assert.rejects(f.apiA('/messages','POST',forged),e=>e.status===426);
  await assert.rejects(f.openB({...old,id:crypto.randomUUID()}),/old encryption format/);
});
test('deletion and expiry remove sealed history and prevent replay on reopen',async t=>{
  let timestamp=Date.now();const f=await fixture(t,{clock:()=>timestamp}),e=await f.sendA('Delete me');await f.openB(e);await f.b.remove(e.id,e.expiresAt);await assert.rejects(f.openB(e),/deleted/);
  const expiring=await f.sendA('Expire me',1);await f.openB(expiring);timestamp+=1500;await f.b.purge();await assert.rejects(f.openB(expiring),/Expired/);
  const rows=await f.b.store.lock(f.bob.user.id,db=>db.list());assert.ok(!rows.some(r=>r.id.endsWith('history/'+expiring.id)));assert.equal((await f.openB(await f.sendA('Still synchronized'))).text,'Still synchronized');
});
test('a removed/reintroduced contact cannot replace its identity pin, including another tab',async t=>{
  const f=await fixture(t),changed={...f.bob.user,keys:(await newIdentity()).keys};await f.a.forgetPeer(f.bob.user.id);delete f.alice.pins[f.bob.user.id];
  await assert.rejects(checkContactTrust(f.a.store,f.alice.user.id,changed),/Device keys changed/);
  const tab=secureMessaging(f.optionsA);await tab.initialize(f.alice);await assert.rejects(tab.seal(f.alice.identity,f.alice.user.id,changed,{kind:'text',text:'Blocked'},60),/Device keys changed/);
  assert.equal((await f.openB(await f.sendA('Same trusted identity'))).text,'Same trusted identity');
});
test('signed prekeys are one-use, cannot be resurrected by publishing retries, and require a contact',async t=>{
  const f=await fixture(t),first=await f.apiA('/ratchet/claim/'+f.bob.user.id,'POST',{}),second=await f.apiA('/ratchet/claim/'+f.bob.user.id,'POST',{});assert.notEqual(first.prekey.id,second.prekey.id);
  await f.b.publish();assert.equal(f.app.store.get('SELECT claimed FROM ratchet_prekeys WHERE owner=? AND id=?',f.bob.user.id,first.prekey.id).claimed,1);
  await assert.rejects(f.apiA('/ratchet/claim/'+crypto.randomUUID(),'POST',{}),e=>e.status===403);
  await assert.rejects(f.apiB('/ratchet/publish','POST',{v:2,identity:first.identity,signature:'AAAA',keys:[]}),e=>e.status===400);
});
test('attachments, edits, receipts and short-lived call offers reopen through the ratchet',async t=>{
  const f=await fixture(t),file=new File(['Synthetic media'],'photo.png',{type:'image/png'}),attachment=newAttachment(file),payload={kind:'attachment',text:'Photo',attachment};
  const e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,payload,3600),key=await attachmentKey(attachment),cipher=await encryptChunk(key,attachment,0,e.expiresAt,await file.arrayBuffer());
  await f.apiA('/attachments','POST',{id:attachment.id,size:attachment.size,envelope:e});const received=await f.openB(e);assert.deepEqual(new Uint8Array(await decryptChunk(await attachmentKey(received.attachment),received.attachment,0,e.expiresAt,cipher)),new Uint8Array(await file.arrayBuffer()));
  const edit=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'message-edit',target:e.id,text:'New caption'},3600);assert.equal((await f.openB(edit)).text,'New caption');assert.equal((await f.openA(edit)).text,'New caption');
  const receipt=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'message-read',target:e.id,at:Date.now()},3600);assert.equal((await f.openA(receipt)).kind,'message-read');
  const offer=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId:crypto.randomUUID(),description:{type:'offer',sdp:'synthetic SDP'}},90);assert.equal((await f.openB(offer)).description.sdp,'synthetic SDP');assert.equal((await f.openB(offer)).description.sdp,'synthetic SDP');
});
test('discarded transport message keys cannot decrypt earlier packets from current Olm state',async()=>{
  const O=await loadOlm(),a=new O.Account(),b=new O.Account();b.generate_one_time_keys(1);const key=[...b.one_time_keys.values()][0],s=a.create_outbound_session(b.curve25519_key,key,O.SessionConfigVersion.V2),first=s.encrypt('Old transport message'),result=b.create_inbound_session(a.curve25519_key,first),r=result.session;
  const reply=r.encrypt('Ratchet reply');assert.equal(s.decrypt(reply),'Ratchet reply');const next=s.encrypt('Next round');assert.equal(r.decrypt(next),'Next round');
  const pickleKey=crypto.getRandomValues(new Uint8Array(32)),copy=O.Session.from_pickle(r.pickle(pickleKey),pickleKey);assert.throws(()=>copy.decrypt(first));
  copy.free();next.free();reply.free();r.free();result.free();first.free();s.free();a.free();b.free();
});
test('a slow attachment stays decryptable after many later messages; new calls have independent sessions',async t=>{
  const f=await fixture(t),file=new File(['Late upload'],'late.png',{type:'image/png'}),attachment=newAttachment(file),late=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment},3600);
  for(let i=0;i<55;i++)assert.equal((await f.openB(await f.sendA('Later '+i))).text,'Later '+i);
  assert.equal((await f.openB(late)).attachment.id,attachment.id);
  const first=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId:crypto.randomUUID()},90),second=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId:crypto.randomUUID()},90);
  assert.notEqual(first.ratchet.sessionId,second.ratchet.sessionId);assert.equal((await f.openB(second)).kind,'offer');
});
test('hydration orders public chain counters and rejects truncated-authentication Olm v1',async t=>{
  const f=await fixture(t),packets=[];for(let i=0;i<45;i++)packets.push(await f.sendA('Ordered '+i));
  for(const e of orderedEnvelopes(packets.reverse()))assert.match((await f.openB(e)).text,/Ordered/);
  const O=await loadOlm(),a=new O.Account(),b=new O.Account();b.generate_one_time_keys(1);const s=a.create_outbound_session(b.curve25519_key,[...b.one_time_keys.values()][0],O.SessionConfigVersion.V1),m=s.encrypt('old version');
  assert.throws(()=>olmFraming({type:m.message_type,data:Buffer.from(m.ciphertext).toString('base64url')}),/full-authentication/);m.free();s.free();a.free();b.free();
});
test('ratcheted offer, answer and ICE pass through authenticated WebSocket signaling',async t=>{
  const f=await fixture(t),a=await f.socket(f.alice,f.apiA),b=await f.socket(f.bob,f.apiB),callId=crypto.randomUUID();
  const offer=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId,description:{type:'offer',sdp:'Synthetic audio/video SDP'},video:true},90),arrived=once(b,'message');a.send(JSON.stringify({type:'signal',kind:'offer',callId,envelope:offer}));const incoming=JSON.parse((await arrived)[0]);assert.equal((await f.openB(incoming.envelope)).description.sdp,'Synthetic audio/video SDP');
  const answer=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'answer',callId,description:{type:'answer',sdp:'Synthetic answer'}},120),returned=once(a,'message');b.send(JSON.stringify({type:'signal',kind:'answer',callId,envelope:answer}));assert.equal((await f.openA(JSON.parse((await returned)[0]).envelope)).kind,'answer');
  const ice=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'ice',callId,candidate:{candidate:'synthetic candidate'}},120),candidate=once(b,'message');a.send(JSON.stringify({type:'signal',kind:'ice',callId,envelope:ice}));assert.equal((await f.openB(JSON.parse((await candidate)[0]).envelope)).candidate.candidate,'synthetic candidate');a.close();b.close();
});
test('a delayed file key request cannot hold up an established call signaling stream',async t=>{
  const f=await fixture(t),callId=crypto.randomUUID(),offer=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'offer',callId},90);await f.openB(offer);
  const answer=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'answer',callId},120);await f.openA(answer);
  let block=false,release,started;const gate=new Promise(r=>{release=r;}),entered=new Promise(r=>{started=r;}),slow=secureMessaging({...f.optionsA,api:async(p,m,b)=>{if(block&&p.startsWith('/ratchet/claim/')){started();await gate;}return f.apiA(p,m,b);}});await slow.initialize(f.alice);block=true;
  const file=new File(['Synthetic delayed file'],'slow.txt'),pending=slow.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:newAttachment(file)},3600);await entered;
  try{const ice=await Promise.race([f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'ice',callId,candidate:{}},120),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Call signaling blocked by file request')),750))]);assert.equal((await f.openB(ice)).kind,'ice');}finally{release();await pending;}
});
test('an expired lease is fenced off, and replacement state stays intact',async()=>{
  let timestamp=Date.now();const store=secureStore({indexedDB:new IDBFactory(),name:'lease-recovery',now:()=>timestamp});
  await store.lock('owner',async stale=>{const row=await stale.record('stale',{value:'must not commit'},{kind:'test'});timestamp+=11000;await store.lock('owner',async current=>{await current.commit([await current.record('current',{value:'replacement'},{kind:'test'})]);});await assert.rejects(stale.commit([row]));});
  await store.lock('owner',async db=>{assert.equal(await db.read('stale'),null);assert.equal((await db.read('current')).value,'replacement');});
});
test('pinned vendor files match their provenance checksums and WASM is served with its proper MIME type',async t=>{
  const root=new URL('../public/vendor/vodozemac/',import.meta.url),manifest=JSON.parse(await readFile(new URL('provenance.json',root),'utf8'));
  for(const [name,expected]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(new URL(name,root))).digest('hex'),expected,name);
  const f=await fixture(t),address=f.app.server.address(),r=await fetch(`http://127.0.0.1:${address.port}/calls/vendor/vodozemac/pkg/vodozemac_bg.wasm`);
  assert.equal(r.headers.get('content-type'),'application/wasm');assert.equal(r.headers.get('content-encoding'),'gzip');assert.equal(createHash('sha256').update(new Uint8Array(await r.arrayBuffer())).digest('hex'),manifest.files['pkg/vodozemac_bg.wasm']);
});
