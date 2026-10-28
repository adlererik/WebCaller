import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {fixture} from './helpers/ratchet-fixture.mjs';
import {newAttachment,attachmentKey,encryptChunk,decryptChunk} from '../public/attachments.js';
import {secureMessaging} from '../public/secure-messaging.js';
import {loadSignal} from '../public/signal-core.js';
import {b64} from '../public/crypto.js';
import {envelopeHeader,ratchetStatement} from '../public/envelope-auth.js';
import {signApplication} from '../public/application-signatures.js';

async function exhaust(f){
 const count=(await f.apiB('/ratchet/status')).available;
 for(let i=0;i<count;i++)await f.apiA('/ratchet/claim/'+f.bob.user.id,'POST',{});
 assert.equal((await f.apiB('/ratchet/status')).available,0);
}
const sticker=()=>({...newAttachment(new File(['Synthetic WebP payload'],'sticker.webp',{type:'image/webp'})),sticker:true});

test('an offline recipient with no unused prekeys can still receive a burst of stickers through the established chat ratchet',async t=>{
 const f=await fixture(t),first=await f.sendA('Chat already works');await f.openB(first);
 await f.openA(await f.sendB('Reply'));await exhaust(f);
 let claims=0;const sender=secureMessaging({...f.optionsA,api:(p,...args)=>{if(p.startsWith('/ratchet/claim/'))claims++;return f.apiA(p,...args);}});await sender.initialize(f.alice);
 const packets=[];
 for(let i=0;i<40;i++){
  const attachment=sticker(),e=await sender.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment,text:''},i%2?3600:0,{perView:true});
  assert.equal(e.ratchet.lane,'chat');assert.equal(e.ratchet.scope,'chat');assert.equal(e.ratchet.sessionId,first.ratchet.sessionId);packets.push(e);
 }
 assert.equal(claims,0);assert.equal((await f.apiB('/ratchet/status')).available,0);
 // The encrypted store fallback must also accept an existing-chat manifest
 // while the recipient has no spare one-time keys and no data channel.
 const queued=packets[0],payload=await sender.open(f.alice.identity,f.alice.user.id,f.bob.user,queued),key=await attachmentKey(payload.attachment),bytes=new TextEncoder().encode('Synthetic WebP payload');
 const cipher=await encryptChunk(key,payload.attachment,0,queued.expiresAt,bytes);
 await f.apiA('/attachments','POST',{id:payload.attachment.id,size:payload.attachment.size,envelope:queued});
 const url='http://127.0.0.1:'+f.app.server.address().port+'/calls/api/attachments/'+payload.attachment.id+'/chunks/0';
 assert.equal((await fetch(url,{method:'PUT',headers:{Origin:'https://example.com',Authorization:'Bearer '+f.alice.token},body:cipher})).status,201);
 await f.apiA('/messages','POST',queued);assert.ok((await f.apiB('/messages')).some(e=>e.id===queued.id));
 const downloaded=await (await fetch(url,{headers:{Authorization:'Bearer '+f.bob.token}})).arrayBuffer();
 assert.deepEqual(new Uint8Array(await decryptChunk(key,payload.attachment,0,queued.expiresAt,downloaded)),bytes);

 // Deliver the latest first, then older ones, just as direct/store delivery may race.
 for(const e of packets.reverse()){
  const payload=await f.openB(e);assert.equal(payload.attachment.sticker,true);
  const key=await attachmentKey(payload.attachment),bytes=new TextEncoder().encode('Synthetic WebP payload'),cipher=await encryptChunk(key,payload.attachment,0,e.expiresAt,bytes);
  assert.deepEqual(new Uint8Array(await decryptChunk(key,payload.attachment,0,e.expiresAt,cipher)),bytes);
 }
 const receiver=secureMessaging(f.optionsB);await receiver.initialize(f.bob);
 assert.equal((await receiver.open(f.bob.identity,f.bob.user.id,f.alice.user,packets[0])).attachment.sticker,true);
 const next=await sender.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'text',text:'Text still works'},3600);assert.equal((await f.openB(next)).text,'Text still works');
});

test('sticker connection and transfer controls reuse their own ratchets across new attempts and files',async t=>{
 const f=await fixture(t),callId=crypto.randomUUID(),target=crypto.randomUUID();
 const control=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'sticker-link',callId,action:'offer'},90);await f.openB(control);
 const transfer=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'transfer',target,percent:1},20);await f.openB(transfer);
 await exhaust(f);
 for(let i=0;i<6;i++){
  const link=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'sticker-link',callId:crypto.randomUUID(),action:'offer'},90);
  assert.equal(link.ratchet.sessionId,control.ratchet.sessionId);assert.equal(link.ratchet.scope,'sticker-link');assert.equal((await f.openB(link)).action,'offer');
  const progress=await f.a.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'transfer',target:crypto.randomUUID(),percent:2},20);
  assert.equal(progress.ratchet.sessionId,transfer.ratchet.sessionId);assert.equal(progress.ratchet.scope,'transfer');assert.equal((await f.openB(progress)).percent,2);
 }
});

// Construct the old signed format using the same official core. No legacy mode
// is exposed to production callers just to manufacture test packets.
async function legacy(f,payload,lane,scope){
 const O=await loadSignal(),bundle=await f.apiA('/ratchet/claim/'+f.bob.user.id,'POST',{}),data=await f.a.store.lock(f.alice.user.id,db=>db.read('account')),account=O.Account.from_state(data.signal);
 const session=account.create_outbound_session(bundle.identity,bundle.prekey.key),time=Date.now(),e={v:2,id:crypto.randomUUID(),from:f.alice.user.id,to:f.bob.user.id,createdAt:time,expiresAt:time+60000};scope ||= e.id;
 const message=session.encrypt(JSON.stringify({header:envelopeHeader(e),payload}));
 try{
  e.ratchet={protocol:'signal-pqxdh-v1',lane,scope,sessionId:session.session_id,identity:account.curve25519_key,recipientIdentity:bundle.identity,type:message.message_type,data:b64(message.ciphertext),prekeyId:bundle.prekey.id};
  e.signature=await signApplication({key:f.alice.identity.sign},ratchetStatement(e));return e;
 }finally{message.free();session.free();account.free();}
}
test('old per-file stickers and per-attempt controls remain readable; non-sticker attachments cannot masquerade as chat',async t=>{
 const f=await fixture(t),attachment=sticker(),old=await legacy(f,{kind:'attachment',attachment},'files');assert.equal((await f.openB(old)).attachment.id,attachment.id);
 const callId=crypto.randomUUID(),link=await legacy(f,{kind:'sticker-link',callId,action:'offer'},'signal',callId);assert.equal((await f.openB(link)).callId,callId);
 const target=crypto.randomUUID(),progress=await legacy(f,{kind:'transfer',target,percent:1},'transfer',target);assert.equal((await f.openB(progress)).target,target);
 const ordinary=newAttachment(new File(['File'],'normal.txt'));
 const bad=await legacy(f,{kind:'attachment',attachment:ordinary},'chat','chat'),before=await f.b.store.lock(f.bob.user.id,db=>db.read('account'));
 await assert.rejects(f.openB(bad),/authenticated message context/);
 assert.deepEqual(await f.b.store.lock(f.bob.user.id,db=>db.read('account')),before);
});

test('missed publication automatically retries without replacing an identity or reviving a claimed key',async t=>{
 const f=await fixture(t);let offline=false,failed=0,successful=0;
 const device=secureMessaging({...f.optionsB,api:async(p,...args)=>{
  if(offline&&p==='/ratchet/publish'){if(!failed++){throw new TypeError('Synthetic connection loss');}successful++;}
  return f.apiB(p,...args);
 }});await device.initialize(f.bob);await exhaust(f);
 const before=f.app.store.get('SELECT identity FROM ratchet_accounts WHERE owner=?',f.bob.user.id).identity;
 offline=true;device.refresh();device.refresh();
 for(let i=0;i<80&&!successful;i++)await pause(50);
 assert.ok(failed>=1&&successful>=1,'publication retries automatically');
 assert.ok((await f.apiB('/ratchet/status')).available>0);
 assert.equal(f.app.store.get('SELECT identity FROM ratchet_accounts WHERE owner=?',f.bob.user.id).identity,before);
 assert.equal(f.app.store.get('SELECT COUNT(*) n FROM ratchet_prekeys WHERE owner=? AND claimed=1',f.bob.user.id).n,24);
});

test('a genuinely new chat without starter material fails closed with a plain reconnect message',async t=>{
 const f=await fixture(t);await exhaust(f);
 let retries=0;const sender=secureMessaging({...f.optionsA,api:(p,...args)=>{
  if(p.startsWith('/ratchet/claim/')){retries++;throw Object.assign(new Error('Technical server key message'),{status:426});}
  return f.apiA(p,...args);
 }});await sender.initialize(f.alice);
 await assert.rejects(sender.seal(f.alice.identity,f.alice.user.id,f.bob.user,{kind:'attachment',attachment:sticker()},3600),e=>e.status===426&&e.message==='Waiting for their phone to reconnect. Please try again shortly.');
 assert.equal(retries,1);assert.equal(await sender.store.lock(f.alice.user.id,db=>db.read('preferred/'+f.bob.user.id+'/chat/chat')),null);
});
