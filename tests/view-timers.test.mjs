import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {secureMessaging} from '../public/secure-messaging.js';
import {NO_EXPIRY,validLifetime,MAX_MESSAGE_SECONDS} from '../public/message-lifetime.js';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {mediaCache} from '../public/media-cache.js';
import {IDBFactory} from 'fake-indexeddb';
import {ratchetStatement,envelopeHeader} from '../public/envelope-auth.js';
import {signApplication} from '../public/application-signatures.js';
const send=(f,text='Synthetic timed message',seconds=30)=>f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text},seconds,{perView:true});
const postRead=(f,e)=>f.apiB('/message-events','POST',{events:[{target:e.lifetime.target,kind:'read',envelope:e}]});
async function sign(f,e){e.signature=await signApplication({key:f.bob.identity.sign},ratchetStatement(e));return e;}
test('v3 authenticates the per-view policy while v2 framing stays unchanged',async t=>{
 const f=await fixture(t),e=await send(f);assert.equal(e.v,3);assert.deepEqual(e.lifetime,{mode:'after-view',seconds:30});assert.equal(e.expiresAt,NO_EXPIRY);assert.ok(validLifetime(e));
 await f.apiA('/messages','POST',e);assert.equal((await f.openB(e)).text,'Synthetic timed message');
 const bad={...e,lifetime:{...e.lifetime,seconds:60}};await assert.rejects(f.openB(bad),/signature|conflict/i);await assert.rejects(f.apiA('/messages','POST',bad),error=>error.status===400);
 for(const patch of [{seconds:0},{seconds:MAX_MESSAGE_SECONDS+1},{seconds:1.5},{seconds:30,unexpected:true}])assert.equal(validLifetime({...e,lifetime:{mode:'after-view',...patch}}),false);
 assert.equal(validLifetime({...e,ratchet:{...e.ratchet,lane:'signal'}}),false);assert.equal(validLifetime(e,true),false);
 const off=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Off'},0,{perView:true});assert.equal(off.v,2);assert.equal(off.lifetime,undefined);
 const old=await f.sendA('Existing v2',60);assert.equal(old.v,2);assert.equal(envelopeHeader(old),JSON.stringify({v:old.v,id:old.id,from:old.from,to:old.to,createdAt:old.createdAt,expiresAt:old.expiresAt}));assert.equal((await f.openB(old)).text,'Existing v2');
});
test('sender expiry leaves the unread recipient copy; first viewing starts a full independent countdown',async t=>{
 let time=Date.now();t.mock.method(Date,'now',()=>time);const f=await fixture(t,{clock:()=>time}),e=await send(f,'Read me later',1);await f.apiA('/messages','POST',e);
 time=e.createdAt+1100;await f.a.purge();
 assert.equal((await f.apiA('/messages')).some(x=>x.id===e.id),false);assert.equal((await f.apiB('/messages')).some(x=>x.id===e.id),true);assert.equal((await f.a.messageState(e)).expiresAt,0);
 assert.equal((await f.openB(e)).text,'Read me later');assert.equal((await f.b.messageState(e)).expiresAt,NO_EXPIRY);
 const viewed=await f.b.markViewed(e.id);assert.ok(viewed.viewedAt>e.createdAt+1000);assert.equal(viewed.expiresAt,viewed.viewedAt+1000);
 const reopened=secureMessaging(f.optionsB);await reopened.initialize(f.bob);assert.deepEqual(await reopened.markViewed(e.id),viewed);assert.equal((await reopened.open(f.bob.identity,f.bob.user.id,f.alice.user,e)).text,'Read me later');
 const pending=await reopened.pendingViews(),receipt=await reopened.viewReceipt(pending[0],f.alice.user);assert.equal(receipt.v,3);assert.equal(receipt.lifetime.startedAt,viewed.viewedAt);
 await postRead(f,receipt);await reopened.ackView(e.id,receipt.id);await postRead(f,receipt);assert.equal(f.app.store.get('SELECT recipient_expires FROM message_views WHERE message_id=?',e.id).recipient_expires,viewed.expiresAt);
 time=viewed.expiresAt+100;f.app.store.purge();await reopened.purge();assert.equal((await f.apiB('/messages')).some(x=>x.id===e.id),false);assert.equal((await reopened.messageState(e)).expiresAt,0);
 await assert.rejects(f.apiA('/messages','POST',e),error=>error.status===410);assert.equal(f.app.store.get('SELECT expires FROM message_deletions WHERE id=?',e.id).expires,NO_EXPIRY);
});
test('the first-view clock cannot be restarted by a fresh signed receipt or by another tab',async t=>{
 const f=await fixture(t),e=await send(f);await f.apiA('/messages','POST',e);await f.openB(e);
 const tab=secureMessaging(f.optionsB);await tab.initialize(f.bob);const [a,b]=await Promise.all([f.b.markViewed(e.id),tab.markViewed(e.id)]);assert.equal(a.viewedAt,b.viewedAt);
 const value=(await f.b.pendingViews())[0],[one,two]=await Promise.all([f.b.viewReceipt(value,f.alice.user),tab.viewReceipt(value,f.alice.user)]);assert.equal(one.id,two.id);assert.deepEqual(one,two);
 await postRead(f,one);const changed=await sign(f,{...one,id:crypto.randomUUID(),createdAt:one.createdAt+5,lifetime:{...one.lifetime,startedAt:one.lifetime.startedAt+1}});await assert.rejects(postRead(f,changed),error=>error.status===409);
 const sender=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'message-read',target:e.id,deliveredAt:Date.now(),readAt:Date.now()},0);await assert.rejects(f.apiA('/message-events','POST',{events:[{target:e.id,kind:'read',envelope:sender}]}),error=>error.status===403);
 const unsigned={...one,id:crypto.randomUUID(),lifetime:{...one.lifetime,startedAt:one.lifetime.startedAt+2}};await assert.rejects(postRead(f,unsigned),error=>error.status===400);
});
test('read-start metadata and exactly the same signed ciphertext retry after expiry/reload without message history',async t=>{
 const f=await fixture(t),e=await send(f,'Erase this plaintext',1);await f.apiA('/messages','POST',e);await f.openB(e);const viewed=await f.b.markViewed(e.id),value=(await f.b.pendingViews())[0],receipt=await f.b.viewReceipt(value,f.alice.user);
 await sleep(Math.max(1,viewed.expiresAt+100-Date.now()));await f.b.purge();const reload=secureMessaging(f.optionsB);await reload.initialize(f.bob);
 const rows=await reload.store.lock(f.bob.user.id,db=>db.list());assert.equal(rows.some(r=>r.id===f.bob.user.id+':history/'+e.id),false);assert.equal((await reload.messageState(e)).expiresAt,viewed.expiresAt);
 const retried=await reload.viewReceipt((await reload.pendingViews())[0],f.alice.user);assert.deepEqual(retried,receipt);
 await postRead(f,retried);await reload.ackView(e.id,retried.id);await reload.purge();f.app.store.purge();assert.equal((await reload.pendingViews()).length,0);assert.equal((await reload.messageState(e)).expiresAt,0);assert.equal(f.app.store.get('SELECT id FROM messages WHERE id=?',e.id),undefined);
 const after=await reload.store.lock(f.bob.user.id,db=>db.list());assert.equal(after.some(r=>r.kind==='lifetime'||r.kind==='view-outbox'),false);assert.ok(after.some(r=>r.kind==='deleted'));
});
test('a view can be acknowledged after expiry even when suspension happened before sealing its receipt',async t=>{
 const f=await fixture(t),e=await send(f,'Suspend before send',1);await f.apiA('/messages','POST',e);await f.openB(e);const viewed=await f.b.markViewed(e.id);
 await sleep(Math.max(1,viewed.expiresAt+100-Date.now()));await f.b.purge();const reload=secureMessaging(f.optionsB);await reload.initialize(f.bob);const receipt=await reload.viewReceipt((await reload.pendingViews())[0],f.alice.user);await postRead(f,receipt);await reload.ackView(e.id,receipt.id);await reload.purge();f.app.store.purge();assert.equal(f.app.store.get('SELECT id FROM messages WHERE id=?',e.id),undefined);
});
test('new attachment AAD stays immutable while cached ciphertext adopts the recipient deadline without downloading again',async t=>{
 const f=await fixture(t),a=newAttachment(new File(['Synthetic media'],'media.txt',{type:'text/plain'})),e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:a},30,{perView:true}),key=await attachmentKey(a),cipher=await encryptChunk(key,a,0,e.expiresAt,new TextEncoder().encode('Synthetic media'));
 await f.openB(e);const cache=mediaCache({indexedDB:new IDBFactory(),name:'view-media'}),m={...e,wireExpiresAt:e.expiresAt,lifetime:e.lifetime};assert.ok(await cache.put(f.bob.user.id,m,a,[cipher]));
 const view=await f.b.markViewed(e.id);Object.assign(m,view);await cache.startTimer(f.bob.user.id,m);const chunks=await cache.get(f.bob.user.id,m,a);assert.equal(chunks.length,1);assert.equal(new TextDecoder().decode(await decryptChunk(key,a,0,m.wireExpiresAt,chunks[0])),'Synthetic media');await assert.rejects(decryptChunk(key,a,0,m.expiresAt,chunks[0]));
 await cache.remove(f.bob.user.id,m.id,m.wireExpiresAt);assert.equal(await cache.get(f.bob.user.id,m,a),null);
});
test('old signed read-start ciphertext can retry more than five minutes later and still clean up the server',async t=>{
 let clock=Date.now()-600000;const f=await fixture(t,{clock:()=>clock}),e=await send(f,'Synthetic offline message',30);
 // Seed the already accepted old packet instead of waiting ten real minutes.
 f.app.store.run('INSERT INTO messages VALUES(?,?,?,?,?,?)',e.id,e.from,e.to,e.expiresAt,e.createdAt,JSON.stringify(e));f.app.store.run('INSERT INTO message_views VALUES(?,?,?,0)',e.id,30,e.createdAt+30000);
 await f.openB(e);clock+=240000;await f.b.markViewed(e.id);const receipt=await f.b.viewReceipt((await f.b.pendingViews())[0],f.alice.user);assert.ok(Date.now()-receipt.createdAt>300000);
 clock=Date.now();await f.b.purge();await postRead(f,receipt);await f.b.ackView(e.id,receipt.id);f.app.store.purge();assert.equal(f.app.store.get('SELECT id FROM messages WHERE id=?',e.id),undefined);
});
test('expired-target update echoes consume transport without restoring plaintext or breaking later events',async t=>{
 let clock=Date.now();const f=await fixture(t,{clock:()=>clock}),e=await send(f,'Short original',1);await f.openB(e);await f.b.markViewed(e.id);clock+=2000;await f.a.purge();
 const value=(await f.b.pendingViews())[0],receipt=await f.b.viewReceipt(value,f.alice.user),once=await f.openA(receipt),twice=await f.openA(receipt);assert.equal(once.kind,'message-read');assert.equal(twice.kind,'message-expired');assert.equal(twice.target,e.id);
 assert.equal((await f.b.open(f.bob.identity,f.bob.user.id,f.alice.user,receipt)).kind,'message-expired');
 const later=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,{kind:'message-reaction',target:crypto.randomUUID(),emoji:'👍'},60);assert.equal((await f.openA(later)).emoji,'👍');
});
test('unread timed files remain downloadable only for the recipient after the sender timer ends',async t=>{
 const f=await fixture(t),file=new File(['Synthetic shared file'],'sample.txt',{type:'text/plain'}),a=newAttachment(file),e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:a},1,{perView:true}),key=await attachmentKey(a),cipher=await encryptChunk(key,a,0,e.expiresAt,await file.arrayBuffer());
 await f.apiA('/attachments','POST',{id:a.id,size:a.size,envelope:e});const address='http://127.0.0.1:'+f.app.server.address().port+'/calls/api/attachments/'+a.id+'/chunks/0';
 assert.equal((await fetch(address,{method:'PUT',headers:{Origin:'https://example.com',Authorization:'Bearer '+f.alice.token},body:cipher})).status,201);await f.apiA('/messages','POST',e);
 await sleep(Math.max(1,e.createdAt+1100-Date.now()));assert.equal((await fetch(address,{headers:{Authorization:'Bearer '+f.alice.token}})).status,404);
 const response=await fetch(address,{headers:{Authorization:'Bearer '+f.bob.token}});assert.equal(response.status,200);assert.equal(new TextDecoder().decode(await decryptChunk(key,a,0,e.expiresAt,await response.arrayBuffer())),await file.text());
 await f.openB(e);await f.b.markViewed(e.id);const receipt=await f.b.viewReceipt((await f.b.pendingViews())[0],f.alice.user);await postRead(f,receipt);const expires=f.app.store.get('SELECT expires FROM messages WHERE id=?',e.id).expires;assert.equal(f.app.store.get('SELECT expires FROM attachments WHERE id=?',a.id).expires,expires);
 await f.apiB('/messages/'+e.id,'DELETE');assert.equal(f.app.store.get('SELECT message_id FROM message_views WHERE message_id=?',e.id),undefined);assert.equal((await fetch(address,{headers:{Authorization:'Bearer '+f.bob.token}})).status,404);assert.equal(f.app.store.get('SELECT expires FROM message_deletions WHERE id=?',e.id).expires,NO_EXPIRY);
});
