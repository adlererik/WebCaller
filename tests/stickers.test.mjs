import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {newAttachment,validAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {validStickerCatalog,stickerDimensions} from '../public/stickers.js';
import {messageEventLifetime,applyMessageEvent} from '../public/message-state.js';
import {NO_EXPIRY} from '../public/message-lifetime.js';
import {ratchetStatement} from '../public/envelope-auth.js';
import {signApplication} from '../public/application-signatures.js';
import {secureMessaging} from '../public/secure-messaging.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/stickers/catalog.json',import.meta.url)));
test('all eight bundled packs have locally available, pinned WebP assets and no remote runtime image paths',()=>{
 assert.ok(validStickerCatalog(catalog));assert.equal(catalog.packs.length,8);let count=0;
 for(const pack of catalog.packs){assert.ok(pack.source.startsWith('https:'));for(const s of pack.stickers){
  const data=fs.readFileSync(new URL('../public/stickers/'+s.file,import.meta.url));assert.equal(data.length,s.bytes);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');assert.deepEqual(stickerDimensions(data),{width:s.width,height:s.height});assert.equal(createHash('sha256').update(data).digest('hex'),s.sha256);count++;
 }}assert.equal(count,40);
 const bad=structuredClone(catalog);bad.packs[0].stickers[0].file='https://example.com/tracker.webp';assert.equal(validStickerCatalog(bad),false);
 const traversal=structuredClone(catalog);traversal.packs[0].id='../secrets';assert.equal(validStickerCatalog(traversal),false);
});
test('sticker classification is authenticated attachment metadata and cannot label a large or non-WebP file',()=>{
 const a={...newAttachment(new File(['Synthetic'],'sample.webp',{type:'image/webp'})),sticker:true};assert.equal(validAttachment(a),true);
 for(const patch of [{sticker:false},{sticker:'true'},{type:'image/svg+xml'},{size:512*1024+1,chunks:9}])assert.equal(validAttachment({...a,...patch}),false);
 assert.equal(validAttachment(newAttachment(new File(['Normal'],'sample.webp',{type:'image/webp'}))),true);
});
test('a WebP sticker and key manifest round trip through Signal, server persistence, and authenticated image chunks',async t=>{
 const f=await fixture(t),item=catalog.packs[1].stickers[0],bytes=fs.readFileSync(new URL('../public/stickers/'+item.file,import.meta.url));
 const a={...newAttachment(new File([bytes],'Synthetic sticker.webp',{type:'image/webp'})),sticker:true};
 const envelope=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:a,text:''},3600,{perView:true});
 assert.equal(JSON.stringify(envelope).includes(a.key),false);assert.equal(JSON.stringify(envelope).includes('Synthetic sticker'),false);
 const key=await attachmentKey(a),cipher=await encryptChunk(key,a,0,envelope.expiresAt,bytes);assert.notDeepEqual(Buffer.from(cipher),bytes);
 await f.apiA('/attachments','POST',{id:a.id,size:a.size,envelope});
 const url='http://127.0.0.1:'+f.app.server.address().port+'/calls/api/attachments/'+a.id+'/chunks/0';
 assert.equal((await fetch(url,{method:'PUT',headers:{Origin:'https://example.com',Authorization:'Bearer '+f.alice.token},body:cipher})).status,201);
 await f.apiA('/messages','POST',envelope);const payload=await f.openB(envelope);assert.equal(payload.attachment.sticker,true);
 const downloaded=await (await fetch(url,{headers:{Authorization:'Bearer '+f.bob.token}})).arrayBuffer();assert.deepEqual(Buffer.from(await decryptChunk(await attachmentKey(payload.attachment),a,0,envelope.expiresAt,downloaded)),bytes);
 const corrupt=new Uint8Array(downloaded);corrupt[20]^=1;await assert.rejects(decryptChunk(key,a,0,envelope.expiresAt,corrupt));
 await f.apiB('/messages/'+envelope.id,'DELETE');assert.equal((await fetch(url,{headers:{Authorization:'Bearer '+f.bob.token}})).status,404);
});
test('emoji reactions on timed messages use the wire lifetime without changing either local countdown',async t=>{
 const f=await fixture(t),e=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'React to this timed message'},3600,{perView:true});await f.apiA('/messages','POST',e);await f.openB(e);
 const view=await f.b.markViewed(e.id),m={...e,...view,wireExpiresAt:e.expiresAt,text:'React to this timed message'};
 const {ttl,maxExpiry}=messageEventLifetime(m);assert.equal(ttl,0);assert.equal(maxExpiry,NO_EXPIRY);assert.ok(m.expiresAt<maxExpiry);
 for(const emoji of ['👍','❤️','']){
  const payload={kind:'message-reaction',target:e.id,emoji},envelope=await f.b.seal(f.bob.identity,f.bob.user.id,f.alice.user,payload,ttl),event={target:e.id,kind:'reaction',envelope};
  assert.ok(envelope.expiresAt<=maxExpiry);await f.apiB('/message-events','POST',{events:[event]});assert.equal(applyMessageEvent(m,event,await f.openA(envelope)),true);assert.equal(m.expiresAt,view.expiresAt);
 }
 assert.deepEqual(m.reactions,{});assert.ok((await f.a.messageState(e)).expiresAt<NO_EXPIRY);
});
test('data-only signaling requires authenticated Signal envelopes and accepted contacts, without creating a call',async t=>{
 const f=await fixture(t),ws=await f.socket(f.bob,f.apiB);t.after(()=>ws.close());
 const payload={kind:'sticker-link',callId:crypto.randomUUID(),action:'offer',description:{type:'offer',sdp:'Synthetic data-only SDP'}};
 const envelope=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,payload,90),incoming=once(ws,'message');
 await f.apiA('/sticker-link','POST',{envelope});const packet=JSON.parse((await incoming)[0]);assert.equal(packet.type,'sticker-link');assert.equal((await f.openB(packet.envelope)).action,'offer');
 assert.equal((await f.apiA('/calls/'+payload.callId)).state,'ended');
 await assert.rejects(f.apiA('/sticker-link','POST',{envelope:{...envelope,signature:'invalid'}}),e=>e.status===400);
 const foreign={...envelope,id:crypto.randomUUID(),to:crypto.randomUUID()};foreign.signature=await signApplication({key:f.alice.identity.sign},ratchetStatement(foreign));await assert.rejects(f.apiA('/sticker-link','POST',{envelope:foreign}),e=>e.status===400||e.status===403);
 const text=await f.sendA('Not signaling');await assert.rejects(f.apiA('/sticker-link','POST',{envelope:text}),e=>e.status===400||e.status===403);
 f.app.store.run('DELETE FROM contacts WHERE a=? AND b=?',f.alice.user.id,f.bob.user.id);await assert.rejects(f.apiA('/sticker-link','POST',{envelope}),e=>e.status===403);
});
test('recent and favorite sticker choices remain encrypted and survive secure-messaging reload',async t=>{
 const f=await fixture(t),saved={recents:['hazbin-hotel:1'],favorites:['spy-family:3']};
 await f.a.store.lock(f.alice.user.id,async db=>db.commit([await db.record('sticker-preferences',saved,{kind:'preferences'})]));
 const rows=await f.a.store.lock(f.alice.user.id,db=>db.list()),row=rows.find(r=>r.kind==='preferences');assert.ok(row.ciphertext);assert.equal(JSON.stringify(row).includes('hazbin-hotel'),false);assert.equal(JSON.stringify(row).includes('spy-family'),false);
 const reload=secureMessaging(f.optionsA);await reload.initialize(f.alice);assert.deepEqual(await reload.store.lock(f.alice.user.id,db=>db.read('sticker-preferences')),saved);
});
